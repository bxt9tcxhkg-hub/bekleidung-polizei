import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIconUrl from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// Leaflets Standard-Icon referenziert Bildpfade relativ zum CSS, was unter
// Vite/Bundlern nicht auflöst - deshalb hier explizit über importierte
// Asset-URLs gesetzt, statt L.Icon.Default zu verbiegen.
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

export interface MapMarker {
  lat: number
  lng: number
  popup?: string
  /** Optional eindeutige Farbe, z. B. zur Zuordnung eines Einsatzes zur Karte. */
  color?: string
  /** Kurze sichtbare Kennzeichnung im Marker (z. B. Einsatznummer). */
  label?: string
  /** Hebt den aktuell ausgewählten Marker gegenüber den übrigen hervor. */
  selected?: boolean
  /** Optionaler Klick-Handler, z. B. um die zugehörige Einsatzkarte zu öffnen. */
  onClick?: () => void
}

export interface MapLine {
  points: readonly [number, number][]
  popup?: string
  /** CSS-Farbe der Linie, z. B. für den Status einer Baustelle. Default: Blau wie die Standard-Marker. */
  color?: string
  /** Gestrichelt statt durchgezogen darstellen, z. B. für noch unbestätigte Meldungen. */
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

export default function LeafletMap({
  markers,
  lines,
  circles,
  height = 220,
  zoom,
  focus,
  onMapClick,
  fitLines = true,
}: {
  markers: readonly MapMarker[]
  lines?: readonly MapLine[]
  circles?: readonly MapCircle[]
  height?: number
  zoom?: number
  /** Zentriert die Karte bewusst auf einen ausgewählten Punkt, statt alle Ebenen einzupassen. */
  focus?: { lat: number; lng: number; zoom?: number } | null
  /** Wird bei jedem Klick auf die Karte mit den geklickten Koordinaten aufgerufen - z. B. zum Einzeichnen eines Streckenabschnitts. */
  onMapClick?: (lat: number, lng: number) => void
  /** Ob Linien (z. B. Baustellen) den automatischen Kartenausschnitt mitbestimmen. Default true (z. B. beim Einzeichnen einer Baustelle gewünscht) - false, wenn Linien nur Hintergrundinfo sind und die Ansicht nicht verschieben sollen (z. B. "Aktive Einsätze"-Karte). */
  fitLines?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const onMapClickRef = useRef(onMapClick)
  useEffect(() => { onMapClickRef.current = onMapClick })

  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current, { attributionControl: true })
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map)
    map.on('click', (event: L.LeafletMouseEvent) => onMapClickRef.current?.(event.latlng.lat, event.latlng.lng))
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const layerGroup = L.layerGroup().addTo(map)
    markers.forEach(marker => {
      let icon: L.Icon | L.DivIcon = markerIcon
      if (marker.color || marker.label) {
        const size = marker.selected ? 42 : 34
        const pin = document.createElement('div')
        pin.style.width = `${size}px`
        pin.style.height = `${size}px`
        pin.style.borderRadius = '50% 50% 50% 0'
        pin.style.transform = 'rotate(-45deg)'
        pin.style.background = marker.color ?? '#2563eb'
        pin.style.border = marker.selected ? '4px solid #ffffff' : '3px solid #ffffff'
        pin.style.boxShadow = marker.selected ? '0 0 0 3px #111827, 0 4px 10px rgb(0 0 0 / 35%)' : '0 2px 7px rgb(0 0 0 / 30%)'
        pin.style.display = 'flex'
        pin.style.alignItems = 'center'
        pin.style.justifyContent = 'center'
        const label = document.createElement('span')
        label.textContent = marker.label ?? ''
        label.style.transform = 'rotate(45deg)'
        label.style.color = '#ffffff'
        label.style.fontSize = marker.selected ? '14px' : '12px'
        label.style.fontWeight = '800'
        label.style.lineHeight = '1'
        pin.appendChild(label)
        icon = L.divIcon({
          html: pin,
          className: '',
          iconSize: [size, size],
          iconAnchor: [Math.round(size / 2), size],
          popupAnchor: [0, -size],
        })
      }
      const placed = L.marker([marker.lat, marker.lng], { icon, zIndexOffset: marker.selected ? 1000 : 0 }).addTo(layerGroup)
      if (marker.onClick) placed.on('click', marker.onClick)
      if (marker.popup) {
        // bindPopup rendert einen String als HTML - Ortsangaben/Sachverhalte
        // sind Freitext von Nutzern, deshalb hier als reiner Text statt als
        // Markup übergeben (verhindert Skript-Injektion über Marker-Popups).
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

  // isolate: Leaflets interne Ebenen (Zoom-Controls, Marker, Popups) haben
  // von Haus aus hohe z-index-Werte (bis 1000). Ohne eigenen Stacking-
  // Context "durchdringen" sie Overlays mit niedrigerem z-index, z. B. das
  // Meldungs-Modal - eine Hintergrundkarte konnte so über dem Modal
  // erscheinen. isolate kapselt die Karte in ihrem eigenen Kontext.
  return <div ref={containerRef} style={{ height }} className="rounded-xl overflow-hidden border border-gray-200 isolate" />
}
