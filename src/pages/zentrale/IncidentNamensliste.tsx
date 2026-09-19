import { useCallback, useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { generateNamenslistePdf } from '../../lib/einsatzNamenslistePdf'
import { LISTENART_LABEL, LISTENART_SPALTEN, LISTENARTEN, addPersonen, loadPersonenliste, removePerson, sortiertNachTopNr, updatePerson, type Listenart } from '../../lib/zmrPersonen'
import type { NamenslistePerson } from '../../lib/types'

function nextStatus(art: Listenart, status: NamenslistePerson['status']): NamenslistePerson['status'] {
  if (art === 'evakuierung') {
    if (status === 'offen' || status === 'unbekannt') return 'im_haus'
    if (status === 'im_haus') return 'draussen'
    return 'unbekannt'
  }
  return status === 'erledigt' ? 'offen' : 'erledigt'
}

function statusLabel(art: Listenart, status: NamenslistePerson['status']): string {
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
// gegen die DB - bei der Notunterkunft-Namensliste (viele Zeilen, viele
// Spalten) würde ein Feld je Tastendruck unnötig oft schreiben und bei
// schlechter Verbindung vor Ort Eingaben verlieren.
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

// Personen-/Namensliste eines Einsatzes - bewusst getrennt von den Dateien
// (IncidentDocs.tsx): eigener Arbeitsschritt, eigener Tab. Ein ZMR-Auszug
// landet beim Hochladen automatisch in der Liste "Haus/Bewohner"; von dort
// kann gezielt ausgewählt und in die Notunterkunft-Namensliste kopiert
// werden (nicht automatisch - nicht jeder im Auszug ist untergebracht).
export default function IncidentNamensliste({ incidentId, incidentTitel, canOperate = true }: { incidentId: string; incidentTitel: string; canOperate?: boolean }) {
  const { profile } = useAuth()
  const [listenart, setListenart] = useState<Listenart>('haus')
  const [personen, setPersonen] = useState<NamenslistePerson[]>([])
  const [ausgewaehlt, setAusgewaehlt] = useState<Record<string, boolean>>({})
  const [neuerName, setNeuerName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hinweis, setHinweis] = useState('')

  const loadListe = useCallback(async () => {
    try {
      setPersonen(await loadPersonenliste(incidentId, listenart))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Die Liste konnte nicht geladen werden.')
    }
  }, [incidentId, listenart])
  useEffect(() => { setAusgewaehlt({}); void loadListe() }, [loadListe])

  async function onAddManual() {
    if (!neuerName.trim() || !profile?.id) return
    setBusy(true)
    setError('')
    try {
      const gespeichert = await addPersonen(incidentId, listenart, [{ name: neuerName.trim() }], profile.id)
      setPersonen(current => sortiertNachTopNr([...current, ...gespeichert]))
      setNeuerName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Person konnte nicht hinzugefügt werden.')
    } finally {
      setBusy(false)
    }
  }

  async function onFieldChange(person: NamenslistePerson, changes: Partial<NamenslistePerson>) {
    setPersonen(current => sortiertNachTopNr(current.map(row => row.id === person.id ? { ...row, ...changes } : row)))
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

  const ausgewaehlteIds = Object.keys(ausgewaehlt).filter(id => ausgewaehlt[id])

  async function inNotunterkunftKopieren() {
    if (!profile?.id || ausgewaehlteIds.length === 0) return
    const quelle = personen.filter(person => ausgewaehlteIds.includes(person.id))
    setBusy(true)
    setError('')
    try {
      await addPersonen(incidentId, 'unterbringung', quelle.map(person => ({ name: person.name, geboren: person.geboren ?? undefined, wohnung: person.wohnung ?? undefined })), profile.id)
      setHinweis(`${quelle.length} Person(en) in die Notunterkunft-Namensliste kopiert.`)
      setAusgewaehlt({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Übernahme in die Namensliste fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  function drucken() {
    generateNamenslistePdf({ incidentTitel, listenart, personen, erstelltVon: profile?.name ?? '–' })
  }

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <select className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white" value={listenart} onChange={event => setListenart(event.target.value as Listenart)}>
        {LISTENARTEN.map(key => <option key={key} value={key}>{LISTENART_LABEL[key]}</option>)}
      </select>
      <button type="button" onClick={drucken} disabled={personen.length === 0} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-800 border border-blue-200 px-2 py-1 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"><Printer className="w-3.5 h-3.5" /> Als PDF drucken</button>
      {listenart !== 'unterbringung' && ausgewaehlteIds.length > 0 ? <button type="button" onClick={() => void inNotunterkunftKopieren()} disabled={busy} className="text-xs font-semibold text-blue-800 border border-blue-200 px-2 py-1 rounded-md disabled:opacity-60">Ausgewählte ({ausgewaehlteIds.length}) in Notunterkunft-Namensliste kopieren</button> : null}
    </div>
    <p className="text-xs text-gray-500">{LISTENART_SPALTEN[listenart]} · nach Top-Nr sortiert</p>
    {personen.length === 0 ? <p className="text-xs text-gray-500">Noch keine Personen in dieser Liste. Über einen ZMR-Auszug (Tab Dateien) oder manuell hinzufügen.</p> : <ul className="space-y-1.5">{personen.map(person => (
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
          {canOperate ? <button type="button" onClick={() => void onRemovePerson(person)} className="text-xs text-red-700 hover:underline text-left">Entfernen</button> : null}
        </div> : <>
          <input type="checkbox" checked={!!ausgewaehlt[person.id]} onChange={() => setAusgewaehlt(current => ({ ...current, [person.id]: !current[person.id] }))} />
          <button type="button" onClick={() => void onFieldChange(person, { status: nextStatus(listenart, person.status) })} className="px-2 py-0.5 rounded-md border border-gray-300 bg-white">{statusLabel(listenart, person.status)}</button>
          <span className="font-medium text-gray-900">{person.name}</span>
          {person.wohnung ? <span className="text-gray-500">Top {person.wohnung}</span> : null}
          {person.geboren ? <span className="text-gray-500">* {person.geboren}</span> : null}
          {canOperate ? <button type="button" onClick={() => void onRemovePerson(person)} className="text-red-700 hover:underline">Entfernen</button> : null}
        </>}
      </li>
    ))}</ul>}
    {canOperate ? <div className="flex items-center gap-2">
      <input type="text" className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white flex-1 max-w-xs" placeholder="Name (manuell hinzufügen)" value={neuerName} onChange={event => setNeuerName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void onAddManual() }} />
      <button type="button" onClick={() => void onAddManual()} disabled={busy || !neuerName.trim()} className="text-xs font-semibold text-blue-800 border border-blue-200 px-2 py-1 rounded-md disabled:opacity-60">Hinzufügen</button>
    </div> : null}
    {hinweis ? <p className="text-xs text-gray-600">{hinweis}</p> : null}
    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>
}
