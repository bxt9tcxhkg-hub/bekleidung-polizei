import type { StrassenzustandBerichtzeile, StrassenzustandMeldungsart, StrassenzustandZustand } from './types'

export const ZUSTAND_LABEL: Record<StrassenzustandZustand, string> = {
  normal: 'Normal / frei befahrbar',
  schnee: 'Schnee',
  glatteis: 'Glatteis',
  lawine: 'Lawine',
  sonstige: 'Sonstige',
}
export const MELDUNGSART_LABEL: Record<StrassenzustandMeldungsart, string> = {
  neuzugang: 'Neuzugang',
  aenderung: 'Änderung',
  widerruf: 'Widerruf',
}

/** Eindeutiger Schlüssel je Straße - über die Stammdaten-ID, sonst über den (normalisierten) Freitext. */
export function strassenKey(zeile: Pick<StrassenzustandBerichtzeile, 'strasse_id' | 'strasse_freitext'>): string {
  return zeile.strasse_id ?? `frei:${(zeile.strasse_freitext ?? '').trim().toLocaleLowerCase('de-AT')}`
}

export function strassenName(zeile: StrassenzustandBerichtzeile): string {
  return zeile.strassenzustand_strassen?.name ?? zeile.strasse_freitext ?? '–'
}

/**
 * Aktueller Stand je Straße: die jeweils letzte (neueste) Zeile über alle Berichte hinweg.
 * `zeilen` muss nach created_at aufsteigend oder absteigend sortiert sein - die Reihenfolge
 * der Eingabe spielt keine Rolle, es wird intern nach created_at verglichen.
 */
export function latestPerStrasse(zeilen: readonly StrassenzustandBerichtzeile[]): StrassenzustandBerichtzeile[] {
  const latest = new Map<string, StrassenzustandBerichtzeile>()
  for (const zeile of zeilen) {
    const key = strassenKey(zeile)
    const current = latest.get(key)
    if (!current || new Date(zeile.created_at).getTime() > new Date(current.created_at).getTime()) {
      latest.set(key, zeile)
    }
  }
  return [...latest.values()]
}

/** Straßen mit aktuell aktiver Maßnahme (alles außer "normal / frei befahrbar"). */
export function aktiveSperren(zeilen: readonly StrassenzustandBerichtzeile[]): StrassenzustandBerichtzeile[] {
  return latestPerStrasse(zeilen)
    .filter(zeile => zeile.zustand !== 'normal')
    .sort((a, b) => strassenName(a).localeCompare(strassenName(b), 'de'))
}

export function formatZeitraum(zeile: Pick<StrassenzustandBerichtzeile, 'gueltig_von' | 'gueltig_bis'>): string {
  const von = new Date(zeile.gueltig_von).toLocaleDateString('de-AT')
  if (!zeile.gueltig_bis) return `Ab ${von} (bis auf Weiteres)`
  const bis = new Date(zeile.gueltig_bis).toLocaleDateString('de-AT')
  return `${von} – ${bis}`
}
