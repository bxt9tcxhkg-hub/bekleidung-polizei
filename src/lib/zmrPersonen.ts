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

function inflate(bytes: Uint8Array): string | null {
  try {
    const raw = bytes[0] === 0x78 ? bytes : bytes
    const stream = new Blob([raw.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('deflate'))
    return null
  } catch {
    return null
  }
}

async function inflateAsync(bytes: Uint8Array): Promise<string | null> {
  try {
    const copy = new Uint8Array(bytes)
    const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream(copy[0] === 0x78 ? 'deflate' : 'deflate-raw'))
    const out = await new Response(stream).arrayBuffer()
    return new TextDecoder('latin1').decode(out)
  } catch {
    try {
      const copy = new Uint8Array(bytes)
      const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      const out = await new Response(stream).arrayBuffer()
      return new TextDecoder('latin1').decode(out)
    } catch {
      return null
    }
  }
}

function stringsFromPdfText(decoded: string): string[] {
  const parts: string[] = []
  const tj = decoded.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)
  for (const match of tj) {
    const inner = match[0].slice(1, match[0].lastIndexOf(')'))
    parts.push(inner.replace(/\\n/g, ' ').replace(/\\(.)/g, '$1'))
  }
  const arr = decoded.matchAll(/\[((?:\s*\((?:\\.|[^\\)])*\)\s*)+)\]\s*TJ/g)
  for (const match of arr) {
    const chunk = [...match[1].matchAll(/\((?:\\.|[^\\)])*\)/g)].map(item => item[0].slice(1, -1).replace(/\\(.)/g, '$1')).join('')
    if (chunk.trim()) parts.push(chunk)
  }
  return parts
}

export async function extractPdfPlainText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const latin = new TextDecoder('latin1').decode(buf)
  const chunks: string[] = [latin]
  const streams = latin.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)
  for (const match of streams) {
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
  if (/https?:|www\.|@|\\/.test(clean)) return false
  if (/^\d+[\s\/]/.test(clean)) return false
  const words = clean.split(/[\s,]+/).filter(Boolean)
  if (words.length < 2 || words.length > 5) return false
  const named = words.filter(word => /^[A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ-]{1,}$/.test(word) && !SKIP.test(word))
  return named.length >= 2
}

const DATE = /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/
const TOP = /\b(?:Top|Wohnung|Whg)\.?\s*([A-Z0-9\/\-]+)/i

export function personenAusText(text: string): EinsatzPerson[] {
  const lines = text.split(/[\n\r;]+/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const found: EinsatzPerson[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    if (!looksLikeName(line) && !DATE.test(line)) continue
    const geboren = line.match(DATE)?.[1]
    const wohnung = line.match(TOP)?.[1]
    const name = line.replace(DATE, '').replace(TOP, '').replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!looksLikeName(name)) continue
    const key = `${name.toLowerCase()}|${geboren ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ id: crypto.randomUUID(), name, geboren, wohnung, status: 'offen' })
  }
  return found
}

function key(incidentId: string) {
  return `einsatz-personen:${incidentId}`
}

export function readPersonenListe(incidentId: string): { art: Listenart; personen: EinsatzPerson[] } {
  try {
    const raw = localStorage.getItem(key(incidentId))
    if (!raw) return { art: 'haus', personen: [] }
    const parsed = JSON.parse(raw) as { art?: Listenart; personen?: EinsatzPerson[] }
    return { art: parsed.art && LISTENARTEN.includes(parsed.art) ? parsed.art : 'haus', personen: parsed.personen ?? [] }
  } catch {
    return { art: 'haus', personen: [] }
  }
}

export function writePersonenListe(incidentId: string, art: Listenart, personen: EinsatzPerson[]) {
  try {
    localStorage.setItem(key(incidentId), JSON.stringify({ art, personen }))
  } catch { /* ignore */ }
}
