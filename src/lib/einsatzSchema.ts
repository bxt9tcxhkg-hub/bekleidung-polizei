export const EREIGNISSTUFEN = ['klein', 'mittel', 'gross', 'katastrophe'] as const
export type Ereignisstufe = (typeof EREIGNISSTUFEN)[number]

export const STUFE_META: Record<Ereignisstufe, { label: string; color: string; bg: string; hint: string; dienstbetrieb: string; wann: string }> = {
  klein: {
    label: 'Kleinereignis',
    color: '#166534',
    bg: '#dcfce7',
    hint: 'Brand PKW, Wasser im Keller, Rettungseinsatz, üblicher Polizeieinsatz',
    dienstbetrieb: 'Normaler Dienstbetrieb',
    wann: 'Tagesgeschäft im normalen Dienstbetrieb.',
  },
  mittel: {
    label: 'Mittelereignis',
    color: '#854d0e',
    bg: '#fef08a',
    hint: 'Zum Beispiel Brand eines Einfamilienhauses mit Obdachlosigkeit oder Rutschung mit betroffenem Gebäude',
    dienstbetrieb: 'Informationskette per Telefon',
    wann: 'Gewisse Betroffenheit in der Bevölkerung. Die vorgesehene Informationskette wird relevant.',
  },
  gross: {
    label: 'Großereignis',
    color: '#9a3412',
    bg: '#fdba74',
    hint: 'Viele Schadstellen oder ein gravierendes Ereignis, zum Beispiel Hochwasser oder Großbrand',
    dienstbetrieb: 'Koordinierung kann notwendig werden',
    wann: 'Große Betroffenheit in der Bevölkerung. Koordinations- und Führungsentscheidungen können erforderlich werden.',
  },
  katastrophe: {
    label: 'Katastrophe',
    color: '#991b1b',
    bg: '#fecaca',
    hint: 'Mit örtlichen Einsatzmitteln nicht bewältigbar; überörtliche Zusammenarbeit notwendig',
    dienstbetrieb: 'Überörtliche Zusammenarbeit notwendig',
    wann: 'Außerordentlich große Betroffenheit. Die Lage kann mit örtlichen Einsatzmitteln nicht abgearbeitet werden.',
  },
}

// Der stabile Schlüssel eines Ablaufpunkts wird pro Vorgang in der Datenbank gespeichert.
export interface ChecklistPunktDef { key: string; text: string }

export function formatStamp(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
