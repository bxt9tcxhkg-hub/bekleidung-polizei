export const EREIGNISSTUFEN = ['klein', 'mittel', 'gross', 'katastrophe'] as const
export type Ereignisstufe = (typeof EREIGNISSTUFEN)[number]

export const STUFE_META: Record<Ereignisstufe, { label: string; color: string; bg: string; hint: string; dienstbetrieb: string }> = {
  klein: { label: 'Kleinereignis', color: '#166534', bg: '#dcfce7', hint: 'z. B. Brand PKW, Wasser im Keller, Rettung, Polizeieinsatz', dienstbetrieb: 'normaler Dienstbetrieb' },
  mittel: { label: 'Mittelereignis', color: '#854d0e', bg: '#fef08a', hint: 'Gewisse Betroffenheit in der Bevölkerung', dienstbetrieb: 'Information per Telefon' },
  gross: { label: 'Großereignis', color: '#9a3412', bg: '#fdba74', hint: 'Große Betroffenheit in der Bevölkerung', dienstbetrieb: 'Koordinierung notwendig' },
  katastrophe: { label: 'Katastrophe', color: '#991b1b', bg: '#fecaca', hint: 'Ausserordentlich große Betroffenheit, überörtliche Zusammenarbeit', dienstbetrieb: 'Koordinierung notwendig' },
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

function storageKey(id: string) { return `einsatz-stufe:${id}` }

export function readStoredStufe(id: string, note?: string | null): Ereignisstufe {
  try {
    const stored = localStorage.getItem(storageKey(id))
    if (stored && EREIGNISSTUFEN.includes(stored as Ereignisstufe)) return stored as Ereignisstufe
  } catch { /* ignore */ }
  return parseStufe(note)
}

export function writeStoredStufe(id: string, stufe: Ereignisstufe) {
  try {
    if (stufe === 'klein') localStorage.removeItem(storageKey(id))
    else localStorage.setItem(storageKey(id), stufe)
  } catch { /* ignore */ }
}
