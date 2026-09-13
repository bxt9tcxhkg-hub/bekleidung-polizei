import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import type { ZentraleAlarmierung } from '../../lib/types'
import { Area, Empty, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'

const emptyForm = { anlass: '', ablauf: '', gueltigBis: '', note: '', restricted: false }

export default function ZentraleAlarmierungPage() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManage = isStrictAdmin || isGenehmiger || roles.some(role => ['sachbearbeiter', 'admin'].includes(role))
  const [items, setItems] = useState<ZentraleAlarmierung[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ZentraleAlarmierung | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('zentrale_alarmierung').select('*').order('updated_at', { ascending: false })
    if (result.error) setError('Die Einträge konnten nicht geladen werden.')
    else setError('')
    setItems((result.data ?? []) as ZentraleAlarmierung[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true); setError('') }
  function openEdit(item: ZentraleAlarmierung) { setEditing(item); setForm({ anlass: item.anlass, ablauf: item.ablauf ?? '', gueltigBis: item.gueltig_bis ?? '', note: item.note ?? '', restricted: item.restricted }); setShowForm(true); setError('') }

  async function save() {
    if (!form.anlass.trim()) { setError('Bitte einen Anlass eingeben.'); return }
    setSaving(true)
    const payload = { anlass: form.anlass.trim(), ablauf: form.ablauf.trim() || null, gueltig_bis: form.gueltigBis || null, note: form.note.trim() || null, restricted: form.restricted }
    const response = editing ? await supabase.from('zentrale_alarmierung').update(payload).eq('id', editing.id) : await supabase.from('zentrale_alarmierung').insert({ ...payload, created_by: profile?.id ?? null })
    setSaving(false)
    if (response.error) { setError('Eintrag konnte nicht gespeichert werden.'); return }
    logAudit(editing ? 'Alarmierung bearbeitet' : 'Alarmierung angelegt', form.anlass.trim()); setShowForm(false); setNotice('Eintrag wurde gespeichert.'); await load()
  }
  async function remove() {
    if (!editing || !window.confirm(`Alarmierung „${editing.anlass}“ endgültig löschen?`)) return
    const result = await supabase.from('zentrale_alarmierung').delete().eq('id', editing.id)
    if (result.error) { setError('Eintrag konnte nicht gelöscht werden.'); return }
    logAudit('Alarmierung endgültig gelöscht', editing.anlass); setShowForm(false); setNotice('Eintrag wurde endgültig gelöscht.'); await load()
  }

  return <div>
    <Link to="/zentrale" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" /> Zur Zentrale</Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich · Zentrale</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Alarmierung</h1><p className="text-sm text-gray-500 mt-1">Verständigungsreihenfolgen und Eskalationswege.</p></div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3">
          <div><h2 className="font-bold text-gray-900">Alarmierung</h2><p className="text-sm text-gray-500">{items.length} Einträge.</p></div>
          {canManage ? <button type="button" onClick={openNew} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Eintrag</button> : null}
        </div>
        {items.length === 0 ? <Empty text="Keine Einträge vorhanden." /> : <div className="divide-y divide-gray-100">{items.map(item => <article key={item.id} className="p-4 sm:p-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900">{item.anlass}</h3>{item.restricted ? <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Vertraulich</span> : null}</div>
            {item.ablauf ? <p className="text-sm text-gray-700 mt-1.5 whitespace-pre-wrap">{item.ablauf}</p> : null}
            {item.gueltig_bis ? <p className="text-xs text-gray-400 mt-1.5">Gültig bis: {new Date(item.gueltig_bis).toLocaleDateString('de-AT')}</p> : null}
            {item.note ? <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{item.note}</p> : null}
          </div>
          {canManage ? <button type="button" onClick={() => openEdit(item)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex-shrink-0" aria-label="Eintrag bearbeiten"><Pencil className="w-4 h-4" /></button> : null}
        </article>)}</div>}
      </section>
    )}
    {showForm ? <Modal title={editing ? 'Alarmierung bearbeiten' : 'Alarmierung anlegen'} close={() => setShowForm(false)}>
      <Field label="Anlass *" value={form.anlass} onChange={value => setForm(current => ({ ...current, anlass: value }))} />
      <Area label="Ablauf / Verständigungskette" value={form.ablauf} onChange={value => setForm(current => ({ ...current, ablauf: value }))} />
      <Field label="Gültig bis" type="date" value={form.gueltigBis} onChange={value => setForm(current => ({ ...current, gueltigBis: value }))} />
      <label className="block text-xs font-medium text-gray-600">Notiz<textarea className={`${inputClass} min-h-20 resize-y`} value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></label>
      <label className="flex items-start gap-2.5 text-sm text-gray-700"><input type="checkbox" className="mt-0.5 rounded" checked={form.restricted} onChange={event => setForm(current => ({ ...current, restricted: event.target.checked }))} /><span><strong>Vertraulich</strong><br /><span className="text-xs text-gray-500">Nur Zentralisten, zuständige Sachbearbeiter und Admins können den Eintrag sehen.</span></span></label>
      {error ? <ErrorMessage text={error} /> : null}
      <div className="flex flex-wrap gap-3 pt-2">
        {editing ? <button type="button" disabled={saving} onClick={() => void remove()} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /> Endgültig löschen</button> : <span className="mr-auto" />}
        <button type="button" onClick={() => setShowForm(false)} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button>
        <button type="button" disabled={saving} onClick={() => void save()} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button>
      </div>
    </Modal> : null}
  </div>
}
