export interface KatasterParcel {
  kg: string
  gst: string
  municipality: string
  label: string
}

function parseProps(properties: Record<string, unknown>): KatasterParcel | null {
  const kg = String(properties.kg ?? '').trim()
  const rawGst = String(properties.gnr ?? properties.gstnr ?? '').trim()
  const gst = rawGst.replace(/^\d+\./, '').replace(/^\./, '.')
  const municipality = String(properties.pgem_name ?? '').trim()
  if (!kg && !gst) return null
  const gstLabel = gst.startsWith('.') ? gst.slice(1) : gst
  const parts = [
    kg ? `KG ${kg}` : null,
    municipality || null,
    gstLabel ? `GST ${gstLabel}` : null,
  ].filter(Boolean)
  return { kg, gst: gstLabel, municipality, label: parts.join(' · ') }
}

/** Liest KG und Grundstücksnummer am Punkt aus VoGIS DKM (vogis:gst). */
export async function lookupParcel(lat: number, lng: number): Promise<KatasterParcel | null> {
  const pad = 0.00012
  const bbox = `${lng - pad},${lat - pad},${lng + pad},${lat + pad},EPSG:4326`
  const params = new URLSearchParams({
    service: 'WFS',
    version: '1.1.0',
    request: 'GetFeature',
    typeName: 'vogis:gst',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    bbox,
    maxFeatures: '8',
  })
  const response = await fetch(`https://vogis.cnv.at/geoserver/vogis/wfs?${params}`)
  if (!response.ok) return null
  const data = await response.json() as {
    features?: { properties?: Record<string, unknown>; bbox?: number[] }[]
  }
  const features = data.features ?? []
  const hit = features.find(feature => {
    const box = feature.bbox
    if (!box || box.length < 4) return true
    return lng >= box[0] && lat >= box[1] && lng <= box[2] && lat <= box[3]
  }) ?? features[0]
  if (!hit?.properties) return null
  return parseProps(hit.properties)
}
