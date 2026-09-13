import type { KontrollauftragZielfunktion } from './types'

// Von AussendienstShell.tsx und den Außendienst-Unterseiten gemeinsam
// genutzte Konstanten/Formularzustände - eigene .ts-Datei, weil
// Komponenten-Dateien laut react-refresh/only-export-components nur
// Komponenten exportieren dürfen.

export const ZIELFUNKTION_LABEL: Record<KontrollauftragZielfunktion, string> = { jd: 'Nur JD', vd: 'Nur VD', beide: 'JD und VD' }

export const EMPTY_AUFTRAG = { title: '', description: '', location: '', validFrom: '', validUntil: '', targetFunction: 'beide' as KontrollauftragZielfunktion }
export type AuftragFormState = typeof EMPTY_AUFTRAG

// Vereinfachte, rein textuelle Baustellen-Meldung für die Streife - kein
// Kartenzeichnen wie in der Zentrale. Ohne Endpunkt wird derselbe Standort
// für Start und Ende verwendet (Wahrnehmung ohne genauen Streckenverlauf).
export const EMPTY_BAUSTELLE_REPORT = { titel: '', startAddress: '', endAddress: '', note: '' }
export type BaustelleReportState = typeof EMPTY_BAUSTELLE_REPORT
