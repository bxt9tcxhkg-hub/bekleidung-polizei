import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import type { ZentraleKontakt } from '../../lib/types'
import { Empty, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import { ObjectPicker } from '../../components/RegisterPickers'
import { objectLabel, useObjects } from '../../lib/register'
import { useOwnOperativBereicheToday } from '../../lib/dutyAccess'

const emptyForm = { name: '', institution: '', funktion: '', telefon: '', email: '', erreichbarkeit: '', objectId: null as string | null, note: '', restricted: false }

type BenutzerProfil = { id: string; name: string; dienstnummer: string | null; dienstgrad: string | null; organisation: string }
/** Vereinheitlichte Anzeigezeile: echte Kontakte (Institutionen/Rufbereitschaften) und automatisch gespiegelte Benutzer. */
type KontaktRow = { key: string; kind: 'kontakt' | 'benutzer'; name: string; institution: string | null; funktion: string | null; telefon: string | null; kontakt?: ZentraleKontakt }

export default function StammdatenKontaktePage() {
  const { profile, hasAreaAccess, isStrictAdmin, areaRoles } = useAuth()
  const { bereiche: eigeneBereicheHeute } = useOwnOperativBereicheToday(profile?.id)
  // Pflege obliegt der Administration oder den Sachbearbeitern im Bereich
  // Datenpflege (eigener Portalbereich, siehe portalEntitlements.ts) - gelesen
  // wird das Register von Zentrale UND Datenpflege gemeinsam.
  const datenpflegeRoles = areaRoles?.find(row => row.area === 'datenpflege')?.roles ?? []
  const isDatenpflegeSachbearbeiter = datenpflegeRoles.some(role => ['sachbearbeiter', 'admin'].includes(role))
  const canManage = isStrictAdmin || isDatenpflegeSachbearbeiter
  const { objects, setObjects } = useObjects()
  const [items, setItems] = useState<ZentraleKontakt[]>([])
  const [benutzer, setBenutzer] = useState<BenutzerProfil[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ZentraleKontakt | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [filterInstitution, setFilterInstitution] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [kontakteResult, benutzerResult] = await Promise.all([
      supabase.from('zentrale_kontakte').select('*, object:operational_objects(id,address,label)').order('name'),
      supabase.from('profiles').select('id,name,dienstnummer,dienstgrad,organisation').eq('active', true).order('name'),
    ])
    if (kontakteResult.error) setError('Die Kontakte konnten nicht geladen werden.')
    else setError('')
    setItems((kontakteResult.data ?? []) as unknown as ZentraleKontakt[])
    setBenutzer(benutzerResult.error ? [] : (benutzerResult.data ?? []) as unknown as BenutzerProfil[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const rows = useMemo((): KontaktRow[] => [
    ...items.map((item): KontaktRow => ({ key: `kontakt:${item.id}`, kind: 'kontakt', name: item.name, institution: item.institution, funktion: item.funktion, telefon: item.telefon, kontakt: item })),
    ...benutzer.map((person): KontaktRow => ({ key: `benutzer:${person.id}`, kind: 'benutzer', name: person.name, institution: person.organisation, funktion: [person.dienstgrad, person.dienstnummer ? `DN ${person.dienstnummer}` : null].filter(Boolean).join(' · ') || null, telefon: null })),
  ].sort((a, b) => a.name.localeCompare(b.name, 'de-AT')), [items, benutzer])
  const institutions = useMemo(() => [...new Set(rows.map(row => row.institution).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'de-AT')), [rows])
  const visibleRows = useMemo(() => filterInstitution ? rows.filter(row => row.institution === filterInstitution) : rows, [rows, filterInstitution])

  if (!hasAreaAccess('zentrale') && !hasAreaAccess('datenpflege') && eigeneBereicheHeute.size === 0) return <Navigate to="/" replace />

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
    <Link to="/stammdaten" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" /> Zu Stammdaten</Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Stammdaten &amp; Nachschlagewerke</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Kontakte</h1><p className="text-sm text-gray-500 mt-1">Dienstlich notwendige Kontakte und Rufbereitschaften, ergänzt um alle aktiven Benutzer (automatisch, nicht hier editierbar - Verwaltung im Portal).</p></div>
    {!canManage ? <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">Nur lesender Zugriff. Änderungen an diesen Stammdaten führen ausschließlich Administration und Datenpflege-Sachbearbeiter durch.</div> : null}
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold text-gray-900">Kontakte</h2><p className="text-sm text-gray-500">{visibleRows.length} von {rows.length} Kontakten{benutzer.length > 0 ? ` (davon ${benutzer.length} Benutzer)` : ''}.</p></div>
          <div className="flex items-center gap-2">
            {institutions.length > 0 ? <select className="text-sm border border-gray-300 rounded-lg px-2 py-2 bg-white" value={filterInstitution} onChange={event => setFilterInstitution(event.target.value)}>
              <option value="">Alle Institutionen</option>
              {institutions.map(name => <option key={name} value={name}>{name}</option>)}
            </select> : null}
            {canManage ? <button type="button" onClick={openNew} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Kontakt</button> : null}
          </div>
        </div>
        {visibleRows.length === 0 ? <Empty text="Keine Kontakte gefunden." /> : <div className="divide-y divide-gray-100">{visibleRows.map(row => row.kind === 'benutzer' ? <article key={row.key} className="p-4 sm:p-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900">{row.name}</h3>
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">Benutzer</span>
            </div>
            {(row.institution || row.funktion) ? <p className="text-sm text-gray-600 mt-1">{[row.institution, row.funktion].filter(Boolean).join(' · ')}</p> : null}
          </div>
        </article> : <article key={row.key} className="p-4 sm:p-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900">{row.kontakt!.name}</h3>
              {row.kontakt!.restricted ? <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Vertraulich</span> : null}
            </div>
            {(row.kontakt!.institution || row.kontakt!.funktion) ? <p className="text-sm text-gray-600 mt-1">{[row.kontakt!.institution, row.kontakt!.funktion].filter(Boolean).join(' · ')}</p> : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1.5">
              {row.kontakt!.telefon ? <span>TEL: {row.kontakt!.telefon}</span> : null}
              {row.kontakt!.email ? <span>{row.kontakt!.email}</span> : null}
              {row.kontakt!.erreichbarkeit ? <span>Erreichbar: {row.kontakt!.erreichbarkeit}</span> : null}
              {row.kontakt!.object ? <span>Zuständig für: {objectLabel(row.kontakt!.object)}</span> : null}
            </div>
            {row.kontakt!.note ? <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{row.kontakt!.note}</p> : null}
          </div>
          {canManage ? <button type="button" onClick={() => openEdit(row.kontakt!)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex-shrink-0" aria-label="Kontakt bearbeiten"><Pencil className="w-4 h-4" /></button> : null}
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
        {editing && canManage ? <button type="button" disabled={saving} onClick={() => void remove()} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /> Endgültig löschen</button> : <span className="mr-auto" />}
        <button type="button" onClick={() => setShowForm(false)} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button>
        <button type="button" disabled={saving} onClick={() => void save()} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button>
      </div>
    </Modal> : null}
  </div>
}
