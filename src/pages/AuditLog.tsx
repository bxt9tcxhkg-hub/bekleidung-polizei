import { useEffect, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { AuditLog as AuditLogType } from '../lib/types'

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLogType[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [error, setError] = useState('')
  const PAGE_SIZE = 50

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error, count } = await supabase
        .from('audit_log')
        .select('*, profiles(id,name,username)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      if (error) {
        setError('Audit-Log konnte nicht geladen werden. Bitte später erneut versuchen.')
        setLogs([])
      } else {
        setError('')
        setLogs(data ?? [])
        setTotalCount(count ?? 0)
      }
      setLoading(false)
    }
    load()
  }, [page])

  const hasNext = (page + 1) * PAGE_SIZE < totalCount

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Audit-Log</h1>
        <p className="text-gray-500 text-sm mt-1">Protokoll aller Systemaktionen</p>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          {logs.length === 0 && page === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <ClipboardList className="w-12 h-12 mb-3 text-gray-300" />
              <p className="font-semibold text-gray-500">Keine Einträge vorhanden</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Zeitpunkt</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Aktion</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Details</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Benutzer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {log.created_at ? new Date(log.created_at).toLocaleString('de-AT') : '–'}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{log.action}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell max-w-sm truncate">{log.details ?? '–'}</td>
                      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                        {(log as any).profiles?.name || (log as any).profiles?.username || '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="text-sm text-blue-700 disabled:text-gray-300 hover:underline disabled:no-underline">
                  ← Vorherige
                </button>
                <span className="text-xs text-gray-400">Seite {page + 1} von {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}</span>
                <button disabled={!hasNext || logs.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)} className="text-sm text-blue-700 disabled:text-gray-300 hover:underline disabled:no-underline">
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
