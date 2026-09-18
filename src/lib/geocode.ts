export interface GeocodeResult {
  lat: number
  lng: number
  displayName: string
}

export interface StreetSuggestion {
  street: string
  lat: number
  lng: number
  houseNumber?: string
  label?: string
}

export async function suggestAddresses(query: string): Promise<StreetSuggestion[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const escaped = trimmed.replace(/'/g, "''")
  const compact = escaped.toLowerCase().replace(/\s+/g, '')
  const filter = `gemeinde='Dornbirn' AND (strasse ILIKE '%${escaped}%' OR mcodelc ILIKE '%${compact}%')`
  const params = new URLSearchParams({
    service: 'WFS', version: '1.1.0', request: 'GetFeature',
    typeName: 'vogis:adressen', outputFormat: 'application/json',
    srsName: 'EPSG:4326', maxFeatures: '15', CQL_FILTER: filter,
  })
  let response: Response
  try {
    response = await fetch(`https://vogis.cnv.at/geoserver/vogis/wfs?${params}`)
  } catch { return [] }
  if (!response.ok) return []
  const data = await response.json().catch(() => null) as {
    features?: { geometry?: { coordinates?: unknown }; properties?: Record<string, string | null> }[]
  } | null
  const suggestions: StreetSuggestion[] = []
  const seen = new Set<string>()
  for (const feature of data?.features ?? []) {
    const street = feature.properties?.strasse?.trim() ?? ''
    const houseNumber = feature.properties?.hausnr?.trim() ?? ''
    if (!street) continue
    const label = houseNumber ? `${street} ${houseNumber}` : street
    if (seen.has(label)) continue
    const coords = feature.geometry?.coordinates
    let lng = NaN
    let lat = NaN
    if (Array.isArray(coords) && typeof coords[0] === 'number') {
      lng = Number(coords[0]); lat = Number(coords[1])
    } else if (Array.isArray(coords) && Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
      lng = Number(coords[0][0]); lat = Number(coords[0][1])
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    seen.add(label)
    suggestions.push({ street, houseNumber, label, lat, lng })
  }
  return suggestions
}

export async function suggestStreets(query: string): Promise<StreetSuggestion[]> {
  const fromVogis = await suggestAddresses(query)
  if (fromVogis.length > 0) return fromVogis
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

/**
 * cityHint wird an die Anfrage angehängt, damit z. B. "Marktplatz 1" nicht
 * bundesweit mehrdeutig ist (Standard: Dornbirn, für Baustellen/Straßen-
 * zustand/Einsatzort/Aussendienst-Routen immer im Stadtgebiet). Eine Adresse,
 * die selbst schon PLZ/Ort enthält (z. B. Wohnsitz eines Gefährders bei
 * BV/AV & EV, kann außerhalb von Dornbirn liegen), braucht keinen erzwungenen
 * Orts-Zusatz - dafür cityHint explizit auf null setzen.
 */
export async function geocodeLocation(query: string, cityHint: string | null = 'Dornbirn'): Promise<GeocodeResult | null> {
  const trimmed = query.trim()
  if (!trimmed) return null
  const q = cityHint ? `${trimmed}, ${cityHint}, Österreich` : `${trimmed}, Österreich`
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=at&q=${encodeURIComponent(q)}`
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
