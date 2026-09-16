import { useEffect, useRef, useState } from 'react'
import { DOK_ART_LABEL, DOK_ARTEN, openEinsatzdokument, readDokumente, uploadEinsatzdokument, writeDokumente, type DokArt, type EinsatzDokument } from '../../lib/einsatzDokumente'

export default function IncidentDocs({ incidentId, from, canUpload = true }: { incidentId: string; from: 'zentrale' | 'streife'; canUpload?: boolean }) {
  const [docs, setDocs] = useState<EinsatzDokument[]>([])
  const [art, setArt] = useState<DokArt>(from === 'streife' ? 'ausweis' : 'abfrage')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDocs(readDokumente(incidentId)) }, [incidentId])

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const uploaded = await uploadEinsatzdokument(incidentId, file)
      const next: EinsatzDokument = {
        id: crypto.randomUUID(),
        incidentId,
        art,
        title: DOK_ART_LABEL[art],
        fileKey: uploaded.key,
        fileName: uploaded.name,
        from,
        at: new Date().toISOString(),
      }
      const list = [...readDokumente(incidentId), next]
      writeDokumente(incidentId, list)
      setDocs(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
    <p className="text-xs font-bold text-gray-800">Dokumente zum Einsatz</p>
    <p className="text-xs text-gray-500 mt-0.5">Zentrale: ZMR / Abfragen. Streife: Ausweis-Lichtbild.</p>
    {docs.length === 0 ? <p className="text-xs text-gray-500 mt-2">Noch keine Datei.</p> : <ul className="mt-2 space-y-1">{docs.map(doc => (
      <li key={doc.id}>
        <button type="button" onClick={() => void openEinsatzdokument(doc.fileKey).catch(() => setError('Datei konnte nicht geöffnet werden.'))} className="text-left text-xs text-blue-800 hover:underline">
          {DOK_ART_LABEL[doc.art]} · {doc.from === 'streife' ? 'Streife' : 'Zentrale'} · {new Date(doc.at).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </button>
      </li>
    ))}</ul>}
    {canUpload ? <div className="mt-2 flex flex-wrap items-center gap-2">
      <select className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white" value={art} onChange={event => setArt(event.target.value as DokArt)}>
        {DOK_ARTEN.map(key => <option key={key} value={key}>{DOK_ART_LABEL[key]}</option>)}
      </select>
      <label className="text-xs font-semibold text-blue-800 cursor-pointer">
        {busy ? 'Lade hoch…' : 'Datei anhängen'}
        <input ref={inputRef} type="file" accept="image/*,.pdf" className="sr-only" disabled={busy} onChange={event => void onFile(event.target.files?.[0])} />
      </label>
    </div> : null}
    {error ? <p className="text-xs text-red-700 mt-1">{error}</p> : null}
  </div>
}
