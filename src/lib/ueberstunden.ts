import type { UeberstundenMeldung, UeberstundenStatus } from './types'

// Von Ueberstunden.tsx (Seite) und lib/ueberstundenPdf.ts (PDF-Export)
// gemeinsam genutzte Konstanten/Hilfsfunktionen.

export const STATUS_LABEL: Record<UeberstundenStatus, string> = { entwurf: 'Entwurf', eingereicht: 'Eingereicht', genehmigt: 'Genehmigt', abgelehnt: 'Abgelehnt' }
export const STATUS_COLOR: Record<UeberstundenStatus, string> = { entwurf: 'bg-gray-100 text-gray-600', eingereicht: 'bg-amber-100 text-amber-800', genehmigt: 'bg-green-100 text-green-800', abgelehnt: 'bg-red-100 text-red-800' }

export type UeberstundenKategorieKey = 'std_werktag_50' | 'std_sonn_100' | 'std_19_22' | 'std_22_06' | 'std_sonn_200'

// Reihenfolge/Aufteilung wie in der offiziellen Vorlage (Spalten der Tabelle
// "Ü-Std aufgeschlüsselt") - Bezeichnung, Lohnsatz und LA-Code je Kategorie.
export const KATEGORIEN: { key: UeberstundenKategorieKey; label: string; hinweis: string; satz: string; code: string }[] = [
  { key: 'std_werktag_50', label: 'Überstunden an Werktagen', hinweis: 'Mo 06.00 bis 19.00 Uhr (werden mit 50 % Lohn verrechnet)', satz: '50 %', code: 'LA 3250' },
  { key: 'std_sonn_100', label: 'Überstunden an Sonn- und Feiertagen', hinweis: 'im Ausmaß von 8 Stunden - alle Mehrstunden sind 200 %', satz: 'So 100 %', code: 'LA 3520' },
  { key: 'std_19_22', label: 'Stunden in der Zeit von 19-22 Uhr', hinweis: '', satz: '50 %', code: 'LA 3500' },
  { key: 'std_22_06', label: 'Stunden in der Zeit von 22-06 Uhr', hinweis: '', satz: '100 %', code: 'LA 3510' },
  { key: 'std_sonn_200', label: 'Überstunden an Sonn- u. Feiertagen', hinweis: 'ab 8 Stunden', satz: '200 %', code: 'LA 3530' },
]

export function totalStunden(item: Pick<UeberstundenMeldung, UeberstundenKategorieKey>): number {
  return KATEGORIEN.reduce((sum, kat) => sum + (item[kat.key] || 0), 0)
}

export function formatStunden(value: number): string {
  return value.toLocaleString('de-AT', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })
}

export function todayLocal(): string { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }

export const EMPTY_MELDUNG_FORM = {
  datum: todayLocal(), zeitVon: '', zeitBis: '', grund: '',
  stdWerktag50: '', stdSonn100: '', std1922: '', std2206: '', stdSonn200: '',
}
export type MeldungFormState = typeof EMPTY_MELDUNG_FORM

// Feldname im Formular je Kategorie - für generische Eingabe/Auslese in Schleifen.
export const FORM_FIELD_BY_KATEGORIE: Record<UeberstundenKategorieKey, keyof MeldungFormState> = {
  std_werktag_50: 'stdWerktag50', std_sonn_100: 'stdSonn100', std_19_22: 'std1922', std_22_06: 'std2206', std_sonn_200: 'stdSonn200',
}

function parseStunden(raw: string): number {
  const value = Number(raw.replace(',', '.'))
  return Number.isFinite(value) && value >= 0 ? value : 0
}

export function meldungToForm(item: UeberstundenMeldung): MeldungFormState {
  return {
    datum: item.datum, zeitVon: item.zeit_von?.slice(0, 5) ?? '', zeitBis: item.zeit_bis?.slice(0, 5) ?? '', grund: item.grund,
    stdWerktag50: item.std_werktag_50 ? String(item.std_werktag_50) : '',
    stdSonn100: item.std_sonn_100 ? String(item.std_sonn_100) : '',
    std1922: item.std_19_22 ? String(item.std_19_22) : '',
    std2206: item.std_22_06 ? String(item.std_22_06) : '',
    stdSonn200: item.std_sonn_200 ? String(item.std_sonn_200) : '',
  }
}

export function formToPayload(form: MeldungFormState) {
  return {
    datum: form.datum, zeit_von: form.zeitVon || null, zeit_bis: form.zeitBis || null, grund: form.grund.trim(),
    std_werktag_50: parseStunden(form.stdWerktag50), std_sonn_100: parseStunden(form.stdSonn100),
    std_19_22: parseStunden(form.std1922), std_22_06: parseStunden(form.std2206), std_sonn_200: parseStunden(form.stdSonn200),
  }
}
