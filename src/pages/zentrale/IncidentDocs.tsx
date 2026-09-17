import { useEffect, useRef, useState } from 'react'
import { DOK_ART_LABEL, DOK_ARTEN, deleteEinsatzdokument, openEinsatzdokument, readDokumente, uploadEinsatzdokument, writeDokumente, type DokArt, type EinsatzDokument } from '../../lib/einsatzDokumente'
import { LISTENART_LABEL, LISTENART_SPALTEN, LISTENARTEN, extractPdfPlainText, personenAusText, readPersonenListe, writePersonenListe, type EinsatzPerson, type Listenart, type PersonenStatus } from '../../lib/zmrPersonen'

function nextStatus(art: Listenart, status: PersonenStatus): PersonenStatus {
  if (art === 'evakuierung') {
    if (status === 'offen' || status === 'unbekannt') return 'im_haus'
    if (status === 'im_haus') return 'draussen'
    return 'unbekannt'
  }
  return status === 'erledigt' ? 'offen' : 'erledigt'
}

function statusLabel(art: Listenart, status: PersonenStatus): string {
  if (art === 'evakuierung') {
    if (status === 'im_haus') return 'im Haus'
    if (status === 'draussen') return 'draußen'
    return 'unbekannt'
  }
  if (art === 'kontrolle') return status === 'erledigt' ? 'kontrolliert' : 'offen'
  if (art === 'befragung') return status === 'erledigt' ? 'befragt' : 'offen'
  return status === 'erledigt' ? 'ok' : 'offen'
}

export default function IncidentDocs({ incidentId, from, canUpload = true }: { incidentId: string; from: 'zentrale' | 'streife'; canUpload?: boolean }) {
  const [docs, setDocs] = useState<EinsatzDokument[]>([])
  const [art, setArt] = useState<DokArt>(from === 'streife' ? 'ausweis' : 'zmr')
  const [listenart, setListenart] = useState<Listenart>('haus')
  const [personen, setPersonen] = useState<EinsatzPerson[]>([])
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [hinweis, setHinweis] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDocs(readDokumente(incidentId))
    const stored = readPersonenListe(incidentId)
    setListenart(stored.art)
    setPersonen(stored.personen)
  }, [incidentId])

  function persist(nextArt: Listenart, nextPersonen: EinsatzPerson[]) {
    setListenart(nextArt)
    setPersonen(nextPersonen)
    writePersonenListe(incidentId, nextArt, nextPersonen)
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    setHinweis('')
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
      if ((art === 'zmr' || art === 'abfrage') && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
        const text = await extractPdfPlainText(file)
        const erkannt = personenAusText(text)
        if (erkannt.length === 0) setHinweis('PDF gespeichert, aber keine Namen erkannt.')
        else {
          const merged = [...personen]
          for (const person of erkannt) {
            if (!merged.some(row => row.name.toLowerCase() === person.name.toLowerCase() && row.geboren === person.geboren)) merged.push(person)
          }
          persist(listenart, merged)
          setHinweis(`${erkannt.length} Person(en) aus dem PDF übernommen.`)
        }
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
      await deleteEinsatzdokument(incidentId, doc.fileKey)
      const list = docs.filter(row => row.id !== doc.id)
      writeDokumente(incidentId, list)
      setDocs(list)
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
    <div className="border-t border-gray-200 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold text-gray-800">Generierte Listen</p>
        <select className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white" value={listenart} onChange={event => persist(event.target.value as Listenart, personen)}>
          {LISTENARTEN.map(key => <option key={key} value={key}>{LISTENART_LABEL[key]}</option>)}
        </select>
      </div>
      <p className="text-xs text-gray-500 mt-1">{LISTENART_SPALTEN[listenart]}</p>
      {personen.length === 0 ? <p className="text-xs text-gray-500 mt-2">Noch keine Personen. ZMR-PDF hierher ziehen.</p> : <ul className="mt-2 space-y-1">{personen.map(person => (
        <li key={person.id} className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={() => persist(listenart, personen.map(row => row.id === person.id ? { ...row, status: nextStatus(listenart, row.status) } : row))} className="px-2 py-0.5 rounded-md border border-gray-300 bg-white">{statusLabel(listenart, person.status)}</button>
          <span className="font-medium text-gray-900">{person.name}</span>
          {person.wohnung ? <span className="text-gray-500">Top {person.wohnung}</span> : null}
          {person.geboren ? <span className="text-gray-500">* {person.geboren}</span> : null}
        </li>
      ))}</ul>}
    </div>
    {hinweis ? <p className="text-xs text-gray-600">{hinweis}</p> : null}
    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>
}
