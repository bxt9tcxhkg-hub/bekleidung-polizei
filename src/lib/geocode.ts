export interface GeocodeResult {
  lat: number
  lng: number
  displayName: string
}

/**
 * Löst eine Ortsangabe (Straße o. Ä.) im Gemeindegebiet Dornbirn über den
 * öffentlichen Nominatim-Dienst (OpenStreetMap) in Koordinaten auf.
 * Kostenlos, kein API-Key - dafür mit Nutzungsgrenze (Nominatim Usage
 * Policy), deshalb nur bei explizitem Klick aufrufen, nicht automatisch
 * beim Tippen.
 */
export async function geocodeLocation(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim()
  if (!trimmed) return null
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=at&q=${encodeURIComponent(`${trimmed}, Dornbirn, Österreich`)}`
  let response: Response
  try {
    response = await fetch(url, { headers: { 'Accept-Language': 'de-AT' } })
  } catch {
    return null
  }
  if (!response.ok) return null
  const results = await response.json().catch(() => null) as { lat: string; lon: string; display_name: string }[] | null
  const first = results?.[0]
  if (!first) return null
  const lat = Number(first.lat)
  const lng = Number(first.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, displayName: first.display_name }
}
