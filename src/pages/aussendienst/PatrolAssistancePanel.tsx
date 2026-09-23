import { useCallback, useEffect, useRef, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  ASSISTANCE_LABEL,
  createAssistanceRequest,
  extractIdDocumentData,
  loadIncidentAssistanceRequests,
} from '../../lib/incidentAssistance'
import {
  loadDokumente,
  openEinsatzdokument,
  registerEinsatzdokument,
  rollbackUploadedEinsatzdokument,
  uploadEinsatzdokument,
  type EinsatzDokument,
} from '../../lib/einsatzDokumente'
import type { IncidentAssistanceRequest, IncidentAssistanceRequestType } from '../../lib/types'

const TYPES: IncidentAssistanceRequestType[] = ['personenabfrage', 'zmr', 'fahrzeugabfrage', 'sonstiges']

export default function PatrolAssistancePanel({
  incidentId,
  vehicleId,
  incidentLocation,
}: {
  incidentId: string
  vehicleId?: string | null
  incidentLocation?: string | null
}) {
  const { profile } = useAuth()
  const [rows, setRows] = useState<IncidentAssistanceRequest[]>([])
  const [documents, setDocuments] = useState<EinsatzDokument[]>([])
  const [type, setType] = useState<IncidentAssistanceRequestType>('personenabfrage')
  const [requestText, setRequestText] = useState('')
  const [subjectData, setSubjectData] = useState<Record<string, string>>({})
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [documentName, setDocumentName] = useState('')
  const [busy, setBusy] = useState(false)
  const [extracting, setExtracting] = useState(false)
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
    } catch { /* card remains usable */ }
  }, [incidentId])
  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { void load() }, 10_000)
    return () => window.clearInterval(timer)
  }, [load])

  function resetForm(nextType = type) {
    setType(nextType)
    setRequestText('')
    setSubjectData(nextType === 'zmr' && incidentLocation ? { adresse: incidentLocation } : {})
    setDocumentId(null)
    setDocumentName('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function uploadId(file?: File) {
    if (!file || !profile?.id) return
    setBusy(true)
    setExtracting(true)
    setError('')
    setNotice('')
    try {
      const uploaded = await uploadEinsatzdokument(incidentId, file)
      let doc
      try {
        doc = await registerEinsatzdokument({
          incidentId,
          art: 'ausweis',
          title: 'Ausweis / Lichtbild',
          fileKey: uploaded.key,
          fileName: uploaded.name,
          from: 'streife',
          uploadedBy: profile.id,
        })
      } catch (err) {
        await rollbackUploadedEinsatzdokument(incidentId, uploaded.key)
        throw err
      }
      setDocumentId(doc.id)
      setDocumentName(doc.fileName)
      try {
        const extracted = await extractIdDocumentData({ incidentId, documentId: doc.id })
        setSubjectData(Object.fromEntries(Object.entries(extracted.fields).map(([key, value]) => [key, value])))
        setNotice(Object.keys(extracted.fields).length > 0
          ? 'Ausweisdaten erkannt. Bitte kurz prüfen und anschließend Anfrage senden.'
          : 'Ausweis gespeichert. Es konnten keine sicheren Felder automatisch erkannt werden; Angaben können ergänzt werden.')
      } catch (err) {
        setNotice(err instanceof Error ? err.message + ' Der Ausweis ist trotzdem gespeichert und kann mit der Anfrage gesendet werden.' : 'Ausweis gespeichert; automatische Erkennung nicht verfügbar.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ausweis konnte nicht hochgeladen werden.')
    } finally {
      setBusy(false)
      setExtracting(false)
    }
  }

  async function submit() {
    if (!profile?.id) return
    if (type === 'personenabfrage' && !documentId && Object.values(subjectData).every(value => !value.trim())) {
      setError('Für die Personenabfrage bitte Ausweis hochladen oder Personendaten ergänzen.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await createAssistanceRequest({
        incidentId,
        requestType: type,
        requestedBy: profile.id,
        requestedVehicleId: vehicleId ?? null,
        requestText,
        subjectData,
        sourceDocumentId: documentId,
      })
      setNotice('Anfrage an die Zentrale gesendet.')
      resetForm(type)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anfrage konnte nicht gesendet werden.')
    } finally {
      setBusy(false)
    }
  }

  const openRows = rows.filter(row => row.status === 'offen' || row.status === 'in_bearbeitung')
  const completedRows = rows.filter(row => row.status === 'erledigt')

  return <div className="space-y-3">
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Unterstützung Zentrale</p>
      <p className="mt-1 text-xs text-gray-500">Abfrage anfordern. Funk bzw. Telefon bleiben der normale Kommunikationsweg; Ergebnisdateien erscheinen automatisch beim Einsatz.</p>
    </div>

    {openRows.length > 0 ? <div className="space-y-1.5">{openRows.map(row => <div key={row.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <p className="text-xs font-bold text-amber-900">{ASSISTANCE_LABEL[row.request_type]} · {row.status === 'in_bearbeitung' ? 'wird bearbeitet' : 'offen'}</p>
      {row.request_text ? <p className="mt-0.5 text-xs text-amber-800">{row.request_text}</p> : null}
    </div>)}</div> : null}

    <div className="flex flex-wrap gap-1.5">
      {TYPES.map(key => <button key={key} type="button" onClick={() => resetForm(key)} className={'rounded-lg border px-2.5 py-1.5 text-xs font-semibold ' + (type === key ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700')}>
        {ASSISTANCE_LABEL[key]}
      </button>)}
    </div>

    {type === 'personenabfrage' ? <div className="rounded-xl border border-gray-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-800 px-3 py-2 text-xs font-bold text-white">
          <FileUp className="h-4 w-4" /> Ausweis fotografieren / hochladen
          <input ref={inputRef} type="file" accept="image/*,.pdf" capture="environment" className="sr-only" disabled={busy} onChange={event => void uploadId(event.target.files?.[0])} />
        </label>
        {extracting ? <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Daten werden gelesen…</span> : null}
        {documentName ? <span className="text-xs text-gray-500">{documentName}</span> : null}
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[
          ['nachname', 'Nachname'],
          ['vorname', 'Vorname'],
          ['geburtsdatum', 'Geburtsdatum'],
          ['dokumentnummer', 'Dokumentnummer'],
        ].map(([key, label]) => <label key={key} className="text-xs font-semibold text-gray-600">{label}
          <input value={subjectData[key] ?? ''} onChange={event => setSubjectData(current => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm font-normal text-gray-900" />
        </label>)}
      </div>
      <p className="mt-2 text-[11px] text-gray-500">Automatisch erkannte Ausweisdaten sind eine Eingabehilfe und müssen vor dem Absenden kurz geprüft werden.</p>
    </div> : null}

    {type === 'zmr' ? <div className="rounded-xl border border-gray-200 p-3">
      <label className="text-xs font-semibold text-gray-600">Adresse / Objekt
        <input value={subjectData.adresse ?? ''} onChange={event => setSubjectData(current => ({ ...current, adresse: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm font-normal text-gray-900" />
      </label>
      <p className="mt-2 text-[11px] text-gray-500">Die Einsatzörtlichkeit wird übernommen und kann bei Bedarf angepasst werden.</p>
    </div> : null}

    {type === 'fahrzeugabfrage' ? <div className="rounded-xl border border-gray-200 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-xs font-semibold text-gray-600">Kennzeichen
          <input value={subjectData.kennzeichen ?? ''} onChange={event => setSubjectData(current => ({ ...current, kennzeichen: event.target.value.toUpperCase() }))} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm font-normal text-gray-900" />
        </label>
        <label className="text-xs font-semibold text-gray-600">Marke / Typ
          <input value={subjectData.marke_typ ?? ''} onChange={event => setSubjectData(current => ({ ...current, marke_typ: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm font-normal text-gray-900" />
        </label>
        <label className="text-xs font-semibold text-gray-600 sm:col-span-2">FIN / Fahrgestellnummer (optional)
          <input value={subjectData.fin ?? ''} onChange={event => setSubjectData(current => ({ ...current, fin: event.target.value.toUpperCase() }))} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm font-normal text-gray-900" />
        </label>
      </div>
    </div> : null}

    <textarea value={requestText} onChange={event => setRequestText(event.target.value)} rows={2} placeholder={type === 'personenabfrage' ? 'Zusatz zur Abfrage (optional)' : 'Was soll die Zentrale abfragen / klären?'} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />

    <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-lg bg-blue-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
      Anfrage an Zentrale senden
    </button>

    {completedRows.length > 0 ? <details className="rounded-lg border border-gray-200 px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold text-gray-700">Abgeschlossene Anfragen ({completedRows.length})</summary>
      <div className="mt-2 space-y-2">{completedRows.slice(0, 5).map(row => {
        const resultDoc = row.result_document_id ? documents.find(doc => doc.id === row.result_document_id) : null
        return <div key={row.id} className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <strong>{ASSISTANCE_LABEL[row.request_type]}</strong>
          <span className="text-gray-500">{resultDoc ? ' · Ergebnis vorhanden' : ' · erledigt'}</span>
          {resultDoc ? <button type="button" onClick={() => void openEinsatzdokument(resultDoc.fileKey).catch(() => setError('Ergebnisdokument konnte nicht geöffnet werden.'))} className="font-semibold text-blue-800 underline">Ergebnis öffnen</button> : null}
        </div>
      })}</div>
    </details> : null}

    {notice ? <p className="text-xs text-green-700">{notice}</p> : null}
    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>
}
