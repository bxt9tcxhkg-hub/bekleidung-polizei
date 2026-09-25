import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { completeAssistanceRequest, startAssistanceRequest } from '../../lib/incidentAssistance'
import {
  loadDokumente,
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

/**
 * Gemeinsame Bearbeiten/Bereitstellen-Logik für offene Unterstützungsanfragen
 * (Übernehmen, Ergebnis hochladen, ohne Ergebnis abschließen) - genutzt sowohl
 * von der Einsatz-eigenen Arbeitsliste (IncidentAssistanceWorkPanel) als auch
 * von der bereichsweiten Zentrale-Warteschlange (ZentraleAssistanceQueue).
 * Laden/Polling und Darstellung bleiben bewusst bei den jeweiligen Komponenten,
 * da sich Datenquelle (ein Einsatz vs. alle offenen) und Layout unterscheiden.
 */
export function useAssistanceRequestQueue({
  loadRows,
  canOperate = true,
  pollMs,
  refreshToken,
  onChanged,
}: {
  loadRows: () => Promise<IncidentAssistanceRequest[]>
  canOperate?: boolean
  pollMs?: number
  refreshToken?: number
  onChanged?: () => void
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
      setRows(await loadRows())
      setError('')
    } catch {
      setError('Offene Anfragen konnten nicht geladen werden.')
    }
  }, [loadRows])

  useEffect(() => {
    void load()
    if (!pollMs) return
    const timer = window.setInterval(() => { void load() }, pollMs)
    return () => window.clearInterval(timer)
  }, [load, pollMs, refreshToken])

  async function take(row: IncidentAssistanceRequest) {
    if (!profile?.id || !canOperate || busy) return
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
    if (!file || !row || !profile?.id || busy) return
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
        await completeAssistanceRequest({ id: row.id, userId: profile.id, resultEventDocumentId: eventDoc.id })
      } else {
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
      setError(err instanceof Error ? err.message : 'Anfrage konnte nicht abgeschlossen werden.')
    } finally {
      setBusy(false)
    }
  }

  return { rows, activeId, sourceFileKey, busy, error, setError, inputRef, take, uploadResult, completeWithoutUpload }
}

export function assistanceSubjectText(row: IncidentAssistanceRequest): string {
  const data = row.subject_data ?? {}
  return [
    typeof data.nachname === 'string' ? data.nachname : null,
    typeof data.vorname === 'string' ? data.vorname : null,
    typeof data.geburtsdatum === 'string' ? '* ' + data.geburtsdatum : null,
    typeof data.dokumentnummer === 'string' ? 'Dok. ' + data.dokumentnummer : null,
    typeof data.kennzeichen === 'string' ? data.kennzeichen : null,
  ].filter(Boolean).join(' · ')
}
