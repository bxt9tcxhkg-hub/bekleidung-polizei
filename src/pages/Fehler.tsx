import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { AppError } from '../lib/types'

export default function Fehler() {
  const [errors, setErrors] = useState<AppError[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [error, setError] = useState('')
  const PAGE_SIZE = 50

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error: loadError, count } = await supabase
        .from('app_errors')
        .select('*, profiles(id,name,username)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      if (loadError) {
        setError('Fehlerliste konnte nicht geladen werden. Bitte später erneut versuchen.')
        setErrors([])
      } else {
        setError('')
        setErrors((data ?? []) as AppError[])
        setTotalCount(count ?? 0)
      }
      setLoading(false)
    }
    void load()
  }, [page])

  const hasNext = (page + 1) * PAGE_SIZE < totalCount

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Fehler</h1>
        <p className="text-gray-500 text-sm mt-1">Laufzeitfehler der Anwendung</p>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          {errors.length === 0 && page === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <AlertTriangle className="w-12 h-12 mb-3 text-gray-300" />
              <p className="font-semibold text-gray-500">Keine Einträge vorhanden</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Zeitpunkt</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Benutzer</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Pfad</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Meldung</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {errors.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {row.created_at ? new Date(row.created_at).toLocaleString('de-AT') : '–'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {row.profiles?.name || row.profiles?.username || '–'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell max-w-xs truncate">
                        {row.path || '–'}
                      </td>
                      <td className="px-4 py-3 text-gray-900 text-xs max-w-lg truncate">{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="text-sm text-blue-700 disabled:text-gray-300 hover:underline disabled:no-underline">
                  ← Vorherige
                </button>
                <span className="text-xs text-gray-400">Seite {page + 1} von {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}</span>
                <button disabled={!hasNext || errors.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)} className="text-sm text-blue-700 disabled:text-gray-300 hover:underline disabled:no-underline">
                  Nächste →
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
