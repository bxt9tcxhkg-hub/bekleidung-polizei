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

export function parseStufe(note: string | null | undefined): Ereignisstufe {
  const match = note?.match(/^STUFE:(klein|mittel|gross|katastrophe)\n?/)
  return (match?.[1] as Ereignisstufe) ?? 'klein'
}

export function withStufe(note: string | null | undefined, stufe: Ereignisstufe): string {
  const rest = (note ?? '').replace(/^STUFE:(klein|mittel|gross|katastrophe)\n?/, '')
  if (stufe === 'klein') return rest
  return `STUFE:${stufe}\n${rest}`
}

export function noteWithoutStufe(note: string | null | undefined): string {
  return (note ?? '').replace(/^STUFE:(klein|mittel|gross|katastrophe)\n?/, '')
}
