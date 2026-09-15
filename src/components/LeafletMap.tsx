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
  onMapClick,
  fitLines = true,
}: {
  markers: readonly MapMarker[]
  lines?: readonly MapLine[]
  circles?: readonly MapCircle[]
  height?: number
  zoom?: number
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
      const placed = L.marker([marker.lat, marker.lng], { icon: markerIcon }).addTo(layerGroup)
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
    if (allPoints.length > 0) {
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
  }, [markers, lines, circles, zoom, fitLines])

  // isolate: Leaflets interne Ebenen (Zoom-Controls, Marker, Popups) haben
  // von Haus aus hohe z-index-Werte (bis 1000). Ohne eigenen Stacking-
  // Context "durchdringen" sie Overlays mit niedrigerem z-index, z. B. das
  // Meldungs-Modal - eine Hintergrundkarte konnte so über dem Modal
  // erscheinen. isolate kapselt die Karte in ihrem eigenen Kontext.
  return <div ref={containerRef} style={{ height }} className="rounded-xl overflow-hidden border border-gray-200 isolate" />
}
