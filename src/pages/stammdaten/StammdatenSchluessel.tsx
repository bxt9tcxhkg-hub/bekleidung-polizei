import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import type { Profile, SchluesselStatus, ZentraleSchluessel } from '../../lib/types'
import { Empty, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import { ObjectPicker } from '../../components/RegisterPickers'
import { objectLabel, useObjects } from '../../lib/register'
import { useOwnOperativBereicheToday } from '../../lib/dutyAccess'

const STATUS_LABEL: Record<SchluesselStatus, string> = { verfuegbar: 'Verfügbar', ausgegeben: 'Ausgegeben' }
type Colleague = Pick<Profile, 'id' | 'name' | 'dienstnummer'>
const emptyForm = { schluesselNummer: '', objectId: null as string | null, verwahrort: '', heldBy: '', note: '', status: 'verfuegbar' as SchluesselStatus, restricted: false }

export default function StammdatenSchluesselPage() {
  const { profile, hasAreaAccess, isStrictAdmin, areaRoles, operativeModeActive } = useAuth()
  const { bereiche: eigeneBereicheHeute } = useOwnOperativBereicheToday(profile?.id)
  // Pflege obliegt der Administration oder den Sachbearbeitern im Bereich
  // Datenpflege (eigener Portalbereich, siehe portalEntitlements.ts) - gelesen
  // wird das Register von Zentrale UND Datenpflege gemeinsam.
  const datenpflegeRoles = areaRoles?.find(row => row.area === 'datenpflege')?.roles ?? []
  const isDatenpflegeSachbearbeiter = operativeModeActive && datenpflegeRoles.some(role => ['sachbearbeiter', 'admin'].includes(role))
  const canManage = isStrictAdmin || isDatenpflegeSachbearbeiter
  const { objects, setObjects } = useObjects()
  const [items, setItems] = useState<ZentraleSchluessel[]>([])
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ZentraleSchluessel | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    const [itemResult, colleagueResult] = await Promise.all([
      supabase.from('zentrale_schluessel').select('*, object:operational_objects(id,address,label), held_by_profile:profiles!zentrale_schluessel_held_by_fkey(id,name,dienstnummer)').order('schluessel_nummer'),
      supabase.from('profiles').select('id,name,dienstnummer').eq('active', true).order('name'),
    ])
    if (itemResult.error) setError('Die Einträge konnten nicht geladen werden.')
    else setError('')
    setItems((itemResult.data ?? []) as unknown as ZentraleSchluessel[])
    setColleagues((colleagueResult.data ?? []) as Colleague[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  if (!hasAreaAccess('zentrale') && !hasAreaAccess('datenpflege') && eigeneBereicheHeute.size === 0) return <Navigate to="/" replace />

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true); setError('') }
  function openEdit(item: ZentraleSchluessel) { setEditing(item); setForm({ schluesselNummer: item.schluessel_nummer, objectId: item.object_id, verwahrort: item.verwahrort ?? '', heldBy: item.held_by ?? '', note: item.note ?? '', status: item.status, restricted: item.restricted }); setShowForm(true); setError('') }

  async function save() {
    if (!form.schluesselNummer.trim()) { setError('Bitte eine Schlüsselnummer eingeben.'); return }
    setSaving(true)
    const payload = { schluessel_nummer: form.schluesselNummer.trim(), object_id: form.objectId, verwahrort: form.verwahrort.trim() || null, held_by: form.heldBy || null, note: form.note.trim() || null, status: form.status, restricted: form.restricted }
    const response = editing ? await supabase.from('zentrale_schluessel').update(payload).eq('id', editing.id) : await supabase.from('zentrale_schluessel').insert({ ...payload, created_by: profile?.id ?? null })
    setSaving(false)
    if (response.error) { setError('Eintrag konnte nicht gespeichert werden.'); return }
    logAudit(editing ? 'Schlüssel bearbeitet' : 'Schlüssel angelegt', form.schluesselNummer.trim()); setShowForm(false); setNotice('Eintrag wurde gespeichert.'); await load()
  }
  async function remove() {
    if (!editing || !window.confirm(`Schlüssel „${editing.schluessel_nummer}“ endgültig löschen?`)) return
    const result = await supabase.from('zentrale_schluessel').delete().eq('id', editing.id)
    if (result.error) { setError('Eintrag konnte nicht gelöscht werden.'); return }
    logAudit('Schlüssel endgültig gelöscht', editing.schluessel_nummer); setShowForm(false); setNotice('Eintrag wurde endgültig gelöscht.'); await load()
  }

  return <div>
    <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" /> Zum Portal</Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Stammdaten &amp; Nachschlagewerke</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Schlüssel</h1><p className="text-sm text-gray-500 mt-1">Hinterlegte Schlüssel und Zutrittshinweise.</p></div>
    {!canManage ? <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">Nur lesender Zugriff. Änderungen an diesen Stammdaten führen ausschließlich Administration und Datenpflege-Sachbearbeiter durch.</div> : null}
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3">
          <div><h2 className="font-bold text-gray-900">Schlüssel</h2><p className="text-sm text-gray-500">{items.length} Einträge.</p></div>
          {canManage ? <button type="button" onClick={openNew} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Schlüssel</button> : null}
        </div>
        {items.length === 0 ? <Empty text="Keine Schlüssel erfasst." /> : <div className="divide-y divide-gray-100">{items.map(item => <article key={item.id} className="p-4 sm:p-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900">{item.schluessel_nummer}</h3>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.status === 'ausgegeben' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>{STATUS_LABEL[item.status]}</span>
              {item.restricted ? <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Vertraulich</span> : null}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1.5">
              {item.object ? <span>Objekt: {objectLabel(item.object)}</span> : null}
              {item.verwahrort ? <span>Verwahrort: {item.verwahrort}</span> : null}
              {item.held_by_profile ? <span>Aktuell bei: {item.held_by_profile.name}</span> : null}
            </div>
            {item.note ? <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{item.note}</p> : null}
          </div>
          {canManage ? <button type="button" onClick={() => openEdit(item)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex-shrink-0" aria-label="Schlüssel bearbeiten"><Pencil className="w-4 h-4" /></button> : null}
        </article>)}</div>}
      </section>
    )}
    {showForm ? <Modal title={editing ? 'Schlüssel bearbeiten' : 'Schlüssel anlegen'} close={() => setShowForm(false)}>
      <Field label="Schlüsselnummer *" value={form.schluesselNummer} onChange={value => setForm(current => ({ ...current, schluesselNummer: value }))} />
      <ObjectPicker objects={objects} value={form.objectId} onChange={id => setForm(current => ({ ...current, objectId: id }))} createdBy={profile?.id ?? null} onCreated={created => setObjects(current => [...current, created].sort((a, b) => a.address.localeCompare(b.address, 'de-AT')))} />
      <Field label="Verwahrort (z. B. Schlüsselkasten Zentrale, Fach 4)" value={form.verwahrort} onChange={value => setForm(current => ({ ...current, verwahrort: value }))} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-xs font-medium text-gray-600">Aktuell bei<select className={inputClass} value={form.heldBy} onChange={event => setForm(current => ({ ...current, heldBy: event.target.value }))}><option value="">– im Verwahrort –</option>{colleagues.map(colleague => <option key={colleague.id} value={colleague.id}>{colleague.name}{colleague.dienstnummer ? ` (${colleague.dienstnummer})` : ''}</option>)}</select></label>
        <label className="text-xs font-medium text-gray-600">Status<select className={inputClass} value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value as SchluesselStatus }))}><option value="verfuegbar">Verfügbar</option><option value="ausgegeben">Ausgegeben</option></select></label>
      </div>
      <label className="block text-xs font-medium text-gray-600">Notiz<textarea className={`${inputClass} min-h-20 resize-y`} value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></label>
      <label className="flex items-start gap-2.5 text-sm text-gray-700"><input type="checkbox" className="mt-0.5 rounded" checked={form.restricted} onChange={event => setForm(current => ({ ...current, restricted: event.target.checked }))} /><span><strong>Vertraulich</strong><br /><span className="text-xs text-gray-500">Nur Zentralisten, zuständige Sachbearbeiter und Admins können den Eintrag sehen.</span></span></label>
      {error ? <ErrorMessage text={error} /> : null}
      <div className="flex flex-wrap gap-3 pt-2">
        {editing && canManage ? <button type="button" disabled={saving} onClick={() => void remove()} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /> Endgültig löschen</button> : <span className="mr-auto" />}
        <button type="button" onClick={() => setShowForm(false)} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button>
        <button type="button" disabled={saving} onClick={() => void save()} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button>
      </div>
    </Modal> : null}
  </div>
}
