import { useEffect, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PersonNameAutocomplete } from '../../components/RegisterPickers'
import { inputClass } from '../../components/ZentraleEntryEditor'
import { addEinsatzPartei, EINSATZ_PARTEI_ROLLEN, EINSATZ_PARTEI_ROLLE_LABEL, loadEinsatzParteien, MAIL_KIND_LABEL, openMailDeliveriesByPerson, removeEinsatzPartei, updateEinsatzParteiRolle } from '../../lib/einsatzParteien'
import { personDisplayName } from '../../lib/register'
import type { EinsatzPartei, EinsatzParteiRolle, MailDelivery, OperationalPerson } from '../../lib/types'

function HinweisOffeneMeldung({ items }: { items: Pick<MailDelivery, 'id' | 'kind' | 'status'>[] }) {
  if (items.length === 0) return null
  return <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-1">
    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> Offen: {items.map(item => MAIL_KIND_LABEL[item.kind]).join(', ')}
  </p>
}

export default function EinsatzParteien({ incidentId, persons, onPersonCreated, createdBy, canOperate }: {
  incidentId: string
  persons: OperationalPerson[]
  onPersonCreated: (person: OperationalPerson) => void
  createdBy: string | null
  canOperate: boolean
}) {
  const [parteien, setParteien] = useState<EinsatzPartei[]>([])
  const [hints, setHints] = useState<Map<string, Pick<MailDelivery, 'id' | 'kind' | 'status'>[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [personId, setPersonId] = useState<string | null>(null)
  const [rolle, setRolle] = useState<EinsatzParteiRolle>('beschuldigter')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const rows = await loadEinsatzParteien(incidentId)
      setParteien(rows)
      setHints(await openMailDeliveriesByPerson(rows.map(row => row.person_id)))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Die Parteien konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [incidentId])

  async function onPersonSelected(id: string | null) {
    setPersonId(id)
    if (!id) return
    const found = await openMailDeliveriesByPerson([id])
    setHints(current => new Map([...current, ...found]))
  }

  async function add() {
    if (!personId || !createdBy) { setError('Bitte eine Person auswählen.'); return }
    setSaving(true)
    try {
      await addEinsatzPartei(incidentId, personId, rolle, note, createdBy)
      setPersonId(null); setRolle('beschuldigter'); setNote('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Die Partei konnte nicht angelegt werden.')
    } finally {
      setSaving(false)
    }
  }

  async function changeRolle(item: EinsatzPartei, nextRolle: EinsatzParteiRolle) {
    setParteien(current => current.map(row => row.id === item.id ? { ...row, rolle: nextRolle } : row))
    try { await updateEinsatzParteiRolle(item.id, nextRolle) } catch { await load() }
  }

  async function remove(item: EinsatzPartei) {
    if (!window.confirm(`${personDisplayName(item.person)} aus diesem Einsatz entfernen?`)) return
    try { await removeEinsatzPartei(item.id); await load() } catch (err) { setError(err instanceof Error ? err.message : 'Die Partei konnte nicht entfernt werden.') }
  }

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-800" /></div>

  return <div className="space-y-4">
    {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
    {parteien.length === 0 ? <p className="text-sm text-gray-500">Noch keine Partei erfasst.</p> : <ul className="space-y-2">{parteien.map(item => <li key={item.id} className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{personDisplayName(item.person)}{item.person?.birth_date ? <span className="text-gray-500 font-normal"> · geb. {new Date(item.person.birth_date).toLocaleDateString('de-AT')}</span> : null}</p>
          {canOperate ? <select className="mt-1.5 text-xs border border-gray-300 rounded-md px-2 py-1 bg-white" value={item.rolle} onChange={event => void changeRolle(item, event.target.value as EinsatzParteiRolle)}>
            {EINSATZ_PARTEI_ROLLEN.map(key => <option key={key} value={key}>{EINSATZ_PARTEI_ROLLE_LABEL[key]}</option>)}
          </select> : <span className="text-xs font-semibold text-gray-600">{EINSATZ_PARTEI_ROLLE_LABEL[item.rolle]}</span>}
          {item.note ? <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.note}</p> : null}
          <HinweisOffeneMeldung items={hints.get(item.person_id) ?? []} />
          {canOperate ? <div className="flex flex-wrap gap-2 mt-2">
            <Link to={`/zentrale/av-bv-ev?gefaehrderId=${item.person_id}`} className="text-xs font-medium text-red-700 border border-red-200 bg-red-50 px-2 py-1 rounded-md">Als Gefährder in AV/BV vormerken</Link>
            <Link to={`/zentrale/av-bv-ev?geschuetztePersonId=${item.person_id}`} className="text-xs font-medium text-purple-700 border border-purple-200 bg-purple-50 px-2 py-1 rounded-md">Als geschützte Person vormerken</Link>
          </div> : null}
        </div>
        {canOperate ? <button type="button" onClick={() => void remove(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0" aria-label="Partei entfernen"><Trash2 className="w-4 h-4" /></button> : null}
      </div>
    </li>)}</ul>}

    {canOperate ? <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Partei erfassen</p>
      <PersonNameAutocomplete label="Person" persons={persons} value={personId} onChange={id => void onPersonSelected(id)} createdBy={createdBy} onCreated={person => { onPersonCreated(person); void onPersonSelected(person.id) }} />
      {personId ? <HinweisOffeneMeldung items={hints.get(personId) ?? []} /> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-gray-600">Rolle<select className={inputClass} value={rolle} onChange={event => setRolle(event.target.value as EinsatzParteiRolle)}>
          {EINSATZ_PARTEI_ROLLEN.map(key => <option key={key} value={key}>{EINSATZ_PARTEI_ROLLE_LABEL[key]}</option>)}
        </select></label>
        <label className="block text-xs font-medium text-gray-600">Bemerkung<input className={inputClass} value={note} onChange={event => setNote(event.target.value)} /></label>
      </div>
      <div className="flex justify-end"><button type="button" disabled={saving || !personId} onClick={() => void add()} className="text-sm font-medium bg-blue-800 hover:bg-blue-900 text-white px-3 py-2 rounded-lg disabled:opacity-50">{saving ? 'Speichern…' : 'Partei hinzufügen'}</button></div>
    </div> : null}
  </div>
}
