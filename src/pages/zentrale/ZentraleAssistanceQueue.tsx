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
  loadDokumente,
  openEinsatzdokument,
  registerEinsatzdokument,
  rollbackUploadedEinsatzdokument,
  uploadEinsatzdokument,
} from '../../lib/einsatzDokumente'
import { addPersonen, extractPdfPlainText, personenAusText } from '../../lib/zmrPersonen'
import {
  registerEreignisDokument,
  rollbackUploadedEreignisDokument,
  uploadEreignisDokument,
} from '../../lib/ereignisDokumente'
import type {
  IncidentAssistanceRequest,
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
  const [sourceFileKey, setSourceFileKey] = useState<string | null>(null)
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

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { void load() }, 8_000)
    return () => window.clearInterval(timer)
  }, [load])

  async function take(row: IncidentAssistanceRequest) {
    if (!profile?.id || busy) return
    setBusy(true)
    setError('')
    try {
      const saved = await startAssistanceRequest(row.id, profile.id)
      setRows(current => current.map(item => item.id === saved.id ? saved : item))
      setActiveId(saved.id)
      setSourceFileKey(null)
      if (saved.source_document_id && saved.incident_id) {
        const docs = await loadDokumente(saved.incident_id)
        setSourceFileKey(docs.find(doc => doc.id === saved.source_document_id)?.fileKey ?? null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anfrage konnte nicht übernommen werden.')
    } finally {
      setBusy(false)
    }
  }

  async function uploadResult(file?: File) {
    const row = rows.find(item => item.id === activeId)
    if (!file || !row || !profile?.id) return
    const sharedEventResult = row.requester_organisation !== 'Stadtpolizei' && Boolean(row.ereignis_id)
    if (!sharedEventResult && !row.incident_id) {
      setError('Für diese Anfrage fehlt ein gültiger Einsatz- oder Ereignisbezug.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (sharedEventResult && row.ereignis_id) {
        const eventId = row.ereignis_id
        const uploaded = await uploadEreignisDokument(eventId, file)
        let eventDoc
        try {
          eventDoc = await registerEreignisDokument({
            ereignisId: eventId,
            art: row.request_type === 'zmr' ? 'zmr' : row.request_type === 'sonstiges' ? 'sonstiges' : 'abfrage',
            title: row.request_type === 'zmr' ? 'ZMR-Auszug' : row.request_type === 'sonstiges' ? 'Ergebnis / Unterlage' : 'Abfrage / Register',
            fileKey: uploaded.key,
            fileName: uploaded.name,
            targetOrganisation: row.requester_organisation,
            uploadedBy: profile.id,
          })
        } catch (err) {
          await rollbackUploadedEreignisDokument(eventId, uploaded.key)
          throw err
        }

        await completeAssistanceRequest({
          id: row.id,
          userId: profile.id,
          resultEventDocumentId: eventDoc.id,
        })
        setRows(current => current.filter(item => item.id !== row.id))
        setActiveId(null)
        return
      }

      const incidentId = row.incident_id!
      const uploaded = await uploadEinsatzdokument(incidentId, file)
      let doc
      try {
        doc = await registerEinsatzdokument({
          incidentId,
          art: row.request_type === 'zmr' ? 'zmr' : 'abfrage',
          title: row.request_type === 'zmr' ? 'ZMR-Auszug' : 'Abfrage / Register',
          fileKey: uploaded.key,
          fileName: uploaded.name,
          from: 'zentrale',
          uploadedBy: profile.id,
        })
      } catch (err) {
        await rollbackUploadedEinsatzdokument(incidentId, uploaded.key)
        throw err
      }
      if (row.request_type === 'zmr' && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
        const text = await extractPdfPlainText(file)
        const gefunden = personenAusText(text)
        if (gefunden.length > 0) await addPersonen(incidentId, 'haus', gefunden, profile.id)
      }

      await completeAssistanceRequest({
        id: row.id,
        userId: profile.id,
        resultDocumentId: doc.id,
      })
      setRows(current => current.filter(item => item.id !== row.id))
      setActiveId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ergebnisdatei konnte nicht bereitgestellt werden.')
    } finally {
      setBusy(false)
    }
  }

  async function completeWithoutUpload() {
    const row = rows.find(item => item.id === activeId)
    if (!row || !profile?.id || busy) return
    setBusy(true)
    setError('')
    try {
      await completeAssistanceRequest({ id: row.id, userId: profile.id })
      setRows(current => current.filter(item => item.id !== row.id))
      setActiveId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anfrage konnte nicht abgeschlossen werden.')
    } finally {
      setBusy(false)
    }
  }

  if (rows.length === 0) return null

  return <section className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Offene Abfragen / Bereitstellungen</p>
        <h2 className="mt-0.5 font-bold text-gray-950">{rows.length} offene {rows.length === 1 ? 'Aufgabe' : 'Aufgaben'}</h2>
      </div>
      <Radio className="h-5 w-5 text-blue-700" />
    </div>

    <div className="mt-3 space-y-2">{rows.map(row => {
      const incident = row.incident_id ? byIncident.get(row.incident_id) : undefined
      const active = activeId === row.id
      return <article key={row.id} className={'rounded-xl border bg-white p-3 ' + (active ? 'border-blue-400' : 'border-gray-200')}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-gray-900">{ASSISTANCE_LABEL[row.request_type]}</p>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold text-gray-700">{row.requester_organisation}</span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">{incident
              ? formatTime(incident.reported_at) + ' · ' + (incident.location || incident.summary)
              : row.ereignis_id ? 'Ereignisweite Anfrage' : 'Ohne Einsatzbezug'}</p>
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
          {sourceFileKey ? <button type="button" onClick={() => void openEinsatzdokument(sourceFileKey).catch(() => setError('Ausweisdokument konnte nicht geöffnet werden.'))} className="mb-2 text-xs font-semibold text-blue-800 underline">Ausweisdokument öffnen</button> : null}
          <p className="text-xs text-gray-600">Abfrage im vorgesehenen Fachsystem durchführen. Falls ein Ergebnisdokument vorliegt, hier bereitstellen; die Aufgabe wird dadurch abgeschlossen.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {(row.incident_id || row.ereignis_id) ? <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-800 px-3 py-2 text-xs font-bold text-white">
              <Upload className="h-3.5 w-3.5" /> Ergebnis hochladen
              <input ref={inputRef} type="file" accept="image/*,.pdf" className="sr-only" disabled={busy} onChange={event => void uploadResult(event.target.files?.[0])} />
            </label> : null}
            <button type="button" disabled={busy} onClick={() => void completeWithoutUpload()} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-800 disabled:opacity-50">
              Erledigt
            </button>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">Funk oder Telefon werden nicht zusätzlich im Portal dokumentiert.</p>
        </div> : null}
      </article>
    })}</div>

    {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
  </section>
}
