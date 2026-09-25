import { useEffect } from 'react'
import { Upload } from 'lucide-react'
import { ASSISTANCE_LABEL, loadIncidentAssistanceRequests } from '../../lib/incidentAssistance'
import { openEinsatzdokument } from '../../lib/einsatzDokumente'
import { assistanceSubjectText, useAssistanceRequestQueue } from './useAssistanceRequestQueue'

export default function IncidentAssistanceWorkPanel({
  incidentId,
  refreshToken = 0,
  canOperate,
  onChanged,
  onOpenCountChange,
}: {
  incidentId: string
  refreshToken?: number
  canOperate: boolean
  onChanged?: () => void
  onOpenCountChange?: (count: number) => void
}) {
  const { rows: allRows, activeId, sourceFileKey, busy, error, setError, inputRef, take, uploadResult, completeWithoutUpload } = useAssistanceRequestQueue({
    loadRows: () => loadIncidentAssistanceRequests(incidentId),
    canOperate,
    refreshToken,
    onChanged,
  })
  const rows = allRows.filter(row => row.status === 'offen' || row.status === 'in_bearbeitung')

  useEffect(() => { onOpenCountChange?.(rows.length) }, [rows.length, onOpenCountChange])

  return <section className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs font-semibold text-gray-700">{rows.length === 0 ? 'Keine offene Abfrage.' : rows.length + (rows.length === 1 ? ' offene Aufgabe' : ' offene Aufgaben')}</p>
    </div>

    {rows.length > 0 ? <div className="mt-3 space-y-2">
      {rows.map(row => {
        const active = activeId === row.id
        return <div key={row.id} className={'rounded-lg border p-2.5 ' + (active ? 'border-blue-400 bg-blue-50/40' : 'border-gray-200')}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{ASSISTANCE_LABEL[row.request_type]}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-700">{row.requester_organisation}</span>
              </div>
              {assistanceSubjectText(row) ? <p className="mt-1 text-xs text-gray-700">{assistanceSubjectText(row)}</p> : null}
              {row.request_text ? <p className="mt-1 text-xs text-gray-500">{row.request_text}</p> : null}
            </div>
            {!active ? <button type="button" disabled={!canOperate || busy} onClick={() => void take(row)} className="rounded-lg bg-blue-800 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              {row.status === 'in_bearbeitung' ? 'Weiterbearbeiten' : 'Bearbeiten'}
            </button> : null}
          </div>

          {active ? <div className="mt-2 border-t border-gray-100 pt-2">
            {sourceFileKey ? <button type="button" onClick={() => void openEinsatzdokument(sourceFileKey).catch(() => setError('Ausweisdokument konnte nicht geöffnet werden.'))} className="mb-2 text-xs font-semibold text-blue-800 underline">Ausweisdokument öffnen</button> : null}
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-800 px-2.5 py-1.5 text-xs font-bold text-white">
                <Upload className="h-3.5 w-3.5" /> Ergebnis bereitstellen
                <input ref={inputRef} type="file" accept="image/*,.pdf" className="sr-only" disabled={busy} onChange={event => void uploadResult(event.target.files?.[0])} />
              </label>
              <button type="button" disabled={busy} onClick={() => void completeWithoutUpload()} className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-800 disabled:opacity-50">Erledigt</button>
            </div>
          </div> : null}
        </div>
      })}
    </div> : null}

    {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
  </section>
}
