import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { DOK_ART_LABEL, DOK_ARTEN, deleteEinsatzdokument, loadDokumente, openEinsatzdokument, registerEinsatzdokument, rollbackUploadedEinsatzdokument, uploadEinsatzdokument, type DokArt, type EinsatzDokument } from '../../lib/einsatzDokumente'
import { addPersonen, extractPdfPlainText, personenAusText } from '../../lib/zmrPersonen'

// Reine Datei-Ablage (Ausweis/ZMR-Auszug/Abfrage/Sonstiges) - bewusst
// getrennt von der Personen-/Namensliste (IncidentNamensliste.tsx), auch
// wenn ein ZMR-Auszug hier automatisch Personen erkennt und in die
// "Haus/Bewohner"-Liste einträgt: Dateien und Listen sind zwei
// unterschiedliche Arbeitsschritte und sollen nicht in einer Ansicht
// vermischt werden.
export default function IncidentDocs({ incidentId, from, canUpload = true }: { incidentId: string; from: 'zentrale' | 'streife'; canUpload?: boolean }) {
  const { profile } = useAuth()
  const [docs, setDocs] = useState<EinsatzDokument[]>([])
  const [art, setArt] = useState<DokArt>(from === 'streife' ? 'ausweis' : 'zmr')
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [hinweis, setHinweis] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    setError('')
    void loadDokumente(incidentId, profile?.id)
      .then(rows => { if (!cancelled) setDocs(rows) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Einsatzunterlagen konnten nicht geladen werden.') })
    return () => { cancelled = true }
  }, [incidentId, profile?.id])

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    setHinweis('')
    try {
      if (!profile?.id) throw new Error('Nicht angemeldet.')
      const uploaded = await uploadEinsatzdokument(incidentId, file)
      let next: EinsatzDokument
      try {
        next = await registerEinsatzdokument({
          incidentId,
          art,
          title: DOK_ART_LABEL[art],
          fileKey: uploaded.key,
          fileName: uploaded.name,
          from,
          uploadedBy: profile.id,
        })
      } catch (err) {
        await rollbackUploadedEinsatzdokument(incidentId, uploaded.key)
        throw err
      }
      setDocs(current => [...current, next])
      if ((art === 'zmr' || art === 'abfrage') && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
        const text = await extractPdfPlainText(file)
        const gefunden = personenAusText(text)
        if (gefunden.length === 0) { setHinweis(text.trim() ? 'PDF gespeichert, aber keine Namen erkannt.' : 'PDF gespeichert, aber der Text konnte nicht gelesen werden (leere/gescannte PDF ohne Textebene?).'); return }
        if (!profile?.id) return
        // Landen immer in "Haus/Bewohner" - die Übernahme in eine andere
        // Liste (z. B. Notunterkunft-Namensliste) passiert bewusst getrennt
        // im Ereignis-Arbeitsraum unter „Unterstützung vor Ort“.
        await addPersonen(incidentId, 'haus', gefunden, profile.id)
        setHinweis(`${gefunden.length} Person(en) aus dem PDF in die Liste "Haus/Bewohner" übernommen. Weiterbearbeitung unter Ereignis → Unterstützung vor Ort.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function onDelete(doc: EinsatzDokument) {
    if (!confirm(`${DOK_ART_LABEL[doc.art]} · ${doc.fileName} wirklich löschen?`)) return
    setError('')
    try {
      await deleteEinsatzdokument(incidentId, doc)
      setDocs(current => current.filter(row => row.id !== doc.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unterlage konnte nicht gelöscht werden.')
    }
  }

  function takeFiles(list: FileList | File[] | null) {
    const files = list ? Array.from(list) : []
    if (files[0]) void onFile(files[0])
  }

  return <div className="space-y-4">
    <div>
      <p className="text-xs font-bold text-gray-800">Dateien</p>
      {docs.length === 0 ? <p className="text-xs text-gray-500 mt-2">Noch keine Datei.</p> : <ul className="mt-2 space-y-1">{docs.map(doc => (
        <li key={doc.id} className="flex items-center gap-2">
          <button type="button" onClick={() => void openEinsatzdokument(doc.fileKey).catch(() => setError('Datei konnte nicht geöffnet werden.'))} className="text-left text-xs text-blue-800 hover:underline">
            {DOK_ART_LABEL[doc.art]} · {doc.fileName} · {new Date(doc.at).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </button>
          {canUpload ? <button type="button" onClick={() => void onDelete(doc)} className="text-xs text-red-700 hover:underline">Entfernen</button> : null}
        </li>
      ))}</ul>}
      {canUpload ? <div
        className={`mt-3 rounded-xl border-2 border-dashed px-3 py-6 text-center ${dragOver ? 'border-blue-600 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}
        onDragEnter={event => { event.preventDefault(); setDragOver(true) }}
        onDragOver={event => { event.preventDefault(); setDragOver(true) }}
        onDragLeave={event => { event.preventDefault(); setDragOver(false) }}
        onDrop={event => { event.preventDefault(); setDragOver(false); takeFiles(event.dataTransfer.files) }}
      >
        <p className="text-sm text-gray-700">{busy ? 'Lade hoch…' : 'Datei hierher ziehen'}</p>
        <p className="text-xs text-gray-500 mt-1">PDF oder Bild. Oder Ordner umgehen und nur die Datei ablegen.</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <select className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white" value={art} onChange={event => setArt(event.target.value as DokArt)}>
            {DOK_ARTEN.map(key => <option key={key} value={key}>{DOK_ART_LABEL[key]}</option>)}
          </select>
          <label className="text-xs font-semibold text-blue-800 cursor-pointer">
            Datei wählen
            <input ref={inputRef} type="file" accept="image/*,.pdf" className="sr-only" disabled={busy} onChange={event => takeFiles(event.target.files)} />
          </label>
        </div>
      </div> : null}
    </div>
    {hinweis ? <p className="text-xs text-gray-600">{hinweis}</p> : null}
    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>
}
