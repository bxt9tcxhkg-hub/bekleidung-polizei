import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import type { AlarmierungBereich, ZentraleAlarmierung, ZentraleEntry } from '../../lib/types'
import { Area, Empty, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'

const BEREICH_LABEL: Record<AlarmierungBereich, string> = { polizei: 'Polizeilich', staedtisch: 'Städtisch', beide: 'Polizeilich und städtisch' }
// Grundgerüst, bis das vollständige Alarmierungsschema vorliegt: Alarmierung
// ergibt sich aus der operativen Lage und unterscheidet sich nach Bereich;
// bei größeren Ereignissen ist die Stadtführung zu informieren. Die
// eigentliche Eskalationslogik (wer wird wann wie informiert) folgt später.
const emptyForm = { anlass: '', ablauf: '', lageId: null as string | null, bereich: '' as AlarmierungBereich | '', stadtfuehrungInformiert: false, gueltigBis: '', note: '', restricted: false }

export default function ZentraleAlarmierungPage() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive, isZentralistOnDuty } = useAuth()
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManage = isStrictAdmin || isGenehmiger || (operativeModeActive && roles.some(role => ['sachbearbeiter', 'admin'].includes(role)))
  // Diensthabende Zentralisten dürfen Einträge erfassen/bearbeiten, auch ohne
  // eigene Sachbearbeiter/Genehmiger-Rolle - Löschen bleibt Verwaltung vorbehalten.
  const canOperate = canManage || isZentralistOnDuty
  const [items, setItems] = useState<ZentraleAlarmierung[]>([])
  const [lagen, setLagen] = useState<ZentraleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ZentraleAlarmierung | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    const [itemResult, lageResult] = await Promise.all([
      supabase.from('zentrale_alarmierung').select('*, lage:zentrale_entries(id,title,incident_id)').order('updated_at', { ascending: false }),
      supabase.from('zentrale_entries').select('*').eq('category', 'lage').order('updated_at', { ascending: false }),
    ])
    if (itemResult.error) setError('Die Einträge konnten nicht geladen werden.')
    else setError('')
    setItems((itemResult.data ?? []) as unknown as ZentraleAlarmierung[])
    setLagen(lageResult.error ? [] : (lageResult.data ?? []) as ZentraleEntry[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true); setError('') }
  function openEdit(item: ZentraleAlarmierung) { setEditing(item); setForm({ anlass: item.anlass, ablauf: item.ablauf ?? '', lageId: item.lage_id, bereich: item.bereich ?? '', stadtfuehrungInformiert: item.stadtfuehrung_informiert, gueltigBis: item.gueltig_bis ?? '', note: item.note ?? '', restricted: item.restricted }); setShowForm(true); setError('') }

  async function save() {
    if (!form.anlass.trim()) { setError('Bitte einen Anlass eingeben.'); return }
    setSaving(true)
    // Stadtführung-Zeitpunkt automatisch beim Setzen/Entfernen des Hakens -
    // reine Dokumentation, kein manuelles Datum nötig.
    const stadtfuehrungAm = form.stadtfuehrungInformiert ? (editing?.stadtfuehrung_informiert ? editing.stadtfuehrung_informiert_am : new Date().toISOString()) : null
    const payload = { anlass: form.anlass.trim(), ablauf: form.ablauf.trim() || null, lage_id: form.lageId, bereich: form.bereich || null, stadtfuehrung_informiert: form.stadtfuehrungInformiert, stadtfuehrung_informiert_am: stadtfuehrungAm, gueltig_bis: form.gueltigBis || null, note: form.note.trim() || null, restricted: form.restricted }
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
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich · Zentrale</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Alarmierung</h1><p className="text-sm text-gray-500 mt-1">Verständigungsreihenfolgen und Eskalationswege - ergibt sich aus der operativen Lage.</p></div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3">
          <div><h2 className="font-bold text-gray-900">Alarmierung</h2><p className="text-sm text-gray-500">{items.length} Einträge.</p></div>
          {canOperate ? <button type="button" onClick={openNew} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Eintrag</button> : null}
        </div>
        {items.length === 0 ? <Empty text="Keine Einträge vorhanden." /> : <div className="divide-y divide-gray-100">{items.map(item => <article key={item.id} className="p-4 sm:p-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900">{item.anlass}</h3>
              {item.bereich ? <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{BEREICH_LABEL[item.bereich]}</span> : null}
              {item.stadtfuehrung_informiert ? <span className="text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Stadtführung informiert</span> : null}
              {item.restricted ? <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Vertraulich</span> : null}
            </div>
            {item.lage ? <p className="text-xs font-medium text-blue-700 mt-1.5">Aus Lage: {item.lage.title}</p> : null}
            {item.ablauf ? <p className="text-sm text-gray-700 mt-1.5 whitespace-pre-wrap">{item.ablauf}</p> : null}
            {item.gueltig_bis ? <p className="text-xs text-gray-400 mt-1.5">Gültig bis: {new Date(item.gueltig_bis).toLocaleDateString('de-AT')}</p> : null}
            {item.note ? <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{item.note}</p> : null}
          </div>
          {canOperate ? <button type="button" onClick={() => openEdit(item)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex-shrink-0" aria-label="Eintrag bearbeiten"><Pencil className="w-4 h-4" /></button> : null}
        </article>)}</div>}
      </section>
    )}
    {showForm ? <Modal title={editing ? 'Alarmierung bearbeiten' : 'Alarmierung anlegen'} close={() => setShowForm(false)}>
      <Field label="Anlass *" value={form.anlass} onChange={value => setForm(current => ({ ...current, anlass: value }))} />
      <label className="block text-xs font-medium text-gray-600">Ausgelöst durch Lage (optional)<select className={inputClass} value={form.lageId ?? ''} onChange={event => setForm(current => ({ ...current, lageId: event.target.value || null }))}><option value="">– keine Auswahl –</option>{lagen.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <Area label="Ablauf / Verständigungskette" value={form.ablauf} onChange={value => setForm(current => ({ ...current, ablauf: value }))} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-xs font-medium text-gray-600">Bereich<select className={inputClass} value={form.bereich} onChange={event => setForm(current => ({ ...current, bereich: event.target.value as AlarmierungBereich | '' }))}><option value="">– keine Auswahl –</option>{Object.entries(BEREICH_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <Field label="Gültig bis" type="date" value={form.gueltigBis} onChange={value => setForm(current => ({ ...current, gueltigBis: value }))} />
      </div>
      <label className="flex items-start gap-2.5 text-sm text-gray-700"><input type="checkbox" className="mt-0.5 rounded" checked={form.stadtfuehrungInformiert} onChange={event => setForm(current => ({ ...current, stadtfuehrungInformiert: event.target.checked }))} /><span><strong>Stadtführung informiert</strong><br /><span className="text-xs text-gray-500">Bei größeren Ereignissen ist die Stadtführung zu verständigen - hier nur zur Dokumentation, ohne Automatisierung.</span></span></label>
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
