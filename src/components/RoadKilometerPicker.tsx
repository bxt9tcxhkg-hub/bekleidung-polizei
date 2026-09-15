import { useEffect, useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import { inputClass } from './ZentraleEntryEditor'
import {
  formatKilometer,
  locateRoadKilometer,
  suggestRoadKilometers,
  type RoadKilometerPoint,
  type RoadKilometerSuggestion,
} from '../lib/roadKilometer'

export default function RoadKilometerPicker({
  query,
  roadNumber,
  roadName,
  kilometer,
  kilometerFrom,
  kilometerTo,
  onQueryChange,
  onRoadSelect,
  onKilometerChange,
  onResolved,
}: {
  query: string
  roadNumber: string
  roadName: string
  kilometer: string
  kilometerFrom: number | null
  kilometerTo: number | null
  onQueryChange: (value: string) => void
  onRoadSelect: (road: RoadKilometerSuggestion) => void
  onKilometerChange: (value: string) => void
  onResolved: (point: RoadKilometerPoint) => void
}) {
  const [suggestions, setSuggestions] = useState<RoadKilometerSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const trimmed = query.trim()
    const selectedLabel = roadNumber ? `${roadName} (${roadNumber})` : ''
    if (trimmed.length < 2 || trimmed === selectedLabel) {
      setSuggestions([])
      setSearching(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      setSearching(true)
      setError('')
      void suggestRoadKilometers(trimmed)
        .then(roads => {
          if (!cancelled) setSuggestions(roads)
        })
        .catch(cause => {
          if (!cancelled) {
            setSuggestions([])
            setError(cause instanceof Error ? cause.message : 'Landesstraßen konnten nicht geladen werden.')
          }
        })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, roadName, roadNumber])

  async function resolvePoint() {
    if (!roadNumber || !kilometer.trim()) return
    setResolving(true)
    setError('')
    try {
      onResolved(await locateRoadKilometer(roadNumber, kilometer))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Straßenkilometer konnte nicht gefunden werden.')
    } finally {
      setResolving(false)
    }
  }

  return <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-3 items-start">
      <div className="relative">
        <label className="block text-xs font-medium text-gray-600">
          Straße oder Landesstraße
          <input
            className={inputClass}
            value={query}
            placeholder="z. B. Bödelestraße oder L 48"
            autoComplete="off"
            onChange={event => {
              onQueryChange(event.target.value)
              setError('')
            }}
          />
        </label>
        {searching ? <p className="text-xs text-gray-500 mt-1">Amtliche Straßen werden gesucht…</p> : null}
        {suggestions.length > 0 ? <div className="absolute z-[1200] mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {suggestions.map(road => <button
            key={`${road.roadNumber}-${road.roadName}`}
            type="button"
            onClick={() => {
              onRoadSelect(road)
              setSuggestions([])
              setError('')
            }}
            className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-100 last:border-0"
          >
            <span className="block text-sm font-semibold text-gray-900">{road.roadName} ({road.roadNumber})</span>
            <span className="block text-xs text-gray-500">km {formatKilometer(road.fromKm)} bis {formatKilometer(road.toKm)}</span>
          </button>)}
        </div> : null}
      </div>
      <label className="block text-xs font-medium text-gray-600">
        Kilometer
        <input
          className={inputClass}
          value={kilometer}
          placeholder="5,7"
          inputMode="decimal"
          disabled={!roadNumber}
          onChange={event => {
            onKilometerChange(event.target.value)
            setError('')
          }}
          onKeyDown={event => {
            if (event.key === 'Enter' && roadNumber && kilometer.trim()) {
              event.preventDefault()
              void resolvePoint()
            }
          }}
        />
        {roadNumber && kilometerFrom !== null && kilometerTo !== null
          ? <span className="block mt-1 text-[11px] text-gray-500">Gültig: km {formatKilometer(kilometerFrom)}–{formatKilometer(kilometerTo)}</span>
          : null}
      </label>
      <button
        type="button"
        onClick={() => void resolvePoint()}
        disabled={!roadNumber || !kilometer.trim() || resolving}
        className="sm:mt-5 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-blue-800 text-white text-sm font-semibold disabled:opacity-50"
      >
        {resolving ? <Search className="w-4 h-4 animate-pulse" /> : <MapPin className="w-4 h-4" />}
        {resolving ? 'Suche…' : 'Punkt anzeigen'}
      </button>
    </div>
    {roadNumber ? <p className="text-sm font-semibold text-blue-900">Ausgewählt: {roadName} ({roadNumber})</p> : null}
    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>
}
