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
export interface StreetSuggestion {
  street: string
  lat: number
  lng: number
}

/**
 * Schlägt Straßennamen im Gemeindegebiet Dornbirn vor, während der
 * Zentralist tippt. Nutzt Nominatims strukturierte Suche (street/city/
 * country), damit nur Treffer aus Dornbirn zurückkommen, statt wie bei
 * geocodeLocation per Freitext-Suffix. Aufrufseitig debouncen (Nominatim-
 * Nutzungsgrenze) - hier nur Anfrage + Deduplizierung nach Straßenname.
 */
export async function suggestStreets(query: string): Promise<StreetSuggestion[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&street=${encodeURIComponent(trimmed)}&city=Dornbirn&country=Austria`
  let response: Response
  try {
    response = await fetch(url, { headers: { 'Accept-Language': 'de-AT' } })
  } catch {
    return []
  }
  if (!response.ok) return []
  const results = await response.json().catch(() => null) as { lat: string; lon: string; address?: { road?: string } }[] | null
  if (!results) return []
  const seen = new Set<string>()
  const suggestions: StreetSuggestion[] = []
  for (const item of results) {
    const road = item.address?.road
    if (!road || seen.has(road)) continue
    const lat = Number(item.lat)
    const lng = Number(item.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    seen.add(road)
    suggestions.push({ street: road, lat, lng })
  }
  return suggestions
}

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
