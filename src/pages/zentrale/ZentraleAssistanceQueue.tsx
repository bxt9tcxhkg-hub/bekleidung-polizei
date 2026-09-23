import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Radio, Upload } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  ASSISTANCE_LABEL,
  completeAssistanceRequest,
  loadOpenAssistanceRequests,
  startAssistanceRequest,
} from '../../lib/incidentAssistance'
import {
  registerEinsatzdokument,
  rollbackUploadedEinsatzdokument,
  uploadEinsatzdokument,
} from '../../lib/einsatzDokumente'
import type {
  IncidentAssistanceRequest,
  IncidentAssistanceResponseChannel,
  IncidentReport,
} from '../../lib/types'
import { formatTime } from '../../lib/zentraleShared'

function subjectText(row: IncidentAssistanceRequest): string {
  const data = row.subject_data ?? {}
  const parts = [
    typeof data.nachname === 'string' ? data.nachname : null,
    typeof data.vorname === 'string' ? data.vorname : null,
    typeof data.geburtsdatum === 'string' ? '* ' + data.geburtsdatum : null,
    typeof data.dokumentnummer === 'string' ? 'Dok. ' + data.dokumentnummer : null,
  ].filter(Boolean)
  return parts.join(' · ')
}

export default function ZentraleAssistanceQueue({
  incidents,
  onOpenIncident,
}: {
  incidents: IncidentReport[]
  onOpenIncident: (incident: IncidentReport) => void
}) {
  const { profile } = useAuth()
  const [rows, setRows] = useState<IncidentAssistanceRequest[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [resultText, setResultText] = useState('')
  const [resultDocumentId, setResultDocumentId] = useState<string | null>(null)
  const [resultDocumentName, setResultDocumentName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const byIncident = useMemo(() => new Map(incidents.map(item => [item.id, item])), [incidents])
  const load = useCallback(async () => {
    try {
      setRows(await loadOpenAssistanceRequests())
      setError('')
    } catch {
      setError('Offene Unterstützungsanfragen konnten nicht geladen werden.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function take(row: IncidentAssistanceRequest) {
    if (!profile?.id || busy) return
    setBusy(true)
    setError('')
    try {
      const saved = await startAssistanceRequest(row.id, profile.id)
      setRows(current => current.map(item => item.id === saved.id ? saved : item))
      setActiveId(saved.id)
      setResultText(saved.result_text ?? '')
      setResultDocumentId(saved.result_document_id)
      setResultDocumentName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anfrage konnte nicht übernommen werden.')
    } finally {
      setBusy(false)
    }
  }

  async function uploadResult(file?: File) {
    const row = rows.find(item => item.id === activeId)
    if (!file || !row || !profile?.id) return
    setBusy(true)
    setError('')
    try {
      const uploaded = await uploadEinsatzdokument(row.incident_id, file)
      let doc
      try {
        doc = await registerEinsatzdokument({
          incidentId: row.incident_id,
          art: row.request_type === 'zmr' ? 'zmr' : 'abfrage',
          title: row.request_type === 'zmr' ? 'ZMR-Auszug' : 'Abfrage / Register',
          fileKey: uploaded.key,
          fileName: uploaded.name,
          from: 'zentrale',
          uploadedBy: profile.id,
        })
      } catch (err) {
        await rollbackUploadedEinsatzdokument(row.incident_id, uploaded.key)
        throw err
      }
      setResultDocumentId(doc.id)
      setResultDocumentName(doc.fileName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ergebnisdatei konnte nicht hochgeladen werden.')
    } finally {
      setBusy(false)
    }
  }

  async function complete(channel: IncidentAssistanceResponseChannel) {
    const row = rows.find(item => item.id === activeId)
    if (!row || !profile?.id || busy) return
    if (channel === 'portal' && !resultText.trim() && !resultDocumentId) {
      setError('Für Portal bitte Ergebnistext oder Datei hinterlegen.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await completeAssistanceRequest({
        id: row.id,
        userId: profile.id,
        resultText,
        resultDocumentId,
        responseChannel: channel,
      })
      setRows(current => current.filter(item => item.id !== row.id))
      setActiveId(null)
      setResultText('')
      setResultDocumentId(null)
      setResultDocumentName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rückmeldung konnte nicht abgeschlossen werden.')
    } finally {
      setBusy(false)
    }
  }

  if (rows.length === 0) return null

  return <section className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Unterstützung für Streifen</p>
        <h2 className="mt-0.5 font-bold text-gray-950">{rows.length} offene {rows.length === 1 ? 'Anfrage' : 'Anfragen'}</h2>
      </div>
      <Radio className="h-5 w-5 text-blue-700" />
    </div>

    <div className="mt-3 space-y-2">{rows.map(row => {
      const incident = byIncident.get(row.incident_id)
      const active = activeId === row.id
      return <article key={row.id} className={'rounded-xl border bg-white p-3 ' + (active ? 'border-blue-400' : 'border-gray-200')}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">{ASSISTANCE_LABEL[row.request_type]}</p>
            <p className="mt-0.5 text-xs text-gray-500">{incident ? formatTime(incident.reported_at) + ' · ' + (incident.location || incident.summary) : 'Einsatz'}</p>
            {subjectText(row) ? <p className="mt-1 text-sm text-gray-800">{subjectText(row)}</p> : null}
            {row.request_text ? <p className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">{row.request_text}</p> : null}
          </div>
          <div className="flex gap-2">
            {incident ? <button type="button" onClick={() => onOpenIncident(incident)} className="text-xs font-semibold text-gray-600">Einsatz öffnen</button> : null}
            {!active ? <button type="button" disabled={busy} onClick={() => void take(row)} className="rounded-lg bg-blue-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
              {row.status === 'in_bearbeitung' ? 'Weiterbearbeiten' : 'Bearbeiten'}
            </button> : null}
          </div>
        </div>

        {active ? <div className="mt-3 border-t border-gray-100 pt-3">
          <textarea rows={3} value={resultText} onChange={event => setResultText(event.target.value)} placeholder="Ergebnis / relevante Information für die Streife" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-800">
              <Upload className="h-3.5 w-3.5" /> Ergebnisdatei
              <input ref={inputRef} type="file" accept="image/*,.pdf" className="sr-only" disabled={busy} onChange={event => void uploadResult(event.target.files?.[0])} />
            </label>
            {resultDocumentName ? <span className="text-xs text-gray-500">{resultDocumentName}</span> : null}
          </div>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Wie wurde das Ergebnis übermittelt?</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void complete('funk')} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-800 disabled:opacity-50">Funk</button>
            <button type="button" disabled={busy} onClick={() => void complete('telefon')} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-800 disabled:opacity-50">Telefon</button>
            <button type="button" disabled={busy} onClick={() => void complete('portal')} className="rounded-lg bg-green-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Portal</button>
          </div>
        </div> : null}
      </article>
    })}</div>

    {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
  </section>
}
