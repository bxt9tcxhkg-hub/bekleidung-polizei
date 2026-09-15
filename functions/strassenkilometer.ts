import { isAuthenticated, type AuthEnv } from './_auth'

interface Env extends AuthEnv {}

interface VogisFeature {
  geometry?: { coordinates?: unknown }
  properties?: Record<string, unknown>
}

interface VogisResponse {
  features?: VogisFeature[]
}

const VOGIS_WFS = 'https://vogis.cnv.at/geoserver/vogis/ows'

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function cqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function vogis(parameters: Record<string, string>): Promise<VogisResponse> {
  const url = new URL(VOGIS_WFS)
  url.search = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    ...parameters,
  }).toString()
  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`VoGIS antwortete mit HTTP ${response.status}`)
  return response.json() as Promise<VogisResponse>
}

function textProperty(feature: VogisFeature, name: string): string {
  const value = feature.properties?.[name]
  return typeof value === 'string' ? value.trim() : ''
}

function numberProperty(feature: VogisFeature, name: string): number | null {
  const value = Number(feature.properties?.[name])
  return Number.isFinite(value) ? value : null
}

export const onRequestGet: PagesFunction<Env> = async context => {
  if (!await isAuthenticated(context.request, context.env)) return json({ error: 'Nicht angemeldet.' }, 401)

  const requestUrl = new URL(context.request.url)
  const action = requestUrl.searchParams.get('action')

  try {
    if (action === 'suggest') {
      const query = (requestUrl.searchParams.get('q') ?? '').trim().slice(0, 80)
      if (query.length < 2) return json({ roads: [] })
      const compact = query.toLocaleUpperCase('de-AT').replace(/\s+/g, '')
      const containsQuery = `%${query}%`
      const conditions = [
        `str_name ILIKE ${cqlString(containsQuery)}`,
        `str_nr ILIKE ${cqlString(containsQuery)}`,
        `gip_name ILIKE ${cqlString(containsQuery)}`,
      ]
      if (/^[A-ZÄÖÜ]+\d/.test(compact)) conditions.push(`str_nr ILIKE ${cqlString(`%${compact}%`)}`)
      const data = await vogis({
        typeNames: 'vogis:landstrasse_namen',
        propertyName: 'str_nr,str_name,str_von_km,str_bis_km',
        count: '80',
        CQL_FILTER: `status = '5 - aktiv' AND (${conditions.join(' OR ')})`,
      })
      const byRoad = new Map<string, { roadNumber: string; roadName: string; fromKm: number; toKm: number }>()
      for (const feature of data.features ?? []) {
        const roadNumber = textProperty(feature, 'str_nr').replace(/\s+/g, '')
        const roadName = textProperty(feature, 'str_name')
        const fromKm = numberProperty(feature, 'str_von_km')
        const toKm = numberProperty(feature, 'str_bis_km')
        if (!roadNumber || !roadName || fromKm === null || toKm === null) continue
        const key = `${roadNumber}|${roadName}`
        const current = byRoad.get(key)
        if (current) {
          current.fromKm = Math.min(current.fromKm, fromKm)
          current.toKm = Math.max(current.toKm, toKm)
        } else {
          byRoad.set(key, { roadNumber: roadNumber.replace(/^([A-ZÄÖÜ]+)(\d)/, '$1 $2'), roadName, fromKm, toKm })
        }
      }
      const roads = [...byRoad.values()]
        .sort((a, b) => a.roadName.localeCompare(b.roadName, 'de-AT') || a.roadNumber.localeCompare(b.roadNumber, 'de-AT'))
        .slice(0, 20)
      return json({ roads })
    }

    if (action === 'locate') {
      const road = (requestUrl.searchParams.get('road') ?? '').toLocaleUpperCase('de-AT').replace(/\s+/g, '')
      const rawKm = (requestUrl.searchParams.get('km') ?? '').replace(',', '.')
      if (!/^[A-ZÄÖÜ]+\d+[A-Z0-9/-]*$/.test(road) || !/^\d+(?:\.\d)?$/.test(rawKm)) {
        return json({ error: 'Ungültige Landesstraße oder Kilometrierung.' }, 400)
      }
      const kilometer = Number(rawKm)
      const data = await vogis({
        typeNames: 'vogis:strasse_km_100m_landstrasse',
        propertyName: 'str_nr,label,the_geom',
        count: '5',
        CQL_FILTER: `str_nr = ${cqlString(road)} AND label = ${kilometer.toFixed(1)}`,
      })
      const feature = data.features?.[0]
      const coordinates = feature?.geometry?.coordinates
      const point = Array.isArray(coordinates) && Array.isArray(coordinates[0]) ? coordinates[0] : null
      const lng = Number(point?.[0])
      const lat = Number(point?.[1])
      if (!feature || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return json({ error: 'Dieser Straßenkilometer ist in den amtlichen Daten nicht vorhanden. Bitte Straße und Kilometer prüfen.' }, 404)
      }
      return json({
        roadNumber: road.replace(/^([A-ZÄÖÜ]+)(\d)/, '$1 $2'),
        kilometer: kilometer.toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        lat,
        lng,
      })
    }

    return json({ error: 'Unbekannte Abfrage.' }, 400)
  } catch {
    return json({ error: 'Die amtlichen Kilometrierungsdaten sind derzeit nicht erreichbar.' }, 502)
  }
}
