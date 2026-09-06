import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { PoolEinsatzmittel } from '../../lib/types'
import {
  POOL_EM_CATEGORY_LABELS,
  VERWAHRUNGSORTE,
  VERWAHRUNGSORT_LABELS,
  aggregateLagerbestand,
} from '../../lib/poolEinsatzmittel'

export default function LagerbestandPanel() {
  const [items, setItems] = useState<PoolEinsatzmittel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase
      .from('pool_einsatzmittel')
      .select('category,verwahrungsort,anzahl')
      .then(({ data, error: loadError }) => {
        if (cancelled) return
        if (loadError) {
          setError('Lagerbestand konnte nicht geladen werden.')
          setItems([])
        } else {
          setError('')
          setItems((data ?? []) as PoolEinsatzmittel[])
        }
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('Lagerbestand konnte nicht geladen werden.')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const rows = useMemo(() => aggregateLagerbestand(items), [items])

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Lagerbestand</h2>
        <p className="text-sm text-gray-500 mt-1">
          Stückzahlen je Kategorie und Verwahrungsort. Langwaffen zählen als erfasste Waffen,
          übrige Kategorien als Summe von Anzahl bzw. Menge.
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Kategorie</th>
                {VERWAHRUNGSORTE.map(ort => (
                  <th key={ort} className="text-right px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                    {VERWAHRUNGSORT_LABELS[ort]}
                  </th>
                ))}
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Gesamt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr key={row.category} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {POOL_EM_CATEGORY_LABELS[row.category]}
                  </td>
                  {VERWAHRUNGSORTE.map(ort => (
                    <td key={ort} className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {row.byOrt[ort]}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                    {row.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
