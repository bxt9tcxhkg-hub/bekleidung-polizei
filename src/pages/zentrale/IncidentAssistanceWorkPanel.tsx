import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  ASSISTANCE_LABEL,
  completeAssistanceRequest,
  loadIncidentAssistanceRequests,
  startAssistanceRequest,
} from '../../lib/incidentAssistance'
import {
  loadDokumente,
  openEinsatzdokument,
  registerEinsatzdokument,
  rollbackUploadedEinsatzdokument,
  uploadEinsatzdokument,
} from '../../lib/einsatzDokumente'
import {
  registerEreignisDokument,
  rollbackUploadedEreignisDokument,
  uploadEreignisDokument,
} from '../../lib/ereignisDokumente'
import { addPersonen, extractPdfPlainText, personenAusText } from '../../lib/zmrPersonen'
import type { IncidentAssistanceRequest } from '../../lib/types'

function subjectText(row: IncidentAssistanceRequest): string {
  const data = row.subject_data ?? {}
  return [
    typeof data.nachname === 'string' ? data.nachname : null,
    typeof data.vorname === 'string' ? data.vorname : null,
    typeof data.geburtsdatum === 'string' ? '* ' + data.geburtsdatum : null,
    typeof data.dokumentnummer === 'string' ? 'Dok. ' + data.dokumentnummer : null,
    typeof data.kennzeichen === 'string' ? data.kennzeichen : null,
  ].filter(Boolean).join(' · ')
}

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
  const { profile } = useAuth()
  const [rows, setRows] = useState<IncidentAssistanceRequest[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sourceFileKey, setSourceFileKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const all = await loadIncidentAssistanceRequests(incidentId)
      const openRows = all.filter(row => row.status === 'offen' || row.status === 'in_bearbeitung')
      setRows(openRows)
      onOpenCountChange?.(openRows.length)
      setError('')
    } catch {
      setError('Offene Abfragen konnten nicht geladen werden.')
    }
  }, [incidentId, onOpenCountChange])

  useEffect(() => { void load() }, [load, refreshToken])

  async function take(row: IncidentAssistanceRequest) {
    if (!profile?.id || !canOperate || busy) return
    setBusy(true)
    setError('')
    try {
      const saved = await startAssistanceRequest(row.id, profile.id)
      setRows(current => current.map(item => item.id === saved.id ? saved : item))
      setActiveId(saved.id)
      setSourceFileKey(null)
      if (saved.source_document_id) {
        const docs = await loadDokumente(incidentId)
        setSourceFileKey(docs.find(doc => doc.id === saved.source_document_id)?.fileKey ?? null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Abfrage konnte nicht übernommen werden.')
    } finally {
      setBusy(false)
    }
  }

  async function uploadResult(file?: File) {
    const row = rows.find(item => item.id === activeId)
    if (!file || !row || !profile?.id || busy) return
    setBusy(true)
    setError('')
    try {
      const sharedEventResult = row.requester_organisation !== 'Stadtpolizei' && Boolean(row.ereignis_id)

      if (sharedEventResult && row.ereignis_id) {
        const uploaded = await uploadEreignisDokument(row.ereignis_id, file)
        let doc
        try {
          doc = await registerEreignisDokument({
            ereignisId: row.ereignis_id,
            art: row.request_type === 'zmr' ? 'zmr' : row.request_type === 'sonstiges' ? 'sonstiges' : 'abfrage',
            title: row.request_type === 'zmr' ? 'ZMR-Auszug' : row.request_type === 'sonstiges' ? 'Ergebnis / Unterlage' : 'Abfrage / Register',
            fileKey: uploaded.key,
            fileName: uploaded.name,
            targetOrganisation: row.requester_organisation,
            uploadedBy: profile.id,
          })
        } catch (err) {
          await rollbackUploadedEreignisDokument(row.ereignis_id, uploaded.key)
          throw err
        }
        await completeAssistanceRequest({ id: row.id, userId: profile.id, resultEventDocumentId: doc.id })
      } else {
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

        await completeAssistanceRequest({ id: row.id, userId: profile.id, resultDocumentId: doc.id })
      }

      setRows(current => current.filter(item => item.id !== row.id))
      setActiveId(null)
      setSourceFileKey(null)
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ergebnis konnte nicht bereitgestellt werden.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function completeWithoutUpload() {
    const row = rows.find(item => item.id === activeId)
    if (!row || !profile?.id || !canOperate || busy) return
    setBusy(true)
    setError('')
    try {
      await completeAssistanceRequest({ id: row.id, userId: profile.id })
      setRows(current => current.filter(item => item.id !== row.id))
      setActiveId(null)
      setSourceFileKey(null)
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Abfrage konnte nicht abgeschlossen werden.')
    } finally {
      setBusy(false)
    }
  }

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
              {subjectText(row) ? <p className="mt-1 text-xs text-gray-700">{subjectText(row)}</p> : null}
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
