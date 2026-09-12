import { useRef, useState } from 'react'
import { suggestStreets, type StreetSuggestion } from '../lib/geocode'
import { inputClass } from './ZentraleEntryEditor'

const MIN_LENGTH = 3
const fieldClass = inputClass.replace('mt-1 ', '')

/**
 * Straßenfeld mit Vorschlägen im Gemeindegebiet Dornbirn (Nominatim,
 * strukturiert auf street/city/country eingegrenzt). Die Suche wird
 * bewusst NICHT bei jedem Tastendruck ausgelöst - Nominatims
 * Nutzungsrichtlinie verbietet Autocomplete-artige Anfragen ausdrücklich
 * ("no auto-complete style searches"), egal wie stark man debounced.
 * Stattdessen löst der Zentralist die Suche gezielt per Enter oder Button
 * aus, wie bei einer normalen Suche.
 */
export default function StreetAutocomplete({ label, value, onChange, onSelect }: { label: string; value: string; onChange: (value: string) => void; onSelect: (suggestion: StreetSuggestion) => void }) {
  const [suggestions, setSuggestions] = useState<StreetSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const requestRef = useRef(0)

  async function search() {
    // Generation zuerst erhöhen, auch bei zu kurzer Eingabe - sonst könnte
    // eine noch laufende ältere Anfrage die Vorschläge für den inzwischen
    // geänderten Text nachträglich wieder aufpoppen lassen.
    const requestId = ++requestRef.current
    const query = value.trim()
    if (query.length < MIN_LENGTH) { setSearching(false); setSuggestions([]); setOpen(false); return }
    setSearching(true)
    const result = await suggestStreets(query)
    if (requestRef.current !== requestId) return // veraltete Antwort verwerfen
    setSearching(false)
    setSuggestions(result)
    setOpen(result.length > 0)
  }

  return (
    <label className="block text-xs font-medium text-gray-600 relative">
      {label}
      <div className="mt-1 flex gap-2">
        <input
          className={fieldClass}
          value={value}
          autoComplete="off"
          onChange={event => { onChange(event.target.value); requestRef.current++; setSearching(false); setOpen(false) }}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void search() } }}
        />
        <button
          type="button"
          disabled={value.trim().length < MIN_LENGTH || searching}
          onClick={() => void search()}
          className="shrink-0 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          {searching ? '…' : 'Suchen'}
        </button>
      </div>
      {open ? (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-52 overflow-y-auto">
          {suggestions.map(suggestion => (
            <li key={suggestion.street}>
              <button
                type="button"
                className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-blue-50"
                onMouseDown={event => event.preventDefault()}
                onClick={() => { onSelect(suggestion); setOpen(false) }}
              >
                {suggestion.street}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </label>
  )
}
