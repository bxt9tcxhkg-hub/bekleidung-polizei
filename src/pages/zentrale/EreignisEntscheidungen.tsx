import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { loadEreignisEntscheidungen, setEreignisEntscheidung } from '../../lib/ereignis'
import type { EreignisEntscheidung, EreignisEntscheidungsschritt } from '../../lib/types'
import { workspacePolicy, type WorkspaceOrganisation } from '../../lib/organisationWorkspace'

export default function EreignisEntscheidungen({
  ereignisId, canOperate, userId, organisation, onChanged,
}: {
  ereignisId: string
  canOperate: boolean
  userId: string | null
  organisation: WorkspaceOrganisation
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<EreignisEntscheidung[]>([])
  const [schritte, setSchritte] = useState<EreignisEntscheidungsschritt[] | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const policy = workspacePolicy(organisation)

  const load = useCallback(async () => {
    try {
      const [current, result] = await Promise.all([loadEreignisEntscheidungen(ereignisId), supabase.from('ereignis_entscheidungsschritte').select('*').eq('ereignis_id', ereignisId).order('sortierung')])
      if (result.error) throw result.error
      setRows(current)
      setSchritte(result.data ?? [])
      setError('')
    } catch {
      setError('Entscheidungsstand konnte nicht geladen werden.')
    }
  }, [ereignisId])

  useEffect(() => {
    if (policy.decisionProtocol) void load()
  }, [load, policy.decisionProtocol])

  const byKey = useMemo(() => new Map(rows.map(row => [row.punkt_key, row])), [rows])

  async function save(schritt: EreignisEntscheidungsschritt, status: EreignisEntscheidung['status']) {
    if (!userId) return
    const key = schritt.schluessel
    setBusyKey(key)
    setError('')
    try {
      const current = byKey.get(key)
      const saved = await setEreignisEntscheidung({
        ereignisId,
        key,
        label: schritt.bezeichnung,
        status,
        notiz: current?.notiz ?? null,
        userId,
      })
      setRows(old => [...old.filter(row => row.id !== saved.id), saved])
      onChanged?.()
    } catch {
      setError('Entscheidungsstand konnte nicht gespeichert werden.')
    } finally {
      setBusyKey(null)
    }
  }

  if (!policy.decisionProtocol) return null

  return <div className="space-y-3">
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-800">Entscheidungen / Anweisungen</h3>
      <p className="mt-1 text-xs text-gray-500">Hier wird nur dokumentiert, was durch die zuständigen Stellen festgelegt wurde. Das Portal trifft diese Entscheidungen nicht selbst.</p>
    </div>
    {schritte?.map(schritt => {
      const key = schritt.schluessel
      const row = byKey.get(key)
      const status = row?.status ?? 'offen'
      return <div key={key} className="rounded-xl border border-gray-200 p-3">
        <p className="text-sm font-semibold text-gray-900">{schritt.bezeichnung}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {([
            ['offen', 'Offen'],
            ['festgelegt', 'Festgelegt'],
            ['nicht_erforderlich', 'Nicht erforderlich'],
          ] as const).map(([value, text]) => <button
            key={value}
            type="button"
            disabled={!canOperate || busyKey === key}
            onClick={() => void save(schritt, value)}
            className={'rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ' + (status === value ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700')}
          >{text}</button>)}
        </div>
      </div>
    })}
    {!schritte && !error ? <p className="text-xs text-gray-500">Entscheidungspunkte werden geladen…</p> : null}
    {schritte?.length === 0 ? <p className="text-xs text-gray-500">Für dieses Ereignis sind keine Entscheidungspunkte hinterlegt.</p> : null}
    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>
}
