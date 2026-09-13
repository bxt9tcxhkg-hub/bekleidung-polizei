import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import type { OperationalPerson } from '../../lib/types'
import { Empty, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import { personDisplayName } from '../../lib/register'

// Zentrales Personen-Register: Basis für die Verknüpfung von Personenhinweisen,
// RSa/RSb, AV/BV & EV und Fahndungen auf dieselbe Person, statt Namen in
// jeder Kategorie separat als Freitext zu erfassen.

type LinkCounts = { hinweise: number; rsaRsb: number; avBv: number; fahndungen: number }
const emptyForm = { vorname: '', nachname: '', birthDate: '', phone: '', note: '' }

export default function ZentralePersonen() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManage = isStrictAdmin || isGenehmiger || roles.some(role => ['sachbearbeiter', 'admin'].includes(role))
  const [persons, setPersons] = useState<OperationalPerson[]>([])
  const [links, setLinks] = useState<Record<string, LinkCounts>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<OperationalPerson | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    const [personResult, noteResult, mailResult, avBvResult, fahndungResult] = await Promise.all([
      supabase.from('operational_persons').select('*').order('nachname').order('vorname'),
      supabase.from('operational_person_notes').select('person_id').eq('active', true),
      supabase.from('mail_deliveries').select('person_id').is('closed_at', null),
      supabase.from('zentrale_av_bv').select('person_id').not('person_id', 'is', null),
      supabase.from('zentrale_fahndungen').select('person_id').not('person_id', 'is', null),
    ])
    if (personResult.error) setError('Das Personen-Register konnte nicht geladen werden.')
    else setError('')
    setPersons((personResult.data ?? []) as OperationalPerson[])
    const counts: Record<string, LinkCounts> = {}
    const bump = (personId: string | null, key: keyof LinkCounts) => {
      if (!personId) return
      const current = counts[personId] ?? { hinweise: 0, rsaRsb: 0, avBv: 0, fahndungen: 0 }
      current[key] += 1
      counts[personId] = current
    }
    for (const row of noteResult.data ?? []) bump(row.person_id, 'hinweise')
    for (const row of mailResult.data ?? []) bump(row.person_id, 'rsaRsb')
    for (const row of avBvResult.data ?? []) bump(row.person_id, 'avBv')
    for (const row of fahndungResult.data ?? []) bump(row.person_id, 'fahndungen')
    setLinks(counts)
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true); setError('') }
  function openEdit(item: OperationalPerson) { setEditing(item); setForm({ vorname: item.vorname ?? '', nachname: item.nachname ?? '', birthDate: item.birth_date ?? '', phone: item.phone ?? '', note: item.note ?? '' }); setShowForm(true); setError('') }

  async function save() {
    // Am Telefon ist oft zunächst nur Vor- oder Nachname bekannt - beide
    // einzeln optional, aber mindestens eines muss angegeben werden.
    if (!form.vorname.trim() && !form.nachname.trim()) { setError('Bitte Vor- oder Nachname eingeben.'); return }
    setSaving(true)
    const payload = { vorname: form.vorname.trim() || null, nachname: form.nachname.trim() || null, birth_date: form.birthDate || null, phone: form.phone.trim() || null, note: form.note.trim() || null }
    const response = editing ? await supabase.from('operational_persons').update(payload).eq('id', editing.id) : await supabase.from('operational_persons').insert({ ...payload, created_by: profile?.id ?? null })
    setSaving(false)
    if (response.error) { setError('Person konnte nicht gespeichert werden.'); return }
    logAudit(editing ? 'Person bearbeitet' : 'Person angelegt', personDisplayName(payload)); setShowForm(false); setNotice('Person wurde gespeichert.'); await load()
  }
  async function remove() {
    if (!editing) return
    const count = links[editing.id]
    if (count && (count.hinweise || count.rsaRsb || count.avBv || count.fahndungen)) {
      setError('Diese Person ist noch mit Einträgen verknüpft (Personenhinweise, RSa/RSb, AV/BV oder Fahndungen) und kann daher nicht gelöscht werden.')
      return
    }
    if (!window.confirm(`Person „${personDisplayName(editing)}“ endgültig löschen?`)) return
    const result = await supabase.from('operational_persons').delete().eq('id', editing.id)
    if (result.error) { setError('Person konnte nicht gelöscht werden.'); return }
    logAudit('Person endgültig gelöscht', personDisplayName(editing)); setShowForm(false); setNotice('Person wurde endgültig gelöscht.'); await load()
  }

  return <div>
    <Link to="/zentrale" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" /> Zur Zentrale</Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich · Zentrale</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Personen</h1><p className="text-sm text-gray-500 mt-1">Zentrales Register - wird von Personenhinweisen, RSa/RSb, AV/BV & EV und Fahndungen als Verknüpfung genutzt.</p></div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3">
          <div><h2 className="font-bold text-gray-900">Personen-Register</h2><p className="text-sm text-gray-500">{persons.length} Personen erfasst.</p></div>
          {canManage ? <button type="button" onClick={openNew} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Person</button> : null}
        </div>
        {persons.length === 0 ? <Empty text="Noch keine Personen erfasst." /> : <div className="divide-y divide-gray-100">{persons.map(item => {
          const count = links[item.id]
          return <article key={item.id} className="p-4 sm:p-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900">{personDisplayName(item)}</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                {item.birth_date ? <span>Geb.: {new Date(item.birth_date).toLocaleDateString('de-AT')}</span> : null}
                {item.phone ? <span>TEL: {item.phone}</span> : null}
              </div>
              {item.note ? <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-wrap">{item.note}</p> : null}
              {count ? <div className="flex flex-wrap gap-1.5 mt-2">
                {count.hinweise ? <span className="text-xs font-medium bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{count.hinweise}× Personenhinweis</span> : null}
                {count.rsaRsb ? <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{count.rsaRsb}× RSa/RSb</span> : null}
                {count.avBv ? <span className="text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{count.avBv}× AV/BV & EV</span> : null}
                {count.fahndungen ? <span className="text-xs font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{count.fahndungen}× Fahndung</span> : null}
              </div> : null}
            </div>
            {canManage ? <button type="button" onClick={() => openEdit(item)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex-shrink-0" aria-label="Person bearbeiten"><Pencil className="w-4 h-4" /></button> : null}
          </article>
        })}</div>}
      </section>
    )}
    {showForm ? <Modal title={editing ? 'Person bearbeiten' : 'Person anlegen'} close={() => setShowForm(false)}>
      <p className="text-xs text-gray-500 -mt-2">Am Telefon ist oft zunächst nur Vor- oder Nachname bekannt - beide sind einzeln optional, mindestens eines wird benötigt.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Vorname" value={form.vorname} onChange={value => setForm(current => ({ ...current, vorname: value }))} />
        <Field label="Nachname" value={form.nachname} onChange={value => setForm(current => ({ ...current, nachname: value }))} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Geburtsdatum" type="date" value={form.birthDate} onChange={value => setForm(current => ({ ...current, birthDate: value }))} />
        <Field label="Telefonnummer" value={form.phone} onChange={value => setForm(current => ({ ...current, phone: value }))} />
      </div>
      <label className="block text-xs font-medium text-gray-600">Notiz<textarea className={`${inputClass} min-h-20 resize-y`} value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></label>
      {error ? <ErrorMessage text={error} /> : null}
      <div className="flex flex-wrap gap-3 pt-2">
        {editing ? <button type="button" disabled={saving} onClick={() => void remove()} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /> Endgültig löschen</button> : <span className="mr-auto" />}
        <button type="button" onClick={() => setShowForm(false)} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button>
        <button type="button" disabled={saving} onClick={() => void save()} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button>
      </div>
    </Modal> : null}
  </div>
}
