// Statischer Import statt dynamischem `import(...?url)` - Vites
// dokumentiertes Standardmuster für pdf.js-Worker-URLs, sodass sie beim
// Build garantiert zur selben gehashten Asset-Datei wie im Bundle-Manifest
// aufgelöst wird.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from './supabase'
import type { NamenslistePerson, NamenslisteArt, NamenslistePersonStatus } from './types'

export const LISTENARTEN = ['haus', 'kontrolle', 'evakuierung', 'befragung', 'unterbringung'] as const
export type Listenart = (typeof LISTENARTEN)[number]

export const LISTENART_LABEL: Record<Listenart, string> = {
  haus: 'Haus / Bewohner',
  kontrolle: 'Kontrolle',
  evakuierung: 'Evakuierung',
  befragung: 'Befragung',
  unterbringung: 'Notunterkunft (Namensliste)',
}

export const LISTENART_SPALTEN: Record<Listenart, string> = {
  haus: 'Wohnung · Name · geboren',
  kontrolle: 'Name · kontrolliert ja/nein',
  evakuierung: 'Name · im Haus / draußen / unbekannt',
  befragung: 'Name · befragt ja/nein',
  unterbringung: 'Name · Alter · m/w/d · Sprache · Familie · Telefon · Ort Unterkunft · Anmerkungen',
}

export type PersonenStatus = NamenslistePersonStatus

/** Deckungsgleich mit der DB-Zeile (einsatz_namensliste) - anders als die
 * frühere localStorage-Version (lib/zmrPersonen.ts, Vor-DB-Stand) jetzt
 * geteilter Server-Zustand, damit Zentrale UND Streife vor Ort dieselbe
 * Liste sehen/bearbeiten (siehe Migration
 * 20260919050000_einsatz_checkliste_namensliste.sql). */
export type EinsatzPerson = NamenslistePerson

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

/** Aus einem ZMR-Auszug/einer Abfrage erkannte Person - noch keine DB-Zeile
 * (kein incident_id, keine id), da personenAusText() rein die Texterkennung
 * übernimmt. addPersonen() legt daraus dann echte einsatz_namensliste-Zeilen an. */
export interface ErkannteZmrPerson {
  name: string
  geboren?: string
  wohnung?: string
}

export function personenAusText(text: string): ErkannteZmrPerson[] {
  const lines = text.split(/[\n\r;]+/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const found: ErkannteZmrPerson[] = []
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
    found.push({ name: label, geboren, wohnung })
  }
  return found
}

/** Führender numerischer Teil einer Top-/Wohnungsnummer ("12", "3a",
 * "Erdgeschoss") - für eine echte "nach Top-Nr sortiert"-Reihenfolge statt
 * lexikografischem String-Vergleich (bei dem "10" vor "2" käme). Einträge
 * ohne erkennbare Nummer landen ans Ende, alphabetisch sortiert. */
function topNrSortKey(wohnung: string | null): [number, string] {
  const match = wohnung?.match(/\d+/)
  return match ? [Number(match[0]), wohnung ?? ''] : [Number.POSITIVE_INFINITY, wohnung ?? '']
}

export function sortiertNachTopNr(personen: readonly NamenslistePerson[]): NamenslistePerson[] {
  return [...personen].sort((a, b) => {
    const [numA, strA] = topNrSortKey(a.wohnung)
    const [numB, strB] = topNrSortKey(b.wohnung)
    return numA - numB || strA.localeCompare(strB, 'de-AT') || a.name.localeCompare(b.name, 'de-AT')
  })
}

export async function loadPersonenliste(incidentId: string, art: NamenslisteArt): Promise<NamenslistePerson[]> {
  const result = await supabase.from('einsatz_namensliste').select('*').eq('incident_id', incidentId).eq('listenart', art).order('created_at')
  if (result.error) throw new Error('Die Liste konnte nicht geladen werden.')
  return sortiertNachTopNr((result.data ?? []) as unknown as NamenslistePerson[])
}

export async function addPersonen(incidentId: string, art: NamenslisteArt, personen: readonly ErkannteZmrPerson[], createdBy: string): Promise<NamenslistePerson[]> {
  const rows = personen.map(person => ({ incident_id: incidentId, listenart: art, name: person.name, geboren: person.geboren ?? null, wohnung: person.wohnung ?? null, created_by: createdBy }))
  const result = await supabase.from('einsatz_namensliste').insert(rows).select('*')
  if (result.error) throw new Error('Die Personen konnten nicht übernommen werden.')
  return (result.data ?? []) as unknown as NamenslistePerson[]
}

function alterAusGeburtsdatum(geboren: string | null): number | null {
  if (!geboren) return null
  const match = geboren.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!match) return null
  const [, tagText, monatText, jahrText] = match
  const tag = Number(tagText)
  const monat = Number(monatText)
  const jahr = Number(jahrText)
  const heute = new Date()
  let alter = heute.getFullYear() - jahr
  const hatteGeburtstag = heute.getMonth() + 1 > monat || (heute.getMonth() + 1 === monat && heute.getDate() >= tag)
  if (!hatteGeburtstag) alter--
  return alter >= 0 && alter < 130 ? alter : null
}

function listenPersonKey(person: Pick<NamenslistePerson, 'name' | 'geboren' | 'wohnung'>): string {
  return [person.name.trim().toLocaleLowerCase('de-AT'), person.geboren ?? '', person.wohnung ?? ''].join('|')
}

/**
 * Kopiert bewusst ausgewählte Personen in eine Arbeitsliste. Bereits vorhandene
 * identische Personen werden übersprungen, damit wiederholte Klicks keine
 * Dubletten erzeugen.
 */
export async function copyPersonenInListe(
  incidentId: string,
  ziel: NamenslisteArt,
  personen: readonly NamenslistePerson[],
  createdBy: string,
): Promise<{ hinzugefuegt: number; uebersprungen: number }> {
  if (personen.length === 0) return { hinzugefuegt: 0, uebersprungen: 0 }

  const vorhanden = await loadPersonenliste(incidentId, ziel)
  const keys = new Set(vorhanden.map(listenPersonKey))
  const neu = personen.filter(person => !keys.has(listenPersonKey(person)))

  if (neu.length > 0) {
    const rows = neu.map(person => ({
      incident_id: incidentId,
      listenart: ziel,
      name: person.name,
      geboren: person.geboren,
      wohnung: person.wohnung,
      alter: ziel === 'unterbringung' ? (person.alter ?? alterAusGeburtsdatum(person.geboren)) : person.alter,
      geschlecht: person.geschlecht,
      sprache: person.sprache,
      familie: person.familie,
      telefon: person.telefon,
      ort_unterkunft: person.ort_unterkunft,
      anmerkungen: person.anmerkungen,
      status: (ziel === 'evakuierung' ? 'unbekannt' : 'offen') as NamenslistePerson['status'],
      created_by: createdBy,
    }))
    const result = await supabase.from('einsatz_namensliste').insert(rows)
    if (result.error) throw new Error('Die ausgewählten Personen konnten nicht übernommen werden.')
  }

  return { hinzugefuegt: neu.length, uebersprungen: personen.length - neu.length }
}

export async function updatePerson(id: string, changes: Partial<Pick<NamenslistePerson, 'name' | 'geboren' | 'wohnung' | 'alter' | 'geschlecht' | 'sprache' | 'familie' | 'telefon' | 'ort_unterkunft' | 'anmerkungen' | 'status'>>): Promise<void> {
  const result = await supabase.from('einsatz_namensliste').update(changes).eq('id', id)
  if (result.error) throw new Error('Die Person konnte nicht gespeichert werden.')
}

export async function removePerson(id: string): Promise<void> {
  const result = await supabase.from('einsatz_namensliste').delete().eq('id', id)
  if (result.error) throw new Error('Die Person konnte nicht entfernt werden.')
}
