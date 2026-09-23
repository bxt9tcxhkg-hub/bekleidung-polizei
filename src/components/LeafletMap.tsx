import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { lookupParcel } from '../lib/kataster'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIconUrl from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

const markerIcon = L.icon({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const DORNBIRN_CENTER: [number, number] = [47.4125, 9.7417]

const MAP_BASEMAPS = [
  { id: 'karte', label: 'Karte' },
  { id: 'luftbild', label: 'Luftbild' },
  { id: 'topo', label: 'Topo' },
  { id: 'kataster', label: 'Kataster' },
] as const

type MapBasemap = (typeof MAP_BASEMAPS)[number]['id']

export interface MapMarker {
  lat: number
  lng: number
  popup?: string
  color?: string
  label?: string
  selected?: boolean
  related?: boolean
  onClick?: () => void
}

export interface MapLine {
  points: readonly [number, number][]
  popup?: string
  color?: string
  dashed?: boolean
}

export interface MapCircle {
  lat: number
  lng: number
  radiusMeters: number
  popup?: string
  color?: string
  fillColor?: string
  fillOpacity?: number
}

function vogisWms(mapfile: string, layers: string, format = 'image/jpeg', onTileError?: (event: L.TileErrorEvent) => void): L.TileLayer.WMS {
  const layer = L.tileLayer.wms(`https://vogis.cnv.at/mapserver/mapserv?map=${mapfile}`, {
    layers,
    format,
    transparent: format.includes('png'),
    version: '1.1.1',
    attribution: 'VoGIS Land Vorarlberg (CC BY 4.0)',
    maxZoom: 19,
  })
  if (onTileError) layer.on('tileerror', onTileError)
  return layer
}

// Ein WMS-Tile, das nicht geladen werden kann, bleibt bei Leaflet einfach
// leer - kein Fehler in der UI. tileerror macht das sichtbar, statt dass es
// wie "kein Grundstückslayer vorhanden" aussieht (siehe LeafletMap unten).
function createBasemapLayer(id: MapBasemap, onTileError?: (event: L.TileErrorEvent) => void): L.Layer {
  if (id === 'luftbild') return vogisWms('i_luftbilder_r_wms.map', 'ef2025_10cm', 'image/jpeg', onTileError)
  if (id === 'topo') return vogisWms('i_topographie_r_wms.map', 'topokarte_isoli_text_20t', 'image/jpeg', onTileError)
  if (id === 'kataster') {
    const group = L.layerGroup()
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(group)
    // Grundstück_Nr_grp mit Umlaut - vogis:Grundstueck_Nr_grp (ue statt ü)
    // existiert nicht und lieferte eine WMS ServiceException "LayerNotDefined"
    // (per GetCapabilities/GetMap-Test gegen den echten Dienst verifiziert).
    const wms = L.tileLayer.wms('https://vogis.cnv.at/geoserver/vogis/wms', {
      layers: 'DKM_grp,Grundstück_Nr_grp',
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      attribution: 'DKM / VoGIS (CC BY 4.0)',
      maxZoom: 19,
    })
    if (onTileError) wms.on('tileerror', onTileError)
    wms.addTo(group)
    return group
  }
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  })
}

export default function LeafletMap(props: {
  markers: readonly MapMarker[]
  lines?: readonly MapLine[]
  circles?: readonly MapCircle[]
  height?: number
  zoom?: number
  focus?: { lat: number, lng: number, zoom?: number } | null
  onMapClick?: (lat: number, lng: number) => void
  fitLines?: boolean
  incidentKey?: string | number | null
}) {
  const markers = props.markers
  const lines = props.lines
  const circles = props.circles
  const height = props.height ?? 520
  const zoom = props.zoom
  const focus = props.focus
  const onMapClick = props.onMapClick
  const fitLines = props.fitLines !== false
  const incidentKey = props.incidentKey ?? null
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const baseLayerRef = useRef<L.Layer | null>(null)
  const onMapClickRef = useRef(onMapClick)
  const [basemap, setBasemap] = useState<MapBasemap>('karte')
  const [parcelLabel, setParcelLabel] = useState('')
  const [tileError, setTileError] = useState(false)
  useEffect(() => { onMapClickRef.current = onMapClick })
  useEffect(() => { setBasemap('karte') }, [incidentKey])

  const pin = focus ?? markers.find(marker => marker.selected) ?? (markers.length === 1 ? markers[0] : null)
  const pinLat = pin ? pin.lat : null
  const pinLng = pin ? pin.lng : null
  useEffect(() => {
    if (pinLat === null || pinLng === null) { setParcelLabel(''); return }
    let cancelled = false
    setParcelLabel('KG/GST ...')
    void lookupParcel(pinLat, pinLng).then(parcel => {
      if (!cancelled) setParcelLabel(parcel?.label ?? '')
    }).catch(() => { if (!cancelled) setParcelLabel('') })
    return () => { cancelled = true }
  }, [pinLat, pinLng])

  useEffect(() => {
    if (!containerRef.current) return
    // center/zoom müssen schon beim Erzeugen gesetzt sein: ohne initiale Ansicht
    // ist die Karte noch nicht "geladen" - ruft der Marker/Kreis-Effekt direkt
    // danach circle.getBounds() auf (z. B. bei Adresssuche mit Radius-Kreis),
    // wirft Leaflet "Cannot read properties of undefined (reading
    // 'layerPointToLatLng')", weil die Kreisprojektion noch fehlt.
    const map = L.map(containerRef.current, { attributionControl: true, center: DORNBIRN_CENTER, zoom: 13 })
    mapRef.current = map
    map.on('click', (event: L.LeafletMouseEvent) => {
      const handler = onMapClickRef.current
      if (handler) handler(event.latlng.lat, event.latlng.lng)
    })
    return () => { map.remove(); mapRef.current = null; baseLayerRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    setTileError(false)
    const next = createBasemapLayer(basemap, () => setTileError(true))
    next.addTo(map)
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current)
    baseLayerRef.current = next
  }, [basemap])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const layerGroup = L.layerGroup().addTo(map)
    markers.forEach(marker => {
      let icon: L.Icon | L.DivIcon = markerIcon
      if (marker.color || marker.label) {
        const size = marker.selected ? 42 : 34
        const pinEl = document.createElement('div')
        pinEl.style.width = `${size}px`
        pinEl.style.height = `${size}px`
        pinEl.style.borderRadius = '50% 50% 50% 0'
        pinEl.style.transform = 'rotate(-45deg)'
        pinEl.style.background = marker.color ?? '#2563eb'
        pinEl.style.border = marker.selected ? '4px solid #ffffff' : '3px solid #ffffff'
        pinEl.style.boxShadow = marker.selected
          ? '0 0 0 3px #111827, 0 4px 10px rgb(0 0 0 / 35%)'
          : marker.related
            ? '0 0 0 3px #a5b4fc, 0 3px 9px rgb(0 0 0 / 30%)'
            : '0 2px 7px rgb(0 0 0 / 30%)'
        pinEl.style.display = 'flex'
        pinEl.style.alignItems = 'center'
        pinEl.style.justifyContent = 'center'
        const label = document.createElement('span')
        label.textContent = marker.label ?? ''
        label.style.transform = 'rotate(45deg)'
        label.style.color = '#ffffff'
        label.style.fontSize = marker.selected ? '14px' : '12px'
        label.style.fontWeight = '800'
        label.style.lineHeight = '1'
        pinEl.appendChild(label)
        icon = L.divIcon({
          html: pinEl,
          className: '',
          iconSize: [size, size],
          iconAnchor: [Math.round(size / 2), size],
          popupAnchor: [0, -size],
        })
      }
      const placed = L.marker([marker.lat, marker.lng], { icon, zIndexOffset: marker.selected ? 1000 : 0 }).addTo(layerGroup)
      if (marker.onClick) placed.on('click', marker.onClick)
      if (marker.popup) {
        const popupEl = document.createElement('div')
        popupEl.textContent = marker.popup
        placed.bindPopup(popupEl)
      }
    })
    ;(lines ?? []).forEach(line => {
      const placed = L.polyline(line.points as [number, number][], {
        color: line.color ?? '#2563eb',
        weight: 4,
        dashArray: line.dashed ? '8 6' : undefined,
      }).addTo(layerGroup)
      if (line.popup) {
        const popupEl = document.createElement('div')
        popupEl.textContent = line.popup
        placed.bindPopup(popupEl)
      }
    })
    const circleBounds: L.LatLngBounds[] = []
    ;(circles ?? []).forEach(circle => {
      const placed = L.circle([circle.lat, circle.lng], {
        radius: circle.radiusMeters,
        color: circle.color ?? '#dc2626',
        fillColor: circle.fillColor ?? circle.color ?? '#ef4444',
        fillOpacity: circle.fillOpacity ?? 0.14,
        weight: 2,
      }).addTo(layerGroup)
      circleBounds.push(placed.getBounds())
      if (circle.popup) {
        const popupEl = document.createElement('div')
        popupEl.textContent = circle.popup
        placed.bindPopup(popupEl)
      }
    })
    const allPoints: [number, number][] = [
      ...markers.map(marker => [marker.lat, marker.lng] as [number, number]),
      ...(fitLines ? (lines ?? []).flatMap(line => line.points as [number, number][]) : []),
    ]
    if (focus) {
      map.setView([focus.lat, focus.lng], focus.zoom ?? zoom ?? 16)
    } else if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints)
      circleBounds.forEach(circle => bounds.extend(circle))
      map.fitBounds(bounds.pad(0.25), { maxZoom: zoom ?? 16 })
    } else if (circleBounds.length > 0) {
      const bounds = circleBounds[0]
      circleBounds.slice(1).forEach(circle => bounds.extend(circle))
      map.fitBounds(bounds.pad(0.25), { maxZoom: zoom ?? 16 })
    } else {
      map.setView(DORNBIRN_CENTER, zoom ?? 13)
    }
    return () => { layerGroup.remove() }
  }, [markers, lines, circles, zoom, focus, fitLines])

  return (
    <div className="relative isolate">
      <div className="absolute top-2 right-2 z-[500] flex flex-wrap justify-end gap-1 rounded-lg bg-white/95 p-1 shadow border border-gray-200">
        {MAP_BASEMAPS.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setBasemap(item.id)}
            className={`px-2 py-1 text-xs font-medium rounded-md ${basemap === item.id ? 'bg-blue-800 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div ref={containerRef} style={{ height }} className="rounded-xl overflow-hidden border border-gray-200" />
      {tileError ? <p className="mt-1.5 px-1 text-xs text-amber-700">Diese Kartenebene konnte nicht vollständig geladen werden (VoGIS-Dienst nicht erreichbar oder Anfrage abgelehnt).</p> : null}
      <div className="mt-1.5 px-1 text-xs text-gray-600">
        {parcelLabel ? <p className="font-medium text-gray-800">{parcelLabel}</p> : null}
        <p>
          <span className="font-medium text-gray-700">KG</span> Katastralgemeinde
          <span className="mx-2 text-gray-300">|</span>
          <span className="font-medium text-gray-700">GST</span> Grundstuecksnummer
        </p>
      </div>
    </div>
  )
}
