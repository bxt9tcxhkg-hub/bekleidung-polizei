import {
  poolMunitionOptionLabel,
  type MunitionVerbrauchInput,
} from '../../lib/einsatztraining'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

export type PoolMunitionChoice = {
  id: string
  marke: string | null
  typ: string | null
  art: string | null
  anzahl: number | null
  locationLabel: string
}

export default function MunitionVerbrauchFields({
  value,
  onChange,
  poolItems,
  disabled,
  idPrefix,
}: {
  value: MunitionVerbrauchInput
  onChange: (next: MunitionVerbrauchInput) => void
  poolItems: readonly PoolMunitionChoice[]
  disabled?: boolean
  idPrefix: string
}) {
  function set<K extends keyof MunitionVerbrauchInput>(key: K, next: MunitionVerbrauchInput[K]) {
    onChange({ ...value, [key]: next })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={`${idPrefix}-anzahl`}>
            Anzahl
          </label>
          <input
            id={`${idPrefix}-anzahl`}
            className={inputClass}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={value.anzahl}
            disabled={disabled}
            onChange={e => set('anzahl', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={`${idPrefix}-pool`}>
            Aus Pool-Bestand (optional)
          </label>
          <select
            id={`${idPrefix}-pool`}
            className={inputClass}
            value={value.poolItemId}
            disabled={disabled}
            onChange={e => {
              const id = e.target.value
              const item = poolItems.find(row => row.id === id)
              onChange({
                ...value,
                poolItemId: id,
                marke: item?.marke?.trim() ? item.marke : value.marke,
                art: item?.art?.trim() ? item.art : value.art,
              })
            }}
          >
            <option value="">Nur protokollieren</option>
            {poolItems.map(item => (
              <option key={item.id} value={item.id}>
                {poolMunitionOptionLabel(item)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={`${idPrefix}-marke`}>
            Marke
          </label>
          <input
            id={`${idPrefix}-marke`}
            className={inputClass}
            value={value.marke}
            disabled={disabled}
            onChange={e => set('marke', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={`${idPrefix}-kaliber`}>
            Kaliber
          </label>
          <input
            id={`${idPrefix}-kaliber`}
            className={inputClass}
            value={value.kaliber}
            disabled={disabled}
            onChange={e => set('kaliber', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={`${idPrefix}-art`}>
            Art
          </label>
          <input
            id={`${idPrefix}-art`}
            className={inputClass}
            value={value.art}
            disabled={disabled}
            onChange={e => set('art', e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Session-Summe. Pool-Bestand wird nur bei gewählter Munitionszeile verringert.
        Persönliche Patronen bleiben unverändert.
      </p>
    </div>
  )
}
