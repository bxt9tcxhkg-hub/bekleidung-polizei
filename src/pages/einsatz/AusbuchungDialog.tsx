import { X } from 'lucide-react'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function AusbuchungDialog({
  itemLabel,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
  saving,
  error,
  counted,
}: {
  itemLabel: string
  reason: string
  onReasonChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
  saving: boolean
  error: string
  counted?: {
    currentAnzahl: number
    qty: string
    onQtyChange: (value: string) => void
  }
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-900">
            {counted ? 'Anzahl ausbuchen' : 'Aus Bestand entfernen'}
          </h2>
          <button type="button" onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Schließen">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            {counted
              ? `«${itemLabel}» hat ${counted.currentAnzahl} Stück. Die ausgebuchte Menge wird abgezogen, der Rest bleibt im Bestand.`
              : `«${itemLabel}» wird ausgebucht und erscheint nicht mehr im Bestand. Der Eintrag bleibt nachvollziehbar.`}
          </p>
          {counted && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="em-ausbuchung-anzahl">
                Anzahl *
              </label>
              <input
                id="em-ausbuchung-anzahl"
                className={inputClass}
                type="number"
                min={1}
                max={counted.currentAnzahl}
                step={1}
                inputMode="numeric"
                value={counted.qty}
                onChange={e => counted.onQtyChange(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="em-ausbuchung-grund">
              Grund (optional)
            </label>
            <textarea
              id="em-ausbuchung-grund"
              className={inputClass}
              rows={3}
              value={reason}
              onChange={e => onReasonChange(e.target.value)}
              placeholder="z. B. defekt, verloren, entsorgt"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="flex-1 bg-red-700 hover:bg-red-800 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60"
          >
            {saving ? 'Ausbuchen...' : 'Ausbuchen'}
          </button>
        </div>
      </div>
    </div>
  )
}
