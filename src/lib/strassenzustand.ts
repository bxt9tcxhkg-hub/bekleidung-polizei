import type { StrassenzustandBerichtzeile, StrassenzustandMeldungsart, StrassenzustandZustand } from './types'

export const ZUSTAND_LABEL: Record<StrassenzustandZustand, string> = {
  frei_befahrbar: 'Frei befahrbar',
  gesperrt: 'Gesperrt',
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

/** Straßen mit aktuell aktiver Maßnahme (alles außer "frei befahrbar"). */
export function aktiveSperren(zeilen: readonly StrassenzustandBerichtzeile[]): StrassenzustandBerichtzeile[] {
  return latestPerStrasse(zeilen)
    .filter(zeile => zeile.zustand !== 'frei_befahrbar')
    .sort((a, b) => strassenName(a).localeCompare(strassenName(b), 'de'))
}

/** Datum, oder Datum + Uhrzeit falls eine Uhrzeit ungleich Mitternacht gesetzt wurde. */
function formatZeitpunkt(value: string): string {
  const date = new Date(value)
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0
  return hasTime
    ? `${date.toLocaleDateString('de-AT')} ${date.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`
    : date.toLocaleDateString('de-AT')
}

/**
 * Baut aus einem Datum (YYYY-MM-DD, Pflicht) und einer optionalen Uhrzeit
 * (HH:MM) einen UTC-Zeitstempel (ISO-String) in der lokalen Zeitzone des
 * Browsers - fehlt die Uhrzeit, wird Mitternacht angenommen. Leeres Datum
 * ergibt null (für das optionale "Gültig bis").
 */
export function toTimestamp(datum: string, zeit: string): string | null {
  if (!datum) return null
  const [year, month, day] = datum.split('-').map(Number)
  const [hours, minutes] = zeit ? zeit.split(':').map(Number) : [0, 0]
  return new Date(year, month - 1, day, hours, minutes).toISOString()
}

/**
 * Kehrt toTimestamp() um - für das Vorbefüllen des Formulars beim Bearbeiten
 * eines bestehenden Berichts. Mitternacht gilt als "keine Uhrzeit gesetzt"
 * (siehe toTimestamp), daher kommt bei 00:00 eine leere Uhrzeit zurück.
 */
export function fromTimestamp(iso: string | null): { datum: string; zeit: string } {
  if (!iso) return { datum: '', zeit: '' }
  const date = new Date(iso)
  const datum = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const zeit = date.getHours() === 0 && date.getMinutes() === 0 ? '' : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return { datum, zeit }
}

export function formatZeitraum(zeile: Pick<StrassenzustandBerichtzeile, 'gueltig_von' | 'gueltig_bis'>): string {
  const von = formatZeitpunkt(zeile.gueltig_von)
  if (!zeile.gueltig_bis) return `Ab ${von} (bis auf Weiteres)`
  return `${von} – ${formatZeitpunkt(zeile.gueltig_bis)}`
}
