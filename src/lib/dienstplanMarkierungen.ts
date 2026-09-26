// Dienstplan-Planung: freie, vom Planer selbst definierbare Farbmarkierungen
// für einzelne Diensteinträge (z. B. "Überstunden" blau) - rein visuelle
// Zusatzinformation, unabhängig vom Dienst-Kürzel/der Kategorie (siehe
// Migration 20260926085424_dienstplan_markierungen.sql). Die Farbe ist
// bewusst auf eine feste Palette beschränkt, die sich von den bereits
// verwendeten Abwesenheits-/Warnfarben (gelb/grün/rosa/rot) abhebt, damit
// beide Bedeutungen nicht verwechselt werden.

export const MARKIERUNG_FARBEN = ['blau', 'lila', 'orange', 'tuerkis', 'grau'] as const
export type DienstplanMarkierungFarbe = (typeof MARKIERUNG_FARBEN)[number]

export const MARKIERUNG_FARBE_LABEL: Record<DienstplanMarkierungFarbe, string> = {
  blau: 'Blau', lila: 'Lila', orange: 'Orange', tuerkis: 'Türkis', grau: 'Grau',
}

/** Wie absenzFarbe() (lib/dienstplanBesetzung.ts) bekommt die Nacht-Zeile eine kräftigere Nuance derselben Farbe, damit eine Markierung auch bei Wochenend-Hintergrund und über Tag/Nacht hinweg durchgehend sichtbar bleibt. */
export function markierungFarbKlassen(farbe: string): { bg: string; bgNacht: string; text: string } {
  switch (farbe as DienstplanMarkierungFarbe) {
    case 'blau':
      return { bg: 'bg-blue-100', bgNacht: 'bg-blue-200', text: 'text-blue-900' }
    case 'lila':
      return { bg: 'bg-purple-100', bgNacht: 'bg-purple-200', text: 'text-purple-900' }
    case 'orange':
      return { bg: 'bg-orange-100', bgNacht: 'bg-orange-200', text: 'text-orange-900' }
    case 'tuerkis':
      return { bg: 'bg-teal-100', bgNacht: 'bg-teal-200', text: 'text-teal-900' }
    default:
      return { bg: 'bg-gray-200', bgNacht: 'bg-gray-300', text: 'text-gray-900' }
  }
}
