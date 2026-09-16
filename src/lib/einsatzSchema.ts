export const EREIGNISSTUFEN = ['klein', 'mittel', 'gross', 'katastrophe'] as const
export type Ereignisstufe = (typeof EREIGNISSTUFEN)[number]

export const STUFE_META: Record<Ereignisstufe, { label: string; color: string; bg: string; hint: string; dienstbetrieb: string; wann: string }> = {
  klein: {
    label: 'Kleinereignis',
    color: '#166534',
    bg: '#dcfce7',
    hint: 'Brand PKW, Wasser im Keller, Rettung, üblicher Polizeieinsatz',
    dienstbetrieb: 'Normaler Dienstbetrieb – keine Telefonkette',
    wann: 'Keine oder nur einzelne Betroffene. Alltag für die Zentrale.',
  },
  mittel: {
    label: 'Mittelereignis',
    color: '#854d0e',
    bg: '#fef08a',
    hint: 'Mehrere Haushalte, Straße, sichtbares Ereignis',
    dienstbetrieb: 'Information per Telefon',
    wann: 'Gewisse Betroffenheit in der Bevölkerung. Stadt muss informiert werden.',
  },
  gross: {
    label: 'Großereignis',
    color: '#9a3412',
    bg: '#fdba74',
    hint: 'Ortsteil, viele Personen, Evakuierung denkbar',
    dienstbetrieb: 'Koordinierung notwendig',
    wann: 'Große Betroffenheit. Einsatzleitung und Entscheidungen nötig.',
  },
  katastrophe: {
    label: 'Katastrophe',
    color: '#991b1b',
    bg: '#fecaca',
    hint: 'Über Dornbirn hinaus, Großschaden, überörtliche Hilfe',
    dienstbetrieb: 'Koordinierung notwendig',
    wann: 'Ausserordentlich große Betroffenheit, Zusammenarbeit über die Stadt hinaus.',
  },
}

export const TELEFONKETTE = [
  'Bürgermeisterin',
  'Notfallkoordinator',
  'Stadtamtsdirektor',
  'Rechtsabteilung',
  'Öffentlichkeitsarbeit',
  'Kdo Stadtpolizei',
]

export const ENTSCHEIDUNGSPUNKTE = [
  'Sofortmaßnahmen festlegen',
  'Ort der Einsatzleitung',
  'Einberufung Stadteinsatzleitung',
  'Zivilschutzalarm',
]

export type KetteStatus = { versucht?: string; erreicht?: string }
export type KetteStand = Record<string, KetteStatus>

const PREFIX = /^STUFE:(klein|mittel|gross|katastrophe)\n?/

export function parseStufe(note: string | null | undefined): Ereignisstufe {
  const match = note?.match(PREFIX)
  return (match?.[1] as Ereignisstufe) ?? 'klein'
}

export function noteWithoutStufe(note: string | null | undefined): string {
  return (note ?? '').replace(PREFIX, '')
}

export function withStufe(note: string | null | undefined, stufe: Ereignisstufe): string {
  const rest = noteWithoutStufe(note)
  if (stufe === 'klein') return rest
  return rest ? `STUFE:${stufe}\n${rest}` : `STUFE:${stufe}`
}

function stufeKey(id: string) { return `einsatz-stufe:${id}` }
function ketteKey(id: string) { return `einsatz-kette:${id}` }

export function readStoredStufe(id: string, note?: string | null): Ereignisstufe {
  try {
    const stored = localStorage.getItem(stufeKey(id))
    if (stored && EREIGNISSTUFEN.includes(stored as Ereignisstufe)) return stored as Ereignisstufe
  } catch { /* ignore */ }
  return parseStufe(note)
}

export function writeStoredStufe(id: string, stufe: Ereignisstufe) {
  try {
    if (stufe === 'klein') localStorage.removeItem(stufeKey(id))
    else localStorage.setItem(stufeKey(id), stufe)
  } catch { /* ignore */ }
}

export function readKette(id: string): KetteStand {
  try {
    const raw = localStorage.getItem(ketteKey(id))
    if (!raw) return {}
    return JSON.parse(raw) as KetteStand
  } catch {
    return {}
  }
}

export function writeKette(id: string, stand: KetteStand) {
  try {
    localStorage.setItem(ketteKey(id), JSON.stringify(stand))
  } catch { /* ignore */ }
}

export function formatStamp(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
