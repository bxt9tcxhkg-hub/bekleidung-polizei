import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { suggestStreets, type StreetSuggestion } from '../lib/geocode'
import { inputClass } from './ZentraleEntryEditor'

const MIN_LENGTH = 3
const fieldClass = inputClass.replace('mt-1 ', '')

export interface StreetAutocompleteHandle {
  search: () => void
}

function fillNeighbourHouseNumber(from: HTMLElement, houseNumber: string) {
  const grid = from.closest('.grid')
  const inputs = grid?.querySelectorAll('input')
  const houseInput = inputs && inputs.length >= 2 ? inputs[1] : null
  if (!houseInput || !(houseInput instanceof HTMLInputElement)) return
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(houseInput, houseNumber)
  houseInput.dispatchEvent(new Event('input', { bubbles: true }))
}

const StreetAutocomplete = forwardRef<StreetAutocompleteHandle, { label: string; value: string; onChange: (value: string) => void; onSelect: (suggestion: StreetSuggestion) => void; onSearch?: () => void }>(
  function StreetAutocomplete({ label, value, onChange, onSelect, onSearch }, ref) {
    const [suggestions, setSuggestions] = useState<StreetSuggestion[]>([])
    const [open, setOpen] = useState(false)
    const requestRef = useRef(0)

    async function search() {
      const requestId = ++requestRef.current
      const query = value.trim()
      if (query.length < MIN_LENGTH) { setSuggestions([]); setOpen(false); return }
      const result = await suggestStreets(query)
      if (requestRef.current !== requestId) return
      setSuggestions(result)
      setOpen(result.length > 0)
      onSearch?.()
    }

    useImperativeHandle(ref, () => ({ search: () => void search() }))

    return (
      <label className="block text-xs font-medium text-gray-600 relative">
        {label}
        <input
          className={`${fieldClass} mt-1`}
          value={value}
          autoComplete="off"
          onChange={event => { onChange(event.target.value); requestRef.current++; setOpen(false) }}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void search() } }}
        />
        {open ? (
          <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-52 overflow-y-auto">
            {suggestions.map(suggestion => (
              <li key={suggestion.label ?? `${suggestion.street}-${suggestion.lat}`}>
                <button
                  type="button"
                  className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-blue-50"
                  onMouseDown={event => event.preventDefault()}
                  onClick={event => {
                    onSelect(suggestion)
                    if (suggestion.houseNumber) fillNeighbourHouseNumber(event.currentTarget, suggestion.houseNumber)
                    setOpen(false)
                  }}
                >
                  {suggestion.label ?? suggestion.street}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </label>
    )
  },
)

export default StreetAutocomplete
