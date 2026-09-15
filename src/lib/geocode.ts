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

/**
 * Berechnet eine Route entlang des tatsächlichen Straßennetzes zwischen zwei
 * Punkten (statt einer Luftlinie), über den öffentlichen OSRM-Demo-Dienst
 * (Open Source Routing Machine, ebenfalls auf OpenStreetMap-Daten). Wie bei
 * Nominatim kostenlos und ohne API-Key, aber nur für gelegentliche Anfragen
 * gedacht (Fair-Use) - deshalb nur beim Speichern/Zeichnen aufrufen, nicht
 * laufend. Bei Fehlern (Dienst nicht erreichbar, keine Route gefunden) wird
 * null zurückgegeben - aufrufseitig fällt die Karte dann auf die Luftlinie
 * zwischen den beiden Punkten zurück, es gibt also keinen Hartausfall.
 */
export async function routeAlongRoad(start: { lat: number; lng: number }, end: { lat: number; lng: number }): Promise<[number, number][] | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`
  let response: Response
  try {
    response = await fetch(url)
  } catch {
    return null
  }
  if (!response.ok) return null
  const result = await response.json().catch(() => null) as { code?: string; routes?: { geometry?: { coordinates?: [number, number][] } }[] } | null
  const coordinates = result?.code === 'Ok' ? result.routes?.[0]?.geometry?.coordinates : null
  if (!coordinates || coordinates.length < 2) return null
  // GeoJSON liefert [lng, lat] - Leaflet erwartet [lat, lng].
  const points: [number, number][] = coordinates
    .filter((pair): pair is [number, number] => Array.isArray(pair) && Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
    .map(([lng, lat]) => [lat, lng])
  return points.length >= 2 ? points : null
}

export interface ReverseGeocodeResult {
  street: string
  houseNumber: string
  displayName: string
}

/**
 * Löst einen Kartenpunkt (Klick auf die Karte) in eine Adresse auf - als
 * Alternative zur Texteingabe von Straße/Hausnummer beim Erfassen eines
 * Einsatzortes. Wie bei den übrigen Nominatim-Aufrufen nur bei einer
 * expliziten Nutzeraktion (Klick), nicht laufend während des Bewegens.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`
  let response: Response
  try {
    response = await fetch(url, { headers: { 'Accept-Language': 'de-AT' } })
  } catch {
    return null
  }
  if (!response.ok) return null
  const result = await response.json().catch(() => null) as { display_name?: string; address?: { road?: string; house_number?: string } } | null
  if (!result?.address) return null
  return {
    street: result.address.road ?? '',
    houseNumber: result.address.house_number ?? '',
    displayName: result.display_name ?? '',
  }
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
