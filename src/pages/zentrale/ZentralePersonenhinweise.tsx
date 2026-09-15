import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import type { OperationalPersonNote, OperationalPersonNoteCategory } from '../../lib/types'
import { Actions, Area, Empty, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import { PersonPicker } from '../../components/RegisterPickers'
import { personDisplayName, usePersons } from '../../lib/register'

const PERSON_NOTE_LABEL: Record<OperationalPersonNoteCategory, string> = { infektionsschutz: 'Infektionsschutz', aggressiv: 'Aggressives Verhalten', waffenverbot: 'Waffenverbot', fluchtgefahr: 'Fluchtgefahr', suizidgefahr: 'Suizidgefahr', sonstiges: 'Sonstiger Sicherheitshinweis' }
const emptyPerson = { personId: null as string | null, location: '', category: 'aggressiv' as OperationalPersonNoteCategory, description: '', guidance: '', source: '', validUntil: '' }

export default function ZentralePersonenhinweise() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive, isZentralistOnDuty } = useAuth()
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManage = isStrictAdmin || isGenehmiger || (operativeModeActive && roles.some(role => ['sachbearbeiter', 'admin'].includes(role)))
  // Diensthabende Zentralisten dürfen Personenhinweise erfassen, auch ohne
  // eigene Sachbearbeiter/Genehmiger-Rolle - Löschen bleibt Verwaltung vorbehalten.
  const canOperate = canManage || isZentralistOnDuty
  const { persons, setPersons } = usePersons()
  const [personNotes, setPersonNotes] = useState<OperationalPersonNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [person, setPerson] = useState(emptyPerson)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('operational_person_notes').select('*, person:operational_persons(id,vorname,nachname,birth_date,phone)').eq('active', true).order('updated_at', { ascending: false })
    if (result.error) setError('Die Hinweise konnten nicht geladen werden.')
    else setError('')
    setPersonNotes((result.data ?? []) as unknown as OperationalPersonNote[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  function openNew() { setPerson(emptyPerson); setShowForm(true); setError('') }
  async function save() {
    if (!profile?.id || !person.personId || !person.description.trim()) { setError('Bitte Person und sachlichen Hinweis eingeben.'); return }
    setSaving(true)
    const result = await supabase.from('operational_person_notes').insert({ person_id: person.personId, location: person.location.trim() || null, category: person.category, note: person.description.trim(), action_guidance: person.guidance.trim() || null, source_reference: person.source.trim() || null, valid_until: person.validUntil || null, created_by: profile.id })
    setSaving(false)
    if (result.error) { setError('Der Personenhinweis konnte nicht gespeichert werden.'); return }
    const personName = personDisplayName(persons.find(item => item.id === person.personId))
    logAudit('Operativen Personenhinweis angelegt', `${PERSON_NOTE_LABEL[person.category]} · ${personName}`); setShowForm(false); setNotice('Personenhinweis wurde gespeichert.'); await load()
  }
  async function remove(item: OperationalPersonNote) {
    if (!window.confirm(`Hinweis zu „${personDisplayName(item.person)}“ endgültig löschen?`)) return
    const result = await supabase.from('operational_person_notes').delete().eq('id', item.id)
    if (result.error) { setError('Der Personenhinweis konnte nicht gelöscht werden.'); return }
    logAudit('Operativen Personenhinweis endgültig gelöscht', personDisplayName(item.person)); await load()
  }

  return <div>
    <Link to="/zentrale" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" /> Zur Zentrale</Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich · Zentrale</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Personenhinweise</h1><p className="text-sm text-gray-500 mt-1">Sicherheitsrelevante Hinweise mit Gültigkeit und Handlungsinformation.</p></div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3">
          <div><h2 className="font-bold text-gray-900">Operative Personenhinweise</h2><p className="text-sm text-gray-500">Nur sachliche und aktuell erforderliche Sicherheitsinformationen.</p></div>
          {canOperate ? <button type="button" onClick={openNew} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Hinweis</button> : null}
        </div>
        {personNotes.length === 0 ? <Empty text="Keine für dich sichtbaren aktiven Hinweise vorhanden." /> : <div className="divide-y">{personNotes.map(item => <article key={item.id} className="p-4 sm:p-5 flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900">{personDisplayName(item.person)}</h3><span className="text-xs font-semibold bg-red-100 text-red-800 px-2 py-1 rounded-full">{PERSON_NOTE_LABEL[item.category]}</span></div><p className="text-sm text-gray-700 mt-2">{item.note}</p>{item.action_guidance ? <p className="text-sm font-medium text-gray-900 mt-2">Hinweis: {item.action_guidance}</p> : null}<div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-2">{item.person?.birth_date ? <span>Geb.: {new Date(item.person.birth_date).toLocaleDateString('de-AT')}</span> : null}{item.person?.phone ? <span>TEL: {item.person.phone}</span> : null}{item.location ? <span>Adresse: {item.location}</span> : null}{item.valid_until ? <span>Gültig bis: {new Date(item.valid_until).toLocaleDateString('de-AT')}</span> : null}{item.source_reference ? <span>Grundlage: {item.source_reference}</span> : null}</div></div>{canManage ? <button type="button" onClick={() => void remove(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Personenhinweis löschen"><Trash2 className="w-4 h-4" /></button> : null}</article>)}</div>}
      </section>
    )}
    {showForm ? <PersonModal person={person} setPerson={setPerson} persons={persons} onPersonCreated={created => setPersons(current => [...current, created].sort((a, b) => personDisplayName(a).localeCompare(personDisplayName(b), 'de-AT')))} createdBy={profile?.id ?? null} saving={saving} error={error} close={() => setShowForm(false)} save={save} /> : null}
  </div>
}

function PersonModal({ person, setPerson, persons, onPersonCreated, createdBy, saving, error, close, save }: { person: typeof emptyPerson; setPerson: Dispatch<SetStateAction<typeof emptyPerson>>; persons: ReturnType<typeof usePersons>['persons']; onPersonCreated: (person: ReturnType<typeof usePersons>['persons'][number]) => void; createdBy: string | null; saving: boolean; error: string; close: () => void; save: () => Promise<void> }) {
  const patch = (values: Partial<typeof person>) => setPerson(current => ({ ...current, ...values }))
  return <Modal title="Operativen Personenhinweis anlegen" close={close}><div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">Nur erforderliche, sachliche und überprüfbare Informationen erfassen. Bei Infektionsrisiken möglichst den notwendigen Schutz statt einer Diagnose beschreiben.</div>
    <PersonPicker persons={persons} value={person.personId} onChange={id => patch({ personId: id })} createdBy={createdBy} onCreated={onPersonCreated} required />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="Adresse (optional)" value={person.location} onChange={value => patch({ location: value })} /><label className="text-xs font-medium text-gray-600">Art<select className={inputClass} value={person.category} onChange={event => patch({ category: event.target.value as OperationalPersonNoteCategory })}>{Object.entries(PERSON_NOTE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <p className="text-xs text-gray-500 -mt-2">Adresse eintragen, wenn der Hinweis auch beim Anlegen einer Meldung an dieser Adresse auffindbar sein soll - unabhängig davon, ob die Person bereits im Personen-Register erfasst ist.</p>
    <Area label="Sachlicher Hinweis *" value={person.description} onChange={value => patch({ description: value })} /><Area label="Konkreter Handlungshinweis" value={person.guidance} onChange={value => patch({ guidance: value })} /><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="Grundlage / Referenz" value={person.source} onChange={value => patch({ source: value })} /><Field label="Gültig bis" type="date" value={person.validUntil} onChange={value => patch({ validUntil: value })} /></div>{error ? <ErrorMessage text={error} /> : null}<Actions saving={saving} close={close} save={save} /></Modal>
}
