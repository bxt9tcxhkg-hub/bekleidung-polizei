import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import type { AvBvArt, ZentraleAvBv, ZentraleEntryPriority, ZentraleRegisterStatus } from '../../lib/types'
import { Area, Empty, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import { ObjectPicker, PersonPicker } from '../../components/RegisterPickers'
import { objectLabel, personDisplayName, useObjects, usePersons } from '../../lib/register'

const ART_LABEL: Record<AvBvArt, string> = { amtsverbot: 'Amtsverbot', betretungsverbot: 'Betretungsverbot', einreiseverbot: 'Einreiseverbot' }
const emptyForm = { art: 'betretungsverbot' as AvBvArt, personId: null as string | null, objectId: null as string | null, gebiet: '', grund: '', behoerde: '', aktenzeichen: '', gueltigVon: '', gueltigBis: '', note: '', priority: 'normal' as ZentraleEntryPriority, status: 'offen' as ZentraleRegisterStatus, restricted: false }

export default function ZentraleAvBvPage() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive, isZentralistOnDuty } = useAuth()
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManage = isStrictAdmin || isGenehmiger || (operativeModeActive && roles.some(role => ['sachbearbeiter', 'admin'].includes(role)))
  // Diensthabende Zentralisten dürfen Einträge erfassen/bearbeiten, auch ohne
  // eigene Sachbearbeiter/Genehmiger-Rolle - Löschen bleibt Verwaltung vorbehalten.
  const canOperate = canManage || isZentralistOnDuty
  const { persons, setPersons } = usePersons()
  const { objects, setObjects } = useObjects()
  const [items, setItems] = useState<ZentraleAvBv[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ZentraleAvBv | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('zentrale_av_bv').select('*, person:operational_persons(id,vorname,nachname,birth_date), object:operational_objects(id,address,label)').order('priority').order('updated_at', { ascending: false })
    if (result.error) setError('Die Einträge konnten nicht geladen werden.')
    else setError('')
    setItems((result.data ?? []) as unknown as ZentraleAvBv[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true); setError('') }
  function openEdit(item: ZentraleAvBv) { setEditing(item); setForm({ art: item.art, personId: item.person_id, objectId: item.object_id, gebiet: item.gebiet ?? '', grund: item.grund, behoerde: item.ausstellende_behoerde ?? '', aktenzeichen: item.aktenzeichen ?? '', gueltigVon: item.gueltig_von ?? '', gueltigBis: item.gueltig_bis ?? '', note: item.note ?? '', priority: item.priority, status: item.status, restricted: item.restricted }); setShowForm(true); setError('') }

  async function save() {
    if (!form.grund.trim()) { setError('Bitte einen Grund eingeben.'); return }
    setSaving(true)
    const payload = { art: form.art, person_id: form.personId, object_id: form.objectId, gebiet: form.gebiet.trim() || null, grund: form.grund.trim(), ausstellende_behoerde: form.behoerde.trim() || null, aktenzeichen: form.aktenzeichen.trim() || null, gueltig_von: form.gueltigVon || null, gueltig_bis: form.gueltigBis || null, note: form.note.trim() || null, priority: form.priority, status: form.status, restricted: form.restricted }
    const response = editing ? await supabase.from('zentrale_av_bv').update(payload).eq('id', editing.id) : await supabase.from('zentrale_av_bv').insert({ ...payload, created_by: profile?.id ?? null })
    setSaving(false)
    if (response.error) { setError('Eintrag konnte nicht gespeichert werden.'); return }
    logAudit(editing ? 'AV/BV & EV bearbeitet' : 'AV/BV & EV angelegt', `${ART_LABEL[form.art]} · ${form.grund.trim()}`); setShowForm(false); setNotice('Eintrag wurde gespeichert.'); await load()
  }
  async function remove() {
    if (!editing || !window.confirm('Eintrag endgültig löschen?')) return
    const result = await supabase.from('zentrale_av_bv').delete().eq('id', editing.id)
    if (result.error) { setError('Eintrag konnte nicht gelöscht werden.'); return }
    logAudit('AV/BV & EV endgültig gelöscht', `${ART_LABEL[editing.art]} · ${editing.grund}`); setShowForm(false); setNotice('Eintrag wurde endgültig gelöscht.'); await load()
  }

  return <div>
    <Link to="/zentrale" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" /> Zur Zentrale</Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich · Zentrale</p><h1 className="text-2xl font-bold text-gray-900 mt-1">AV/BV & EV</h1><p className="text-sm text-gray-500 mt-1">Laufende Amtsverbote, Betretungsverbote und einstweilige Verbote (Einreiseverbote).</p></div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3">
          <div><h2 className="font-bold text-gray-900">AV/BV & EV</h2><p className="text-sm text-gray-500">{items.length} Einträge.</p></div>
          {canOperate ? <button type="button" onClick={openNew} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Eintrag</button> : null}
        </div>
        {items.length === 0 ? <Empty text="Keine Einträge vorhanden." /> : <div className="divide-y divide-gray-100">{items.map(item => <article key={item.id} className="p-4 sm:p-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.priority === 'kritisch' ? 'bg-red-100 text-red-800' : item.priority === 'hoch' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>{ART_LABEL[item.art]}</span>
              <span className="text-xs text-gray-500">{item.status === 'erledigt' ? 'Erledigt' : 'Offen'}</span>
              {item.restricted ? <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Vertraulich</span> : null}
            </div>
            <h3 className="font-semibold text-gray-900 mt-1.5">{item.person ? personDisplayName(item.person) : 'Keine Person hinterlegt'}</h3>
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.grund}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mt-2">
              {item.object ? <span>Objekt: {objectLabel(item.object)}</span> : null}
              {item.gebiet ? <span>Gebiet: {item.gebiet}</span> : null}
              {item.ausstellende_behoerde ? <span>Behörde: {item.ausstellende_behoerde}</span> : null}
              {item.aktenzeichen ? <span>Aktenzeichen: {item.aktenzeichen}</span> : null}
              {item.gueltig_von || item.gueltig_bis ? <span>Gültig: {item.gueltig_von ? new Date(item.gueltig_von).toLocaleDateString('de-AT') : '…'} – {item.gueltig_bis ? new Date(item.gueltig_bis).toLocaleDateString('de-AT') : 'unbefristet'}</span> : null}
            </div>
            {item.note ? <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{item.note}</p> : null}
          </div>
          {canOperate ? <button type="button" onClick={() => openEdit(item)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex-shrink-0" aria-label="Eintrag bearbeiten"><Pencil className="w-4 h-4" /></button> : null}
        </article>)}</div>}
      </section>
    )}
    {showForm ? <Modal title={editing ? 'AV/BV & EV bearbeiten' : 'AV/BV & EV anlegen'} close={() => setShowForm(false)}>
      <label className="block text-xs font-medium text-gray-600">Art *<select className={inputClass} value={form.art} onChange={event => setForm(current => ({ ...current, art: event.target.value as AvBvArt }))}>{Object.entries(ART_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <PersonPicker persons={persons} value={form.personId} onChange={id => setForm(current => ({ ...current, personId: id }))} createdBy={profile?.id ?? null} onCreated={created => setPersons(current => [...current, created].sort((a, b) => personDisplayName(a).localeCompare(personDisplayName(b), 'de-AT')))} label="Betroffene Person" />
      <ObjectPicker objects={objects} value={form.objectId} onChange={id => setForm(current => ({ ...current, objectId: id }))} createdBy={profile?.id ?? null} onCreated={created => setObjects(current => [...current, created].sort((a, b) => a.address.localeCompare(b.address, 'de-AT')))} label="Objekt (z. B. Verbotszone)" />
      <Field label="Gebiet (Freitext, z. B. „gesamtes Gemeindegebiet“)" value={form.gebiet} onChange={value => setForm(current => ({ ...current, gebiet: value }))} />
      <Area label="Grund *" value={form.grund} onChange={value => setForm(current => ({ ...current, grund: value }))} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Ausstellende Behörde" value={form.behoerde} onChange={value => setForm(current => ({ ...current, behoerde: value }))} />
        <Field label="Aktenzeichen" value={form.aktenzeichen} onChange={value => setForm(current => ({ ...current, aktenzeichen: value }))} />
        <Field label="Gültig von" type="date" value={form.gueltigVon} onChange={value => setForm(current => ({ ...current, gueltigVon: value }))} />
        <Field label="Gültig bis" type="date" value={form.gueltigBis} onChange={value => setForm(current => ({ ...current, gueltigBis: value }))} />
        <label className="text-xs font-medium text-gray-600">Priorität<select className={inputClass} value={form.priority} onChange={event => setForm(current => ({ ...current, priority: event.target.value as ZentraleEntryPriority }))}><option value="normal">Normal</option><option value="hoch">Hoch</option><option value="kritisch">Kritisch</option></select></label>
        <label className="text-xs font-medium text-gray-600">Status<select className={inputClass} value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value as ZentraleRegisterStatus }))}><option value="offen">Offen</option><option value="erledigt">Erledigt</option></select></label>
      </div>
      <Area label="Notiz" value={form.note} onChange={value => setForm(current => ({ ...current, note: value }))} />
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
