import { useCallback, useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { generateNamenslistePdf } from '../../lib/einsatzNamenslistePdf'
import { officerPrintName } from '../../lib/printDocs'
import {
  LISTENART_LABEL,
  LISTENART_SPALTEN,
  addPersonen,
  copyPersonenInListe,
  loadPersonenliste,
  removePerson,
  sortiertNachTopNr,
  updatePerson,
  type Listenart,
} from '../../lib/zmrPersonen'
import type { NamenslistePerson } from '../../lib/types'

const PRIMARY_LISTS: Listenart[] = ['haus', 'evakuierung', 'unterbringung']
const SECONDARY_LISTS: Listenart[] = ['kontrolle', 'befragung']

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

function StatusButton({
  active, children, onClick, disabled,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={'px-2 py-1 rounded-md border text-[11px] font-semibold disabled:opacity-50 ' + (active ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-gray-300 bg-white text-gray-700')}
  >{children}</button>
}

export default function IncidentNamensliste({ incidentId, incidentTitel, canOperate = true }: { incidentId: string; incidentTitel: string; canOperate?: boolean }) {
  const { profile } = useAuth()
  const [listenart, setListenart] = useState<Listenart>('haus')
  const [personen, setPersonen] = useState<NamenslistePerson[]>([])
  const [counts, setCounts] = useState<Record<Listenart, number>>({ haus: 0, kontrolle: 0, evakuierung: 0, befragung: 0, unterbringung: 0 })
  const [ausgewaehlt, setAusgewaehlt] = useState<Record<string, boolean>>({})
  const [neuerName, setNeuerName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hinweis, setHinweis] = useState('')

  const loadCounts = useCallback(async () => {
    const arten: Listenart[] = ['haus', 'kontrolle', 'evakuierung', 'befragung', 'unterbringung']
    const rows = await Promise.all(arten.map(async art => [art, (await loadPersonenliste(incidentId, art)).length] as const))
    setCounts(Object.fromEntries(rows) as Record<Listenart, number>)
  }, [incidentId])

  const loadListe = useCallback(async () => {
    try {
      setError('')
      setPersonen(await loadPersonenliste(incidentId, listenart))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Die Liste konnte nicht geladen werden.')
    }
  }, [incidentId, listenart])

  useEffect(() => {
    setAusgewaehlt({})
    void Promise.all([loadListe(), loadCounts()])
  }, [loadListe, loadCounts])

  async function refresh() {
    await Promise.all([loadListe(), loadCounts()])
  }

  async function onAddManual() {
    if (!neuerName.trim() || !profile?.id) return
    setBusy(true)
    setError('')
    try {
      const gespeichert = await addPersonen(incidentId, listenart, [{ name: neuerName.trim() }], profile.id)
      setPersonen(current => sortiertNachTopNr([...current, ...gespeichert]))
      setCounts(current => ({ ...current, [listenart]: current[listenart] + gespeichert.length }))
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
    setCounts(current => ({ ...current, [listenart]: Math.max(0, current[listenart] - 1) }))
    try {
      await removePerson(person.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Person konnte nicht entfernt werden.')
      await refresh()
    }
  }

  const ausgewaehlteIds = Object.keys(ausgewaehlt).filter(id => ausgewaehlt[id])
  const ausgewaehltePersonen = personen.filter(person => ausgewaehlteIds.includes(person.id))

  async function kopieren(ziel: 'evakuierung' | 'unterbringung') {
    if (!profile?.id || ausgewaehltePersonen.length === 0) return
    setBusy(true)
    setError('')
    setHinweis('')
    try {
      const result = await copyPersonenInListe(incidentId, ziel, ausgewaehltePersonen, profile.id)
      const text = result.hinzugefuegt > 0
        ? `${result.hinzugefuegt} Person(en) in „${LISTENART_LABEL[ziel]}“ übernommen.`
        : 'Alle ausgewählten Personen sind dort bereits vorhanden.'
      setHinweis(result.uebersprungen > 0 && result.hinzugefuegt > 0 ? `${text} ${result.uebersprungen} bereits vorhanden.` : text)
      setAusgewaehlt({})
      await loadCounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Übernahme fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const evakuierungStats = useMemo(() => {
    if (listenart !== 'evakuierung') return null
    return {
      imHaus: personen.filter(row => row.status === 'im_haus').length,
      draussen: personen.filter(row => row.status === 'draussen').length,
      unbekannt: personen.filter(row => row.status !== 'im_haus' && row.status !== 'draussen').length,
    }
  }, [listenart, personen])

  function drucken() {
    generateNamenslistePdf({ incidentTitel, listenart, personen, erstelltVon: officerPrintName(profile) })
  }

  return <div className="space-y-3">
    <div className="grid grid-cols-3 gap-2">
      {PRIMARY_LISTS.map(key => <button
        key={key}
        type="button"
        onClick={() => setListenart(key)}
        className={'rounded-xl border p-2 text-left ' + (listenart === key ? 'border-blue-700 bg-blue-50' : 'border-gray-200 bg-white')}
      >
        <p className="text-[11px] font-semibold text-gray-600">{LISTENART_LABEL[key]}</p>
        <p className="mt-0.5 text-lg font-bold text-gray-900">{counts[key]}</p>
      </button>)}
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={drucken} disabled={personen.length === 0} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-800 border border-blue-200 px-2 py-1.5 rounded-md disabled:opacity-40 disabled:cursor-not-allowed"><Printer className="w-3.5 h-3.5" /> PDF</button>
      <select
        className="text-xs border border-gray-300 rounded-md px-2 py-1.5 bg-white"
        value={SECONDARY_LISTS.includes(listenart) ? listenart : ''}
        onChange={event => { if (event.target.value) setListenart(event.target.value as Listenart) }}
      >
        <option value="">Weitere Listen</option>
        {SECONDARY_LISTS.map(key => <option key={key} value={key}>{LISTENART_LABEL[key]} ({counts[key]})</option>)}
      </select>
      {SECONDARY_LISTS.includes(listenart) ? <button type="button" onClick={() => setListenart('haus')} className="text-xs font-medium text-gray-600">Zurück zu Bewohner</button> : null}
    </div>

    {evakuierungStats ? <div className="flex flex-wrap gap-2 text-xs">
      <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-1">Im Haus <strong>{evakuierungStats.imHaus}</strong></span>
      <span className="rounded-full bg-green-50 border border-green-200 px-2 py-1">Draußen <strong>{evakuierungStats.draussen}</strong></span>
      <span className="rounded-full bg-gray-50 border border-gray-200 px-2 py-1">Unbekannt <strong>{evakuierungStats.unbekannt}</strong></span>
    </div> : null}

    <p className="text-xs text-gray-500">{LISTENART_SPALTEN[listenart]} · nach Top-Nr sortiert</p>

    {ausgewaehltePersonen.length > 0 && listenart !== 'unterbringung' ? <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-2">
      <span className="text-xs font-semibold text-blue-950">{ausgewaehltePersonen.length} ausgewählt</span>
      {listenart !== 'evakuierung' ? <button type="button" disabled={busy} onClick={() => void kopieren('evakuierung')} className="text-xs font-semibold text-blue-800 border border-blue-300 bg-white rounded-md px-2 py-1.5 disabled:opacity-50">→ Evakuierung</button> : null}
      <button type="button" disabled={busy} onClick={() => void kopieren('unterbringung')} className="text-xs font-semibold text-blue-800 border border-blue-300 bg-white rounded-md px-2 py-1.5 disabled:opacity-50">→ Notunterkunft</button>
      <button type="button" onClick={() => setAusgewaehlt({})} className="text-xs text-gray-600 px-1">Auswahl aufheben</button>
    </div> : null}

    {personen.length === 0 ? <p className="text-xs text-gray-500">
      {listenart === 'haus' ? 'Noch keine Bewohnerdaten. ZMR/Abfrage hochladen oder Person manuell ergänzen.' : 'Noch keine Personen in dieser Liste.'}
    </p> : <ul className="space-y-1.5">{personen.map(person => (
      <li key={person.id} className={listenart === 'unterbringung' ? 'rounded-lg border border-gray-200 p-2' : 'rounded-lg border border-gray-100 p-2 text-xs'}>
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
          <InlineField value={person.ort_unterkunft ?? ''} placeholder="Ort Unterkunft" onCommit={value => void onFieldChange(person, { ort_unterkunft: value || null })} className="text-xs border border-gray-300 rounded-md px-1.5 py-1 bg-white col-span-2" />
          <InlineField value={person.anmerkungen ?? ''} placeholder="Anmerkungen" onCommit={value => void onFieldChange(person, { anmerkungen: value || null })} className="text-xs border border-gray-300 rounded-md px-1.5 py-1 bg-white col-span-2" />
          {canOperate ? <button type="button" onClick={() => void onRemovePerson(person)} className="text-xs text-red-700 hover:underline text-left">Entfernen</button> : null}
        </div> : <div className="flex flex-wrap items-center gap-2">
          <input type="checkbox" checked={!!ausgewaehlt[person.id]} onChange={() => setAusgewaehlt(current => ({ ...current, [person.id]: !current[person.id] }))} />
          <span className="font-medium text-gray-900">{person.name}</span>
          {person.wohnung ? <span className="text-gray-500">Top {person.wohnung}</span> : null}
          {person.geboren ? <span className="text-gray-500">* {person.geboren}</span> : null}
          {listenart === 'evakuierung' ? <div className="flex gap-1 sm:ml-auto">
            <StatusButton active={person.status === 'im_haus'} disabled={!canOperate} onClick={() => void onFieldChange(person, { status: 'im_haus' })}>Im Haus</StatusButton>
            <StatusButton active={person.status === 'draussen'} disabled={!canOperate} onClick={() => void onFieldChange(person, { status: 'draussen' })}>Draußen</StatusButton>
            <StatusButton active={person.status !== 'im_haus' && person.status !== 'draussen'} disabled={!canOperate} onClick={() => void onFieldChange(person, { status: 'unbekannt' })}>Unbekannt</StatusButton>
          </div> : listenart === 'kontrolle' || listenart === 'befragung' ? <button
            type="button"
            disabled={!canOperate}
            onClick={() => void onFieldChange(person, { status: person.status === 'erledigt' ? 'offen' : 'erledigt' })}
            className="px-2 py-1 rounded-md border border-gray-300 bg-white disabled:opacity-50"
          >{statusLabel(listenart, person.status)}</button> : null}
          {canOperate ? <button type="button" onClick={() => void onRemovePerson(person)} className="text-red-700 hover:underline sm:ml-auto">Entfernen</button> : null}
        </div>}
      </li>
    ))}</ul>}

    {canOperate ? <div className="flex items-center gap-2">
      <input type="text" className="text-xs border border-gray-300 rounded-md px-2 py-1.5 bg-white flex-1 max-w-xs" placeholder="Person manuell ergänzen" value={neuerName} onChange={event => setNeuerName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void onAddManual() }} />
      <button type="button" onClick={() => void onAddManual()} disabled={busy || !neuerName.trim()} className="text-xs font-semibold text-blue-800 border border-blue-200 px-2 py-1.5 rounded-md disabled:opacity-60">Hinzufügen</button>
    </div> : null}

    {hinweis ? <p className="text-xs text-gray-600">{hinweis}</p> : null}
    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>
}
