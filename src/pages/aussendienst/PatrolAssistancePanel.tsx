import { useCallback, useEffect, useRef, useState } from 'react'
import { FileCheck2, ImageUp } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { loadIncidentAssistanceRequests } from '../../lib/incidentAssistance'
import {
  loadDokumente,
  openEinsatzdokument,
  registerEinsatzdokument,
  rollbackUploadedEinsatzdokument,
  uploadEinsatzdokument,
  type EinsatzDokument,
} from '../../lib/einsatzDokumente'
import type { IncidentAssistanceRequest } from '../../lib/types'

/**
 * Die Anforderung läuft über Funk oder Telefon und wird von der Zentrale beim
 * Einsatz vorgemerkt. Die Streife wählt keine Anfrageart aus und führt kein
 * Kommunikationsprotokoll. Sie stellt nur Bilder bereit und öffnet Ergebnisse.
 */
export default function PatrolAssistancePanel({ incidentId }: { incidentId: string; vehicleId?: string | null; incidentLocation?: string | null }) {
  const { profile } = useAuth()
  const [rows, setRows] = useState<IncidentAssistanceRequest[]>([])
  const [documents, setDocuments] = useState<EinsatzDokument[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const [requests, docs] = await Promise.all([
        loadIncidentAssistanceRequests(incidentId),
        loadDokumente(incidentId),
      ])
      setRows(requests)
      setDocuments(docs)
    } catch {
      setError('Unterstützung der Zentrale konnte nicht vollständig geladen werden.')
    }
  }, [incidentId])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { void load() }, 10_000)
    return () => window.clearInterval(timer)
  }, [load])

  async function uploadImage(file?: File) {
    if (!file || !profile?.id) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const uploaded = await uploadEinsatzdokument(incidentId, file)
      try {
        await registerEinsatzdokument({
          incidentId,
          art: 'sonstiges',
          title: 'Bild der Streife für die Zentrale',
          fileKey: uploaded.key,
          fileName: uploaded.name,
          from: 'streife',
          uploadedBy: profile.id,
        })
      } catch (err) {
        await rollbackUploadedEinsatzdokument(incidentId, uploaded.key)
        throw err
      }
      setNotice('Bild wurde beim Einsatz für die Zentrale bereitgestellt.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bild konnte nicht bereitgestellt werden.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const openRows = rows.filter(row => row.status === 'offen' || row.status === 'in_bearbeitung')
  const resultRows = rows.filter(row => row.status === 'erledigt').map(row => ({
    row,
    document: row.result_document_id ? documents.find(doc => doc.id === row.result_document_id) : null,
  }))

  return <div className="space-y-3">
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Unterstützung durch die Zentrale</p>
      <p className="mt-1 text-xs text-gray-500">Anforderung über Funk oder Telefon. Hier werden nur Bilder und bereitgestellte Ergebnisse beim Einsatz gebündelt.</p>
    </div>

    {resultRows.filter(item => item.document).map(({ row, document }) => document ? <div key={row.id} className="rounded-xl border border-green-200 bg-green-50 p-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-green-900"><FileCheck2 className="h-4 w-4" /> Ergebnis der Zentrale liegt vor</p>
      {row.request_text ? <p className="mt-1 text-xs text-green-800">{row.request_text}</p> : null}
      <button type="button" onClick={() => void openEinsatzdokument(document.fileKey).catch(() => setError('Ergebnisdokument konnte nicht geöffnet werden.'))} className="mt-2 rounded-lg bg-green-800 px-3 py-2 text-xs font-bold text-white">Ergebnis öffnen</button>
    </div> : null)}

    {openRows.length > 0 ? <div className="space-y-1.5">{openRows.map(row => <div key={row.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <p className="text-xs font-bold text-amber-900">Zentrale: {row.status === 'in_bearbeitung' ? 'wird bearbeitet' : 'offen'}</p>
      {row.request_text ? <p className="mt-0.5 text-xs text-amber-800">{row.request_text}</p> : null}
    </div>)}</div> : null}

    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-blue-300 bg-white px-4 py-2.5 text-sm font-bold text-blue-800">
      <ImageUp className="h-5 w-5" /> Bild für Zentrale aufnehmen / auswählen
      <input ref={inputRef} type="file" accept="image/*,.pdf" capture="environment" className="sr-only" disabled={busy} onChange={event => void uploadImage(event.target.files?.[0])} />
    </label>

    {notice ? <p className="text-xs text-green-700">{notice}</p> : null}
    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>
}
