import { useRef, useState } from 'react'
import LeafletMap from '../../components/LeafletMap'
import StreetAutocomplete, { type StreetAutocompleteHandle } from '../../components/StreetAutocomplete'
import RoadKilometerPicker from '../../components/RoadKilometerPicker'
import { reverseGeocode } from '../../lib/geocode'
import { composeKilometerLocation } from '../../lib/roadKilometer'

export default function SonstigeStrasseOrt({
  name,
  onName,
  lat,
  lng,
  onPoint,
}: {
  name: string
  onName: (value: string) => void
  lat: number | null
  lng: number | null
  onPoint: (lat: number, lng: number, label: string) => void
}) {
  const streetRef = useRef<StreetAutocompleteHandle>(null)
  const [mode, setMode] = useState<'address' | 'km'>('address')
  const [roadQuery, setRoadQuery] = useState('')
  const [roadNumber, setRoadNumber] = useState('')
  const [roadName, setRoadName] = useState('')
  const [kilometer, setKilometer] = useState('')
  const [fromKm, setFromKm] = useState<number | null>(null)
  const [toKm, setToKm] = useState<number | null>(null)

  async function handleMapClick(nextLat: number, nextLng: number) {
    const result = await reverseGeocode(nextLat, nextLng)
    const label = [result?.street, result?.houseNumber].filter(Boolean).join(' ') || result?.displayName || `${nextLat.toFixed(5)}, ${nextLng.toFixed(5)}`
    onName(label)
    onPoint(nextLat, nextLng, label)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-xs font-semibold">
        <button type="button" onClick={() => setMode('address')} className={`px-3 py-1.5 rounded-lg ${mode === 'address' ? 'bg-blue-800 text-white' : 'border border-gray-300 text-gray-700'}`}>Adresse</button>
        <button type="button" onClick={() => setMode('km')} className={`px-3 py-1.5 rounded-lg ${mode === 'km' ? 'bg-blue-800 text-white' : 'border border-gray-300 text-gray-700'}`}>Kilometer</button>
      </div>
      {mode === 'address' ? (
        <StreetAutocomplete
          ref={streetRef}
          label="Straße / Adresse"
          value={name}
          onChange={onName}
          onSelect={item => {
            const label = item.label || [item.street, item.houseNumber].filter(Boolean).join(' ')
            onName(label)
            onPoint(item.lat, item.lng, label)
          }}
        />
      ) : (
        <RoadKilometerPicker
          query={roadQuery}
          roadNumber={roadNumber}
          roadName={roadName}
          kilometer={kilometer}
          kilometerFrom={fromKm}
          kilometerTo={toKm}
          onQueryChange={value => { setRoadQuery(value); setRoadNumber(''); setRoadName('') }}
          onRoadSelect={road => {
            setRoadQuery(`${road.roadName} (${road.roadNumber})`)
            setRoadNumber(road.roadNumber)
            setRoadName(road.roadName)
            setFromKm(road.fromKm)
            setToKm(road.toKm)
            onName(road.roadName)
          }}
          onKilometerChange={value => {
            setKilometer(value)
            if (roadNumber && value) onName(composeKilometerLocation(roadName, roadNumber, value))
          }}
          onResolved={point => {
            const label = composeKilometerLocation(roadName, point.roadNumber, point.kilometer)
            setKilometer(point.kilometer)
            onName(label)
            onPoint(point.lat, point.lng, label)
          }}
        />
      )}
      <LeafletMap
        height={280}
        markers={lat !== null && lng !== null ? [{ lat, lng, popup: name || 'Lage' }] : []}
        onMapClick={(nextLat, nextLng) => void handleMapClick(nextLat, nextLng)}
      />
    </div>
  )
}
