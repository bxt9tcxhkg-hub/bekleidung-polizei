import { useMemo } from 'react'
import { Radio, Upload } from 'lucide-react'
import { ASSISTANCE_LABEL, loadOpenAssistanceRequests } from '../../lib/incidentAssistance'
import { openEinsatzdokument } from '../../lib/einsatzDokumente'
import type { IncidentReport } from '../../lib/types'
import { formatTime } from '../../lib/zentraleShared'
import { assistanceSubjectText, useAssistanceRequestQueue } from './useAssistanceRequestQueue'

export default function ZentraleAssistanceQueue({
  incidents,
  onOpenIncident,
}: {
  incidents: IncidentReport[]
  onOpenIncident: (incident: IncidentReport) => void
}) {
  const { rows, activeId, sourceFileKey, busy, error, setError, inputRef, take, uploadResult, completeWithoutUpload } = useAssistanceRequestQueue({
    loadRows: loadOpenAssistanceRequests,
    pollMs: 8_000,
  })
  const byIncident = useMemo(() => new Map(incidents.map(item => [item.id, item])), [incidents])

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
            {assistanceSubjectText(row) ? <p className="mt-1 text-sm text-gray-800">{assistanceSubjectText(row)}</p> : null}
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
