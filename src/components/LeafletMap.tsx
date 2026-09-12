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

export default function LeafletMap({ markers, height = 220, zoom }: { markers: readonly MapMarker[]; height?: number; zoom?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current, { attributionControl: true })
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map)
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const layerGroup = L.layerGroup().addTo(map)
    markers.forEach(marker => {
      const placed = L.marker([marker.lat, marker.lng], { icon: markerIcon }).addTo(layerGroup)
      if (marker.popup) placed.bindPopup(marker.popup)
    })
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(marker => [marker.lat, marker.lng] as [number, number]))
      map.fitBounds(bounds.pad(0.25), { maxZoom: zoom ?? 16 })
    } else {
      map.setView(DORNBIRN_CENTER, zoom ?? 13)
    }
    return () => { layerGroup.remove() }
  }, [markers, zoom])

  return <div ref={containerRef} style={{ height }} className="rounded-xl overflow-hidden border border-gray-200" />
}
