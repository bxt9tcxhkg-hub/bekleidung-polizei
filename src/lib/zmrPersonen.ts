// Statischer Import statt dynamischem `import(...?url)` - Vites
// dokumentiertes Standardmuster für pdf.js-Worker-URLs, sodass sie beim
// Build garantiert zur selben gehashten Asset-Datei wie im Bundle-Manifest
// aufgelöst wird.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export const LISTENARTEN = ['haus', 'kontrolle', 'evakuierung', 'befragung'] as const
export type Listenart = (typeof LISTENARTEN)[number]

export const LISTENART_LABEL: Record<Listenart, string> = {
  haus: 'Haus / Bewohner',
  kontrolle: 'Kontrolle',
  evakuierung: 'Evakuierung',
  befragung: 'Befragung',
}

export const LISTENART_SPALTEN: Record<Listenart, string> = {
  haus: 'Wohnung · Name · geboren',
  kontrolle: 'Name · kontrolliert ja/nein',
  evakuierung: 'Name · im Haus / draußen / unbekannt',
  befragung: 'Name · befragt ja/nein',
}

export type PersonenStatus = 'offen' | 'erledigt' | 'im_haus' | 'draussen' | 'unbekannt'

export interface EinsatzPerson {
  id: string
  name: string
  geboren?: string
  wohnung?: string
  status: PersonenStatus
}

const SKIP = /^(zmr|auszug|meldeamt|gemeinde|stadt|dornbirn|straße|strasse|gasse|platz|wohnung|top|stiege|stock|geburtsdatum|geboren|geschlecht|männlich|weiblich|familienstand|staatsangehörigkeit|österreich|seite|stand)$/i

/**
 * Textextraktion über pdf.js statt eines selbstgebauten PDF-Parsers - ein
 * früherer Eigenbau (Regex über Tj/TJ-Operatoren) scheiterte an zwei
 * unabhängigen Stellen: komprimierte Textströme wurden über TextEncoder
 * (UTF-8) statt Byte-für-Byte zurückkodiert, was die Rohdaten vor dem
 * Entpacken zerstörte; und PDFs mit eingebetteten Schriftarten (z. B. "Als
 * PDF drucken" aus Chrome, Skia/PDF) speichern Text als Font-interne
 * Glyph-IDs, deren Rückübersetzung eine Schriftart-Zuordnungstabelle
 * (ToUnicode-CMap) braucht - das leistet nur eine echte PDF-Bibliothek.
 * hasEOL (pdf.js liefert das je Textelement) rekonstruiert Zeilenumbrüche,
 * ohne die für personenAusText() nötige Zeilenstruktur zu verlieren.
 */
export async function extractPdfPlainText(file: File): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await getDocument({ data }).promise
  const lines: string[] = []
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber)
    const content = await page.getTextContent()
    let line = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      line += item.str
      if (item.hasEOL) { lines.push(line); line = '' }
    }
    if (line) lines.push(line)
  }
  return lines.join('\n')
}

function looksLikeName(line: string): boolean {
  const clean = line.replace(/\s+/g, ' ').trim()
  if (clean.length < 5 || clean.length > 80) return false
  if (SKIP.test(clean)) return false
  if (/https?:|www\.|@/.test(clean)) return false
  const words = clean.split(/[\s,]+/).filter(Boolean)
  if (words.length < 2 || words.length > 5) return false
  // \w kennt keine Umlaute/Akzente (nur [A-Za-z0-9_]) - \p{L} (Unicode-
  // Buchstabenklasse, braucht das u-Flag) erkennt auch Namen wie "Soyuçok".
  const named = words.filter(word => /^\p{Lu}[\p{L}-]{1,}$/u.test(word) && !SKIP.test(word))
  return named.length >= 2
}

const DATE = /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/
const TOP = /\b(?:Top|Wohnung|Whg)\.?\s*([A-Z0-9/-]+)/i
// Tatsächliches ZMR-Zeilenformat: optionale ZMR-Zahl, Name (1-4 großgeschriebene
// Wörter), Geburtsdatum - danach folgen noch Wohnort und Änderungsverlauf in
// derselben Zeile, zusammen oft mehr als die von looksLikeName() erlaubten 5
// Wörter. Eine generische "sieht aus wie ein Name"-Prüfung allein reicht
// hier also nicht, das Geburtsdatum direkt nach dem Namen ist der
// verlässlichere Anker.
const ZMR_ZEILE = /^(?:\d[\d\s]{4,}\d\s+)?(\p{Lu}[\p{L}.'-]*(?:\s+\p{Lu}[\p{L}.'-]*){0,3})\s+(\d{1,2}\.\d{1,2}\.\d{4})\b/u

export function personenAusText(text: string): EinsatzPerson[] {
  const lines = text.split(/[\n\r;]+/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const found: EinsatzPerson[] = []
  const seen = new Set<string>()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const zmrMatch = line.match(ZMR_ZEILE)
    let label: string | undefined
    let geboren: string | undefined
    if (zmrMatch && !SKIP.test(zmrMatch[1])) {
      label = zmrMatch[1].trim()
      geboren = zmrMatch[2]
    } else {
      geboren = line.match(DATE)?.[1]
      const name = line.replace(DATE, '').replace(TOP, '').replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim()
      if (looksLikeName(name)) label = name
      else if (looksLikeName(line)) label = line.replace(DATE, '').trim()
    }
    if (!label) continue
    // Die Wohnungsnummer steht bei mehrzeiligen ZMR-Einträgen oft erst in der
    // Zeile mit der Adresse direkt danach, nicht mehr bei Name/Geburtsdatum.
    const wohnung = line.match(TOP)?.[1] ?? lines[i + 1]?.match(TOP)?.[1]
    const keyName = `${label.toLowerCase()}|${geboren ?? ''}`
    if (seen.has(keyName)) continue
    seen.add(keyName)
    found.push({ id: crypto.randomUUID(), name: label, geboren, wohnung, status: 'offen' })
  }
  return found
}

function storageKey(incidentId: string) {
  return `einsatz-personen:${incidentId}`
}

export function readPersonenListe(incidentId: string): { art: Listenart; personen: EinsatzPerson[] } {
  try {
    const raw = localStorage.getItem(storageKey(incidentId))
    if (!raw) return { art: 'haus', personen: [] }
    const parsed = JSON.parse(raw) as { art?: Listenart; personen?: EinsatzPerson[] }
    return { art: parsed.art && LISTENARTEN.includes(parsed.art) ? parsed.art : 'haus', personen: parsed.personen ?? [] }
  } catch {
    return { art: 'haus', personen: [] }
  }
}

export function writePersonenListe(incidentId: string, art: Listenart, personen: EinsatzPerson[]) {
  try {
    localStorage.setItem(storageKey(incidentId), JSON.stringify({ art, personen }))
  } catch { /* ignore */ }
}
