import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import type { ZentraleKontakt } from '../../lib/types'
import { Empty, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import { ObjectPicker } from '../../components/RegisterPickers'
import { objectLabel, useObjects } from '../../lib/register'

const emptyForm = { name: '', institution: '', funktion: '', telefon: '', email: '', erreichbarkeit: '', objectId: null as string | null, note: '', restricted: false }

export default function ZentraleKontaktePage() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManage = isStrictAdmin || isGenehmiger || (operativeModeActive && roles.some(role => ['sachbearbeiter', 'admin'].includes(role)))
  const { objects, setObjects } = useObjects()
  const [items, setItems] = useState<ZentraleKontakt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ZentraleKontakt | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('zentrale_kontakte').select('*, object:operational_objects(id,address,label)').order('name')
    if (result.error) setError('Die Kontakte konnten nicht geladen werden.')
    else setError('')
    setItems((result.data ?? []) as unknown as ZentraleKontakt[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true); setError('') }
  function openEdit(item: ZentraleKontakt) { setEditing(item); setForm({ name: item.name, institution: item.institution ?? '', funktion: item.funktion ?? '', telefon: item.telefon ?? '', email: item.email ?? '', erreichbarkeit: item.erreichbarkeit ?? '', objectId: item.object_id, note: item.note ?? '', restricted: item.restricted }); setShowForm(true); setError('') }

  async function save() {
    if (!form.name.trim()) { setError('Bitte einen Namen eingeben.'); return }
    setSaving(true)
    const payload = { name: form.name.trim(), institution: form.institution.trim() || null, funktion: form.funktion.trim() || null, telefon: form.telefon.trim() || null, email: form.email.trim() || null, erreichbarkeit: form.erreichbarkeit.trim() || null, object_id: form.objectId, note: form.note.trim() || null, restricted: form.restricted }
    const response = editing ? await supabase.from('zentrale_kontakte').update(payload).eq('id', editing.id) : await supabase.from('zentrale_kontakte').insert({ ...payload, created_by: profile?.id ?? null })
    setSaving(false)
    if (response.error) { setError('Kontakt konnte nicht gespeichert werden.'); return }
    logAudit(editing ? 'Kontakt bearbeitet' : 'Kontakt angelegt', form.name.trim()); setShowForm(false); setNotice('Kontakt wurde gespeichert.'); await load()
  }
  async function remove() {
    if (!editing || !window.confirm(`Kontakt „${editing.name}“ endgültig löschen?`)) return
    const result = await supabase.from('zentrale_kontakte').delete().eq('id', editing.id)
    if (result.error) { setError('Kontakt konnte nicht gelöscht werden.'); return }
    logAudit('Kontakt endgültig gelöscht', editing.name); setShowForm(false); setNotice('Kontakt wurde endgültig gelöscht.'); await load()
  }

  return <div>
    <Link to="/zentrale" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" /> Zur Zentrale</Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich · Zentrale</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Kontakte</h1><p className="text-sm text-gray-500 mt-1">Dienstlich notwendige Kontakte und Rufbereitschaften.</p></div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3">
          <div><h2 className="font-bold text-gray-900">Kontakte</h2><p className="text-sm text-gray-500">{items.length} Kontakte.</p></div>
          {canManage ? <button type="button" onClick={openNew} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Kontakt</button> : null}
        </div>
        {items.length === 0 ? <Empty text="Keine Kontakte erfasst." /> : <div className="divide-y divide-gray-100">{items.map(item => <article key={item.id} className="p-4 sm:p-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900">{item.name}</h3>
              {item.restricted ? <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Vertraulich</span> : null}
            </div>
            {(item.institution || item.funktion) ? <p className="text-sm text-gray-600 mt-1">{[item.institution, item.funktion].filter(Boolean).join(' · ')}</p> : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1.5">
              {item.telefon ? <span>TEL: {item.telefon}</span> : null}
              {item.email ? <span>{item.email}</span> : null}
              {item.erreichbarkeit ? <span>Erreichbar: {item.erreichbarkeit}</span> : null}
              {item.object ? <span>Zuständig für: {objectLabel(item.object)}</span> : null}
            </div>
            {item.note ? <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{item.note}</p> : null}
          </div>
          {canManage ? <button type="button" onClick={() => openEdit(item)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex-shrink-0" aria-label="Kontakt bearbeiten"><Pencil className="w-4 h-4" /></button> : null}
        </article>)}</div>}
      </section>
    )}
    {showForm ? <Modal title={editing ? 'Kontakt bearbeiten' : 'Kontakt anlegen'} close={() => setShowForm(false)}>
      <Field label="Name *" value={form.name} onChange={value => setForm(current => ({ ...current, name: value }))} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Institution" value={form.institution} onChange={value => setForm(current => ({ ...current, institution: value }))} />
        <Field label="Funktion" value={form.funktion} onChange={value => setForm(current => ({ ...current, funktion: value }))} />
        <Field label="Telefon" value={form.telefon} onChange={value => setForm(current => ({ ...current, telefon: value }))} />
        <Field label="E-Mail" value={form.email} onChange={value => setForm(current => ({ ...current, email: value }))} />
      </div>
      <Field label="Erreichbarkeit (z. B. Mo–Fr 8–16 Uhr)" value={form.erreichbarkeit} onChange={value => setForm(current => ({ ...current, erreichbarkeit: value }))} />
      <ObjectPicker objects={objects} value={form.objectId} onChange={id => setForm(current => ({ ...current, objectId: id }))} createdBy={profile?.id ?? null} onCreated={created => setObjects(current => [...current, created].sort((a, b) => a.address.localeCompare(b.address, 'de-AT')))} label="Zuständig für Objekt (optional)" />
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
