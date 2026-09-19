import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { DOK_ART_LABEL, DOK_ARTEN, deleteEinsatzdokument, openEinsatzdokument, readDokumente, uploadEinsatzdokument, writeDokumente, type DokArt, type EinsatzDokument } from '../../lib/einsatzDokumente'
import { LISTENART_LABEL, LISTENART_SPALTEN, LISTENARTEN, addPersonen, extractPdfPlainText, loadPersonenliste, personenAusText, removePerson, updatePerson, type ErkannteZmrPerson, type Listenart } from '../../lib/zmrPersonen'
import type { NamenslistePerson, NamenslistePersonStatus } from '../../lib/types'

function nextStatus(art: Listenart, status: NamenslistePersonStatus): NamenslistePersonStatus {
  if (art === 'evakuierung') {
    if (status === 'offen' || status === 'unbekannt') return 'im_haus'
    if (status === 'im_haus') return 'draussen'
    return 'unbekannt'
  }
  return status === 'erledigt' ? 'offen' : 'erledigt'
}

function statusLabel(art: Listenart, status: NamenslistePersonStatus): string {
  if (art === 'evakuierung') {
    if (status === 'im_haus') return 'im Haus'
    if (status === 'draussen') return 'draußen'
    return 'unbekannt'
  }
  if (art === 'kontrolle') return status === 'erledigt' ? 'kontrolliert' : 'offen'
  if (art === 'befragung') return status === 'erledigt' ? 'befragt' : 'offen'
  return status === 'erledigt' ? 'ok' : 'offen'
}

// Kleines, kontrolliertes Text-Feld mit onBlur-Speichern statt Live-Tippen
// gegen die DB - ein Textfeld je Tastendruck zu speichern würde bei der
// Notunterkunft-Namensliste (viele Zeilen, viele Spalten) unnötig oft
// schreiben und bei schlechter Verbindung vor Ort Eingaben verlieren.
function InlineField({ value, placeholder, onCommit, className }: { value: string; placeholder: string; onCommit: (value: string) => void; className?: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return <input
    type="text"
    className={className ?? 'text-xs border border-gray-300 rounded-md px-1.5 py-1 bg-white w-full'}
    placeholder={placeholder}
    value={draft}
    onChange={event => setDraft(event.target.value)}
    onBlur={() => { if (draft !== (value || '')) onCommit(draft) }}
  />
}

export default function IncidentDocs({ incidentId, from, canUpload = true }: { incidentId: string; from: 'zentrale' | 'streife'; canUpload?: boolean }) {
  const { profile } = useAuth()
  const [docs, setDocs] = useState<EinsatzDokument[]>([])
  const [art, setArt] = useState<DokArt>(from === 'streife' ? 'ausweis' : 'zmr')
  const [listenart, setListenart] = useState<Listenart>('haus')
  const [personen, setPersonen] = useState<NamenslistePerson[]>([])
  const [erkannt, setErkannt] = useState<ErkannteZmrPerson[]>([])
  const [neuerName, setNeuerName] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [hinweis, setHinweis] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDocs(readDokumente(incidentId)) }, [incidentId])

  const loadListe = useCallback(async () => {
    try {
      setPersonen(await loadPersonenliste(incidentId, listenart))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Die Liste konnte nicht geladen werden.')
    }
  }, [incidentId, listenart])
  useEffect(() => { setErkannt([]); void loadListe() }, [loadListe])

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
        const gefunden = personenAusText(text)
        if (gefunden.length === 0) { setHinweis(text.trim() ? 'PDF gespeichert, aber keine Namen erkannt.' : 'PDF gespeichert, aber der Text konnte nicht gelesen werden (leere/gescannte PDF ohne Textebene?).'); return }
        const neue = gefunden.filter(person => !personen.some(row => row.name.toLowerCase() === person.name.toLowerCase() && row.geboren === (person.geboren ?? null)))
        if (neue.length === 0) { setHinweis('PDF gespeichert - alle erkannten Personen stehen bereits in der Liste.'); return }
        if (!profile?.id) return
        const gespeichert = await addPersonen(incidentId, listenart, neue, profile.id)
        setPersonen(current => [...current, ...gespeichert].sort((a, b) => a.name.localeCompare(b.name, 'de-AT')))
        setErkannt(neue)
        setHinweis(`${neue.length} Person(en) aus dem PDF übernommen.`)
        await loadListe()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  // Aus einem ZMR-Auszug/einer Abfrage erkannte Personen sind zunächst nur in
  // der gerade gewählten Listenart gespeichert (meist "Haus/Bewohner") - bei
  // einer Notunterkunft sollen dieselben Personen zusätzlich als Grundgerüst
  // in der Namensliste stehen, ergänzt um die dort nötigen Zusatzangaben
  // (Alter, Sprache, Familie, Ort der Unterkunft,…). Bewusst ein Klick statt
  // automatisch: nicht jede Person im Auszug ist zwangsläufig untergebracht.
  async function inNamenslisteUebernehmen() {
    if (!profile?.id || erkannt.length === 0) return
    setBusy(true)
    setError('')
    try {
      await addPersonen(incidentId, 'unterbringung', erkannt, profile.id)
      setHinweis(`${erkannt.length} Person(en) in die Namensliste (Notunterkunft) übernommen.`)
      setErkannt([])
      if (listenart === 'unterbringung') await loadListe()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Übernahme in die Namensliste fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  async function onAddManual() {
    if (!neuerName.trim() || !profile?.id) return
    setBusy(true)
    setError('')
    try {
      const gespeichert = await addPersonen(incidentId, listenart, [{ name: neuerName.trim() }], profile.id)
      setPersonen(current => [...current, ...gespeichert])
      setNeuerName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Person konnte nicht hinzugefügt werden.')
    } finally {
      setBusy(false)
    }
  }

  async function onFieldChange(person: NamenslistePerson, changes: Partial<NamenslistePerson>) {
    setPersonen(current => current.map(row => row.id === person.id ? { ...row, ...changes } : row))
    try {
      await updatePerson(person.id, changes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Änderung konnte nicht gespeichert werden.')
      await loadListe()
    }
  }

  async function onRemovePerson(person: NamenslistePerson) {
    if (!confirm(`${person.name} wirklich aus der Liste entfernen?`)) return
    setPersonen(current => current.filter(row => row.id !== person.id))
    try {
      await removePerson(person.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Person konnte nicht entfernt werden.')
      await loadListe()
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
        <select className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white" value={listenart} onChange={event => setListenart(event.target.value as Listenart)}>
          {LISTENARTEN.map(key => <option key={key} value={key}>{LISTENART_LABEL[key]}</option>)}
        </select>
        {erkannt.length > 0 && listenart !== 'unterbringung' ? <button type="button" onClick={() => void inNamenslisteUebernehmen()} disabled={busy} className="text-xs font-semibold text-blue-800 border border-blue-200 px-2 py-1 rounded-md disabled:opacity-60">In Namensliste (Notunterkunft) übernehmen</button> : null}
      </div>
      <p className="text-xs text-gray-500 mt-1">{LISTENART_SPALTEN[listenart]} · nach Top-Nr sortiert</p>
      {personen.length === 0 ? <p className="text-xs text-gray-500 mt-2">Noch keine Personen. ZMR-PDF hierher ziehen oder manuell hinzufügen.</p> : <ul className="mt-2 space-y-1.5">{personen.map(person => (
        <li key={person.id} className={listenart === 'unterbringung' ? 'rounded-lg border border-gray-200 p-2' : 'flex flex-wrap items-center gap-2 text-xs'}>
          {listenart === 'unterbringung' ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <InlineField value={person.name} placeholder="Name" onCommit={value => void onFieldChange(person, { name: value })} className="text-xs font-medium border border-gray-300 rounded-md px-1.5 py-1 bg-white col-span-2 sm:col-span-1" />
            <InlineField value={person.wohnung ?? ''} placeholder="Top-Nr" onCommit={value => void onFieldChange(person, { wohnung: value || null })} />
            <InlineField value={person.alter != null ? String(person.alter) : ''} placeholder="Alter" onCommit={value => void onFieldChange(person, { alter: value ? Number(value) || null : null })} />
            <select className="text-xs border border-gray-300 rounded-md px-1.5 py-1 bg-white" value={person.geschlecht ?? ''} onChange={event => void onFieldChange(person, { geschlecht: (event.target.value || null) as NamenslistePerson['geschlecht'] })}>
              <option value="">m/w/d</option><option value="m">m</option><option value="w">w</option><option value="d">d</option>
            </select>
            <InlineField value={person.sprache ?? ''} placeholder="Sprache" onCommit={value => void onFieldChange(person, { sprache: value || null })} />
            <InlineField value={person.familie ?? ''} placeholder="Familie" onCommit={value => void onFieldChange(person, { familie: value || null })} />
            <InlineField value={person.telefon ?? ''} placeholder="Telefon" onCommit={value => void onFieldChange(person, { telefon: value || null })} />
            <InlineField value={person.ort_unterkunft ?? ''} placeholder="Ort Unterkunft (privat/Notunterkunft)" onCommit={value => void onFieldChange(person, { ort_unterkunft: value || null })} className="text-xs border border-gray-300 rounded-md px-1.5 py-1 bg-white col-span-2" />
            <InlineField value={person.anmerkungen ?? ''} placeholder="Anmerkungen" onCommit={value => void onFieldChange(person, { anmerkungen: value || null })} className="text-xs border border-gray-300 rounded-md px-1.5 py-1 bg-white col-span-2" />
            {canUpload ? <button type="button" onClick={() => void onRemovePerson(person)} className="text-xs text-red-700 hover:underline text-left">Entfernen</button> : null}
          </div> : <>
            <button type="button" onClick={() => void onFieldChange(person, { status: nextStatus(listenart, person.status) })} className="px-2 py-0.5 rounded-md border border-gray-300 bg-white">{statusLabel(listenart, person.status)}</button>
            <span className="font-medium text-gray-900">{person.name}</span>
            {person.wohnung ? <span className="text-gray-500">Top {person.wohnung}</span> : null}
            {person.geboren ? <span className="text-gray-500">* {person.geboren}</span> : null}
            {canUpload ? <button type="button" onClick={() => void onRemovePerson(person)} className="text-red-700 hover:underline">Entfernen</button> : null}
          </>}
        </li>
      ))}</ul>}
      {canUpload ? <div className="mt-2 flex items-center gap-2">
        <input type="text" className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white flex-1 max-w-xs" placeholder="Name (manuell hinzufügen)" value={neuerName} onChange={event => setNeuerName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void onAddManual() }} />
        <button type="button" onClick={() => void onAddManual()} disabled={busy || !neuerName.trim()} className="text-xs font-semibold text-blue-800 border border-blue-200 px-2 py-1 rounded-md disabled:opacity-60">Hinzufügen</button>
      </div> : null}
    </div>
    {hinweis ? <p className="text-xs text-gray-600">{hinweis}</p> : null}
    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>
}
