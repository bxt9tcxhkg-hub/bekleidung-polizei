import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { PersonalEinsatzmittel, PoolEinsatzmittel } from '../../lib/types'
import {
  POOL_EM_CATEGORY_LABELS,
  VERWAHRUNGSORTE,
  VERWAHRUNGSORT_LABELS,
  aggregateLagerbestand,
} from '../../lib/poolEinsatzmittel'
import {
  PERSONAL_EM_CATEGORY_LABELS,
  aggregatePersonalLagerbestand,
  personalEmDetailText,
  personalItemsInLager,
} from '../../lib/personalEinsatzmittel'

export default function LagerbestandPanel() {
  const [poolItems, setPoolItems] = useState<PoolEinsatzmittel[]>([])
  const [personalItems, setPersonalItems] = useState<PersonalEinsatzmittel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const [poolRes, personalRes] = await Promise.all([
      supabase.from('pool_einsatzmittel').select('category,verwahrungsort,anzahl'),
      supabase
        .from('personal_einsatzmittel')
        .select('id,category,verwahrungsort,officer_id,waffennummer,marke,groesse,kaliber,art,service,magazinanzahl,patronen,ablaufdatum,ablauf_mm_yyyy,schutzfristen')
        .eq('verwahrungsort', 'lager')
        .order('category'),
    ])
    const failures: string[] = []
    if (poolRes.error) {
      failures.push('Pool')
      setPoolItems([])
    } else {
      setPoolItems((poolRes.data ?? []) as PoolEinsatzmittel[])
    }
    if (personalRes.error) {
      failures.push('persönliche Einsatzmittel')
      setPersonalItems([])
    } else {
      setPersonalItems((personalRes.data ?? []) as PersonalEinsatzmittel[])
    }
    setError(failures.length > 0 ? `Lagerbestand konnte nicht vollständig geladen werden (${failures.join(', ')}).` : '')
    setLoading(false)
  }

  useEffect(() => {
    load().catch(() => {
      setError('Lagerbestand konnte nicht geladen werden.')
      setLoading(false)
    })
  }, [])

  const poolRows = useMemo(() => aggregateLagerbestand(poolItems), [poolItems])
  const personalCounts = useMemo(() => aggregatePersonalLagerbestand(personalItems), [personalItems])
  const personalInLager = useMemo(() => personalItemsInLager(personalItems), [personalItems])
  const personalTotal = personalInLager.length

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Lagerbestand</h2>
        <p className="text-sm text-gray-500 mt-1">
          Stückzahlen je Kategorie und Verwahrungsort. Langwaffen zählen als erfasste Waffen,
          übrige Pool-Kategorien als Summe von Anzahl bzw. Menge. Eingelagerte persönliche
          Einsatzmittel zählen je Zeile (mehrere Waffennummern derselben Kategorie bleiben getrennt).
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
        <div className="space-y-8">
          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Pool</h3>
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
                  {poolRows.map(row => (
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
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Persönliche Einsatzmittel im Lager</h3>
            <p className="text-xs text-gray-500 mb-2">
              {personalTotal === 0
                ? 'Keine persönlichen Stücke eingelagert.'
                : `${personalTotal} Stück eingelagert (ohne Polizisten-Zuweisung oder mit Ort Lager).`}
            </p>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Kategorie</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Im Lager</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {personalCounts.map(row => (
                    <tr key={row.category} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                        {PERSONAL_EM_CATEGORY_LABELS[row.category]}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {personalInLager.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Kategorie</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Kennung</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Angaben</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {personalInLager.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                          {PERSONAL_EM_CATEGORY_LABELS[item.category]}
                        </td>
                        <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                          {item.waffennummer?.trim() || item.marke?.trim() || '–'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                          {personalEmDetailText(item) || '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
