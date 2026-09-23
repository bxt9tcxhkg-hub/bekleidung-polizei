import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { createAssistanceRequest } from '../../lib/incidentAssistance'
import type { IncidentAssistanceOrganisation } from '../../lib/types'

const ORGS: IncidentAssistanceOrganisation[] = ['Stadtpolizei', 'Feuerwehr', 'Krisenstab']

export default function CentralSupportIntake({
  incidentId,
  ereignisId,
  canOperate,
  onCreated,
}: {
  incidentId: string
  ereignisId?: string | null
  canOperate: boolean
  onCreated?: () => void
}) {
  const { profile } = useAuth()
  const [organisation, setOrganisation] = useState<IncidentAssistanceOrganisation>('Stadtpolizei')
  const [requestText, setRequestText] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit() {
    if (!profile?.id || !canOperate || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await createAssistanceRequest({
        incidentId,
        ereignisId: ereignisId ?? null,
        // Technischer Altwert; fachlich wird keine Anfrageart ausgewählt.
        requestType: 'sonstiges',
        requestedBy: profile.id,
        requesterOrganisation: organisation,
        requestText,
      })
      setRequestText('')
      setNotice('Unterstützungsbedarf beim Einsatz vorgemerkt.')
      setOpen(false)
      onCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Abfrage konnte nicht vorgemerkt werden.')
    } finally {
      setBusy(false)
    }
  }

  if (!canOperate) return null

  return <div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-xs text-gray-500">Telefonisch oder per Funk erhaltenen Bedarf direkt diesem Einsatz zuordnen.</p>
      </div>
      <button type="button" onClick={() => setOpen(current => !current)} className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800">
        {open ? 'Schließen' : '+ Unterstützung vormerken'}
      </button>
    </div>

    {open ? <div className="mt-3 space-y-2">
      <div>
        <p className="mb-1 text-[11px] font-semibold text-gray-500">Anfragende Stelle</p>
        <div className="flex flex-wrap gap-2">
        {ORGS.map(org => <button
          key={org}
          type="button"
          onClick={() => setOrganisation(org)}
          className={'rounded-lg border px-2.5 py-1.5 text-xs font-semibold ' + (organisation === org ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700')}
        >{org}</button>)}
        </div>
      </div>

      <input
        value={requestText}
        onChange={event => setRequestText(event.target.value)}
        placeholder="Was wird benötigt? Nur das Nötigste."
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />

      <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-lg bg-blue-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
        Im Einsatz vormerken
      </button>
    </div> : null}

    {notice ? <p className="mt-2 text-xs text-green-700">{notice}</p> : null}
    {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
  </div>
}
