// Dienstplan-Planung: freie, vom Planer selbst definierbare Farbmarkierungen
// für einzelne Diensteinträge (z. B. "Überstunden" blau) - rein visuelle
// Zusatzinformation, unabhängig vom Dienst-Kürzel/der Kategorie. Dieselbe
// Tabelle (dienstplan_markierungen) führt daneben fünf feste
// "System"-Einträge für die Abwesenheitskategorien (Urlaub/Sonderurlaub/
// Stundenersatz/Krank/Karenz, erkennbar an einer gesetzten `kategorie`) -
// deren Name/Bedeutung ist fix, aber der Planer kann die Farbe ändern
// (siehe Migration 20260926102220_dienstplan_markierungen_kategorie_leere_zellen.sql).
// Beide Arten teilen sich dieselbe Farbpalette.

export const MARKIERUNG_FARBEN = ['blau', 'lila', 'orange', 'tuerkis', 'grau', 'gelb', 'gruen', 'rosa'] as const
export type DienstplanMarkierungFarbe = (typeof MARKIERUNG_FARBEN)[number]

export const MARKIERUNG_FARBE_LABEL: Record<DienstplanMarkierungFarbe, string> = {
  blau: 'Blau', lila: 'Lila', orange: 'Orange', tuerkis: 'Türkis', grau: 'Grau', gelb: 'Gelb', gruen: 'Grün', rosa: 'Rosa',
}

/** Nacht-Zeile bekommt eine kräftigere Nuance derselben Farbe, damit eine Markierung auch bei Wochenend-Hintergrund und über Tag/Nacht hinweg durchgehend sichtbar bleibt. */
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
    case 'gelb':
      return { bg: 'bg-yellow-100', bgNacht: 'bg-yellow-200', text: 'text-yellow-900' }
    case 'gruen':
      return { bg: 'bg-green-100', bgNacht: 'bg-green-200', text: 'text-green-900' }
    case 'rosa':
      return { bg: 'bg-pink-100', bgNacht: 'bg-pink-200', text: 'text-pink-900' }
    default:
      return { bg: 'bg-gray-200', bgNacht: 'bg-gray-300', text: 'text-gray-900' }
  }
}

export type DienstplanAbsenzKategorie = 'urlaub' | 'krank' | 'sonderurlaub' | 'karenz' | 'stundenersatz'
type AbsenzKategorie = DienstplanAbsenzKategorie

/** Fallback, falls die passende System-Markierung ausnahmsweise fehlt (z. B. gerade gelöscht) - dieselben Farben wie ursprünglich hart codiert. */
const STANDARD_KATEGORIE_FARBE: Record<AbsenzKategorie, DienstplanMarkierungFarbe> = {
  urlaub: 'gelb', sonderurlaub: 'gelb', stundenersatz: 'gelb', krank: 'gruen', karenz: 'rosa',
}

function istAbsenzKategorie(kategorie: string): kategorie is AbsenzKategorie {
  return kategorie in STANDARD_KATEGORIE_FARBE
}

/** Baut aus den geladenen Markierungen (siehe dienstplan_markierungen) die aktuell eingestellte Farbe je Abwesenheitskategorie - nur Zeilen mit gesetzter `kategorie` (die fünf System-Einträge) fließen ein. */
export function kategorieFarbenMap(markierungen: readonly { kategorie: string | null; farbe: string }[]): Map<AbsenzKategorie, string> {
  const map = new Map<AbsenzKategorie, string>()
  for (const markierung of markierungen) {
    if (markierung.kategorie && istAbsenzKategorie(markierung.kategorie)) map.set(markierung.kategorie, markierung.farbe)
  }
  return map
}

/**
 * Farbe für eine Abwesenheitskategorie (Urlaub/Krank/Sonderurlaub/Karenz/
 * Stundenersatz) - "dienst"/"sonstiges" bekommen keine eigene Farbe (null).
 * Die Farbe kommt aus der vom Planer eingestellten System-Markierung
 * (kategorieFarbenMap), mit Rückfallwert falls dafür ausnahmsweise keine
 * Zeile existiert.
 */
export function kategorieFarbKlassen(kategorie: string, kategorieFarben: ReadonlyMap<AbsenzKategorie, string>): { bg: string; bgNacht: string; text: string } | null {
  if (!istAbsenzKategorie(kategorie)) return null
  const farbe = kategorieFarben.get(kategorie) ?? STANDARD_KATEGORIE_FARBE[kategorie]
  return markierungFarbKlassen(farbe)
}
