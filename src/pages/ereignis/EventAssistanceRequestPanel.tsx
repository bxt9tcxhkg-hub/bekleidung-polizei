import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  ASSISTANCE_LABEL,
  createAssistanceRequest,
  loadEventAssistanceRequests,
} from '../../lib/incidentAssistance'
import { loadEreignisDokumente, openEreignisDokument, type EreignisDokument } from '../../lib/ereignisDokumente'
import type {
  IncidentAssistanceOrganisation,
  IncidentAssistanceRequest,
  IncidentAssistanceRequestType,
} from '../../lib/types'

const REQUEST_TYPES: IncidentAssistanceRequestType[] = [
  'personenabfrage',
  'zmr',
  'fahrzeugabfrage',
  'sonstiges',
]

export default function EventAssistanceRequestPanel({
  ereignisId,
  incidentId = null,
  organisation,
}: {
  ereignisId: string
  incidentId?: string | null
  organisation: Exclude<IncidentAssistanceOrganisation, 'Stadtpolizei'>
}) {
  const { profile } = useAuth()
  const [rows, setRows] = useState<IncidentAssistanceRequest[]>([])
  const [documents, setDocuments] = useState<EreignisDokument[]>([])
  const [requestType, setRequestType] = useState<IncidentAssistanceRequestType>('zmr')
  const [requestText, setRequestText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    try {
      const [requests, docs] = await Promise.all([
        loadEventAssistanceRequests(ereignisId),
        loadEreignisDokumente(ereignisId),
      ])
      setRows(requests)
      setDocuments(docs)
      setError('')
    } catch {
      setError('Unterstützungsanfragen konnten nicht geladen werden.')
    }
  }

  useEffect(() => { void load() }, [ereignisId])

  const eigene = useMemo(
    () => rows.filter(row => row.requester_organisation === organisation),
    [rows, organisation],
  )

  async function submit() {
    if (!profile?.id || busy) return
    setBusy(true)
    setError('')
    try {
      await createAssistanceRequest({
        incidentId,
        ereignisId,
        requestType,
        requestedBy: profile.id,
        requesterOrganisation: organisation,
        requestText,
      })
      setRequestText('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anfrage konnte nicht gesendet werden.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-blue-800">Anfrage an Stadtpolizei-Zentrale</p>
      <p className="mt-1 text-xs text-gray-600">Die Stadtpolizei-Zentrale führt die Abfrage durch und stellt das Ergebnis für das gemeinsame Ereignis bereit.</p>
    </div>

    <div className="flex flex-wrap gap-2">
      {REQUEST_TYPES.map(type => <button
        key={type}
        type="button"
        onClick={() => setRequestType(type)}
        className={'rounded-lg border px-2.5 py-1.5 text-xs font-semibold ' + (requestType === type ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700')}
      >{ASSISTANCE_LABEL[type]}</button>)}
    </div>

    <textarea
      value={requestText}
      onChange={event => setRequestText(event.target.value)}
      rows={2}
      placeholder="Welche Abfrage oder Information wird benötigt?"
      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
    />

    <button
      type="button"
      disabled={busy}
      onClick={() => void submit()}
      className="rounded-lg bg-blue-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
    >
      An Stadtpolizei-Zentrale senden
    </button>

    {eigene.length > 0 ? <div className="border-t border-blue-100 pt-2">
      <p className="text-xs font-semibold text-gray-700">Anfragen dieses Ereignisses</p>
      <div className="mt-1 space-y-1">
        {eigene.slice(0, 8).map(row => {
          const resultDoc = row.result_event_document_id
            ? documents.find(doc => doc.id === row.result_event_document_id)
            : null
          return <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5 text-xs">
            <span className="font-medium text-gray-800">{ASSISTANCE_LABEL[row.request_type]}</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">{row.status === 'offen' ? 'offen' : row.status === 'in_bearbeitung' ? 'in Bearbeitung' : row.status === 'erledigt' ? 'erledigt' : 'storniert'}</span>
              {resultDoc ? <button type="button" onClick={() => void openEreignisDokument(resultDoc.fileKey).catch(() => setError('Ergebnisdokument konnte nicht geöffnet werden.'))} className="font-semibold text-blue-800 underline">Ergebnis öffnen</button> : null}
            </div>
          </div>
        })}
      </div>
    </div> : null}

    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </section>
}
