import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { ASSISTANCE_LABEL, createAssistanceRequest } from '../../lib/incidentAssistance'
import type { IncidentAssistanceOrganisation, IncidentAssistanceRequestType } from '../../lib/types'

const ORGS: Exclude<IncidentAssistanceOrganisation, 'Stadtpolizei'>[] = ['Feuerwehr', 'Krisenstab']
const TYPES: IncidentAssistanceRequestType[] = ['personenabfrage', 'zmr', 'fahrzeugabfrage', 'sonstiges']

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
  const [organisation, setOrganisation] = useState<Exclude<IncidentAssistanceOrganisation, 'Stadtpolizei'>>('Feuerwehr')
  const [requestType, setRequestType] = useState<IncidentAssistanceRequestType>('zmr')
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
        requestType,
        requestedBy: profile.id,
        requesterOrganisation: organisation,
        requestText,
      })
      setRequestText('')
      setNotice('Abfrage im Einsatz vorgemerkt.')
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
        {open ? 'Schließen' : '+ Bedarf vormerken'}
      </button>
    </div>

    {open ? <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {ORGS.map(org => <button
          key={org}
          type="button"
          onClick={() => setOrganisation(org)}
          className={'rounded-lg border px-2.5 py-1.5 text-xs font-semibold ' + (organisation === org ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700')}
        >{org}</button>)}
      </div>

      <div className="flex flex-wrap gap-2">
        {TYPES.map(type => <button
          key={type}
          type="button"
          onClick={() => setRequestType(type)}
          className={'rounded-lg border px-2.5 py-1.5 text-xs font-semibold ' + (requestType === type ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700')}
        >{ASSISTANCE_LABEL[type]}</button>)}
      </div>

      <input
        value={requestText}
        onChange={event => setRequestText(event.target.value)}
        placeholder="Nur falls nötig: kurzer Zusatz"
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
