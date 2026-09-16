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

async function inflateAsync(bytes: Uint8Array): Promise<string | null> {
  const tryMode = async (mode: CompressionFormat) => {
    const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream(mode))
    const out = await new Response(stream).arrayBuffer()
    return new TextDecoder('latin1').decode(out)
  }
  try {
    return await tryMode(bytes[0] === 0x78 ? 'deflate' : 'deflate-raw')
  } catch {
    try {
      return await tryMode('deflate-raw')
    } catch {
      return null
    }
  }
}

function stringsFromPdfText(decoded: string): string[] {
  const parts: string[] = []
  for (const match of decoded.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
    const inner = match[0].slice(1, match[0].lastIndexOf(')'))
    parts.push(inner.replace(/\\n/g, ' ').replace(/\\(.)/g, '$1'))
  }
  for (const match of decoded.matchAll(/\[((?:\s*\((?:\\.|[^\\)])*\)\s*)+)\]\s*TJ/g)) {
    const chunk = [...match[1].matchAll(/\((?:\\.|[^\\)])*\)/g)].map(item => item[0].slice(1, -1).replace(/\\(.)/g, '$1')).join('')
    if (chunk.trim()) parts.push(chunk)
  }
  return parts
}

export async function extractPdfPlainText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const latin = new TextDecoder('latin1').decode(buf)
  const chunks: string[] = [latin]
  for (const match of latin.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const raw = new TextEncoder().encode(match[1])
    const inflated = await inflateAsync(raw)
    if (inflated) chunks.push(inflated)
  }
  const textParts = chunks.flatMap(stringsFromPdfText)
  if (textParts.length > 0) return textParts.join('\n')
  return latin.replace(/[^\x20-\x7E\u00C0-\u017F\n]/g, ' ')
}

function looksLikeName(line: string): boolean {
  const clean = line.replace(/\s+/g, ' ').trim()
  if (clean.length < 5 || clean.length > 80) return false
  if (SKIP.test(clean)) return false
  if (/https?:|www\.|@/.test(clean)) return false
  const words = clean.split(/[\s,]+/).filter(Boolean)
  if (words.length < 2 || words.length > 5) return false
  const named = words.filter(word => /^[A-ZÄÖÜ][A-Za-zäöüßÄÖÜ-]{1,}$/.test(word) && !SKIP.test(word))
  return named.length >= 2
}

const DATE = /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/
const TOP = /\b(?:Top|Wohnung|Whg)\.?\s*([A-Z0-9\/\-]+)/i

export function personenAusText(text: string): EinsatzPerson[] {
  const lines = text.split(/[\n\r;]+/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const found: EinsatzPerson[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const geboren = line.match(DATE)?.[1]
    const wohnung = line.match(TOP)?.[1]
    const name = line.replace(DATE, '').replace(TOP, '').replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!looksLikeName(name) && !looksLikeName(line)) continue
    const label = looksLikeName(name) ? name : line.replace(DATE, '').trim()
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
