import { useCallback, useEffect, useMemo, useState } from 'react'
import { ENTSCHEIDUNGSPUNKTE } from '../../lib/einsatzSchema'
import { loadEreignisEntscheidungen, setEreignisEntscheidung } from '../../lib/ereignis'
import type { EreignisEntscheidung } from '../../lib/types'
import { workspacePolicy, type WorkspaceOrganisation } from '../../lib/organisationWorkspace'

function keyFor(label: string): string {
  return label
    .toLocaleLowerCase('de-AT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

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
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const policy = workspacePolicy(organisation)

  const load = useCallback(async () => {
    try {
      setRows(await loadEreignisEntscheidungen(ereignisId))
    } catch {
      setError('Entscheidungsstand konnte nicht geladen werden.')
    }
  }, [ereignisId])

  useEffect(() => {
    if (policy.decisionProtocol) void load()
  }, [load, policy.decisionProtocol])

  const byKey = useMemo(() => new Map(rows.map(row => [row.punkt_key, row])), [rows])

  async function save(label: string, status: EreignisEntscheidung['status']) {
    if (!userId) return
    const key = keyFor(label)
    setBusyKey(key)
    setError('')
    try {
      const current = byKey.get(key)
      const saved = await setEreignisEntscheidung({
        ereignisId,
        key,
        label,
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
    {ENTSCHEIDUNGSPUNKTE.map(label => {
      const key = keyFor(label)
      const row = byKey.get(key)
      const status = row?.status ?? 'offen'
      return <div key={key} className="rounded-xl border border-gray-200 p-3">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {([
            ['offen', 'Offen'],
            ['festgelegt', 'Festgelegt'],
            ['nicht_erforderlich', 'Nicht erforderlich'],
          ] as const).map(([value, text]) => <button
            key={value}
            type="button"
            disabled={!canOperate || busyKey === key}
            onClick={() => void save(label, value)}
            className={'rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ' + (status === value ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700')}
          >{text}</button>)}
        </div>
      </div>
    })}
    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>
}
