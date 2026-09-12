import { useEffect, useRef, useState } from 'react'
import { suggestStreets, type StreetSuggestion } from '../lib/geocode'
import { inputClass } from './ZentraleEntryEditor'

/**
 * Straßenfeld mit Live-Vorschlägen (Nominatim, auf Dornbirn eingegrenzt).
 * Tippt der Zentralist, werden nach kurzer Pause (Debounce, wegen
 * Nominatim-Nutzungsgrenze) passende Straßennamen im Gemeindegebiet
 * vorgeschlagen. Wählt er einen aus, liefert onSelect direkt die
 * Koordinaten der Straße mit - eine Hausnummer kann danach separat
 * ergänzt und darüber präziser nachgeschärft werden.
 */
export default function StreetAutocomplete({ label, value, onChange, onSelect }: { label: string; value: string; onChange: (value: string) => void; onSelect: (suggestion: StreetSuggestion) => void }) {
  const [suggestions, setSuggestions] = useState<StreetSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const requestRef = useRef(0)

  useEffect(() => {
    const query = value.trim()
    if (query.length < 2) { setSuggestions([]); setOpen(false); return }
    const requestId = ++requestRef.current
    const timer = setTimeout(() => {
      void suggestStreets(query).then(result => {
        if (requestRef.current !== requestId) return // veraltete Antwort verwerfen (Nutzer tippt schon weiter)
        setSuggestions(result)
        setOpen(result.length > 0)
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [value])

  return (
    <label className="block text-xs font-medium text-gray-600 relative">
      {label}
      <input
        className={inputClass}
        value={value}
        autoComplete="off"
        onChange={event => onChange(event.target.value)}
        onFocus={() => setOpen(suggestions.length > 0)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
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
