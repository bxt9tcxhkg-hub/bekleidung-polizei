import type { CashDenominations, InnendienstRecordKind } from '../../lib/types'

// Von InnendienstShell.tsx und den Innendienst-Unterseiten gemeinsam
// genutzte Konstanten/Hilfsfunktionen - eigene .ts-Datei, weil
// Komponenten-Dateien laut react-refresh/only-export-components nur
// Komponenten exportieren dürfen.

// Euro-Stückelungen in Cent (Ganzzahlen statt Fließkomma, um Rundungsfehler zu vermeiden).
export const DENOMINATIONS: { cents: number; label: string }[] = [
  { cents: 20000, label: '200 €' }, { cents: 10000, label: '100 €' },
  { cents: 5000, label: '50 €' }, { cents: 2000, label: '20 €' }, { cents: 1000, label: '10 €' }, { cents: 500, label: '5 €' },
  { cents: 200, label: '2 €' }, { cents: 100, label: '1 €' },
  { cents: 50, label: '50 Cent' }, { cents: 20, label: '20 Cent' }, { cents: 10, label: '10 Cent' },
  { cents: 5, label: '5 Cent' }, { cents: 2, label: '2 Cent' }, { cents: 1, label: '1 Cent' },
]
const EURO_FORMAT = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' })
export function formatEuro(value: number) { return EURO_FORMAT.format(value) }
export function countedTotalCents(denominations: CashDenominations) {
  return DENOMINATIONS.reduce((sum, item) => sum + item.cents * (denominations[String(item.cents)] ?? 0), 0)
}

export const KIND_LABEL: Record<InnendienstRecordKind, string> = { bescheid_strassenmusik: 'Bescheid Straßenmusik', bescheid_strassenkunst: 'Bescheid Straßenkunst', verstoss: 'Verstoß gegen Auflagen' }
export const BESCHEID_KINDS: InnendienstRecordKind[] = ['bescheid_strassenmusik', 'bescheid_strassenkunst']
export const STATUS_LABEL: Record<'offen' | 'erledigt' | 'entzogen', string> = { offen: 'Offen', erledigt: 'Erledigt', entzogen: 'Entzogen' }
export const inputClass = 'mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function todayLocal() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }

// personId gilt nur für einen Bescheid (Person, für die er ausgestellt wird) -
// ein Verstoß übernimmt seine Person automatisch vom zugehörigen Bescheid,
// subject bleibt dort die Freitext-Beschreibung des Verstoßes.
export const EMPTY_BESCHEID_FORM = { kind: 'bescheid_strassenmusik' as InnendienstRecordKind, personId: null as string | null, subject: '', reference: '', note: '', relatedBescheidId: '' }
export type BescheidFormState = typeof EMPTY_BESCHEID_FORM
