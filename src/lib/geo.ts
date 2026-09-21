// Geografische Nähe-Berechnung, z. B. um Baustellen zu finden, die in der
// Nähe eines Einsatzorts liegen. Bewusst clientseitig und ohne Bibliothek -
// es geht nur um kurze Distanzen (Meterbereich), eine einfache lokale
// Projektion reicht dafür aus und erspart eine weitere Abhängigkeit.

const EARTH_RADIUS_M = 6371000

export interface LatLng { lat: number; lng: number }

function toRad(deg: number) { return (deg * Math.PI) / 180 }

// Rechnet die lat/lng-Differenz zweier Punkte in lokale x/y-Meter um (Ebene
// tangential zu origin) - für kurze Distanzen ausreichend genau, echte
// Kugelgeometrie wäre hier unnötiger Aufwand.
function toLocalMeters(point: LatLng, origin: LatLng): { x: number; y: number } {
  const latRad = toRad(origin.lat)
  return {
    x: toRad(point.lng - origin.lng) * Math.cos(latRad) * EARTH_RADIUS_M,
    y: toRad(point.lat - origin.lat) * EARTH_RADIUS_M,
  }
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  const p = toLocalMeters(b, a)
  return Math.sqrt(p.x * p.x + p.y * p.y)
}

function distancePointToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Kürzeste Distanz eines Punkts zu einem Streckenzug (Folge von Segmenten) in Metern. */
export function distanceToPolylineMeters(point: LatLng, line: readonly (readonly [number, number])[]): number {
  if (line.length === 0) return Infinity
  if (line.length === 1) return distanceMeters(point, { lat: line[0][0], lng: line[0][1] })
  let min = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    const a = toLocalMeters({ lat: line[i][0], lng: line[i][1] }, point)
    const b = toLocalMeters({ lat: line[i + 1][0], lng: line[i + 1][1] }, point)
    min = Math.min(min, distancePointToSegment({ x: 0, y: 0 }, a, b))
  }
  return min
}

/** Ab welcher Entfernung eine Baustelle/Sperre noch als "in der Nähe" eines Einsatzorts gilt. */
export const NEARBY_METERS = 200

type LineItem = { start_lat: number; start_lng: number; end_lat: number; end_lng: number; path: readonly (readonly [number, number])[] | null }

/**
 * Elemente mit einer Streckengeometrie (Start-/Endpunkt, optional Straßenverlauf),
 * die innerhalb von maxMeters um point liegen - sortiert nach Entfernung (nächstes zuerst).
 * point === null (noch keine Koordinaten bekannt, z. B. beim Erfassen einer Meldung) ergibt immer [].
 */
export function nearbyByLine<T extends LineItem>(point: LatLng | null, items: readonly T[], maxMeters = NEARBY_METERS): T[] {
  if (!point) return []
  return items
    .map(item => ({ item, distance: distanceToPolylineMeters(point, item.path && item.path.length >= 2 ? item.path : [[item.start_lat, item.start_lng], [item.end_lat, item.end_lng]]) }))
    .filter(({ distance }) => distance <= maxMeters)
    .sort((a, b) => a.distance - b.distance)
    .map(({ item }) => item)
}

/**
 * Google-Maps-Link als Navigationsziel - öffnet auf dem Diensthandy die
 * installierte Maps-App (Android/iOS), ohne eigenen API-Key oder
 * kostenpflichtigen Routing-Dienst. Koordinaten sind genauer als eine
 * Adresse, deshalb Vorrang; ohne Koordinaten (z. B. Kilometerangabe ohne
 * Geokodierung) fällt es auf die Textadresse zurück. null = weder
 * Koordinaten noch Adresse vorhanden, kein Ziel möglich.
 */
export function navigationUrl(point: LatLng | null, address: string | null | undefined): string | null {
  if (point) return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`
  const trimmed = address?.trim()
  if (trimmed) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(trimmed)}`
  return null
}
