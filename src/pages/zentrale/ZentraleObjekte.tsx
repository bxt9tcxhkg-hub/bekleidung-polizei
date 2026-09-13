import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { composeObjectAddress, objectLabel } from '../../lib/register'
import { supabase } from '../../lib/supabase'
import type { OperationalObject } from '../../lib/types'
import { Empty, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'

// Zentrales Objekte-Register (Adressen/Gebäude): Basis für die Verknüpfung
// von AV/BV & EV, Fahndungen, Schlüsseln, Kontakten und (über home_object_id)
// Personen auf dasselbe Objekt, statt Adressen in jeder Kategorie separat als
// Freitext zu erfassen. Die Adresse wird strukturiert erfasst (Straße/
// Hausnummer/PLZ/Ort), damit eine Person eindeutig - nicht über einen
// fehleranfälligen Text-Abgleich - mit demselben Objekt verknüpft werden kann.

type LinkCounts = { avBv: number; fahndungen: number; schluessel: number; kontakte: number }
const emptyForm = { strasse: '', hausnummer: '', plz: '', ort: '', label: '', note: '' }

export default function ZentraleObjekte() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManage = isStrictAdmin || isGenehmiger || (operativeModeActive && roles.some(role => ['sachbearbeiter', 'admin'].includes(role)))
  const [objects, setObjects] = useState<OperationalObject[]>([])
  const [links, setLinks] = useState<Record<string, LinkCounts>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<OperationalObject | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    const [objectResult, avBvResult, fahndungResult, schluesselResult, kontaktResult] = await Promise.all([
      supabase.from('operational_objects').select('*').order('address'),
      supabase.from('zentrale_av_bv').select('object_id').not('object_id', 'is', null),
      supabase.from('zentrale_fahndungen').select('object_id').not('object_id', 'is', null),
      supabase.from('zentrale_schluessel').select('object_id').not('object_id', 'is', null),
      supabase.from('zentrale_kontakte').select('object_id').not('object_id', 'is', null),
    ])
    // Diese Zähler dienen nur der Anzeige (Badges je Objekt) - remove() prüft
    // die tatsächliche Löschsperre separat per exact-count, unabhängig von
    // Ladefehlern oder API-Seitenlimits hier.
    const linksFailed = Boolean(avBvResult.error || fahndungResult.error || schluesselResult.error || kontaktResult.error)
    if (objectResult.error) setError('Das Objekte-Register konnte nicht geladen werden.')
    else if (linksFailed) setError('Verknüpfungszahlen konnten nicht vollständig geladen werden (Anzeige ggf. unvollständig).')
    else setError('')
    setObjects((objectResult.data ?? []) as OperationalObject[])
    const counts: Record<string, LinkCounts> = {}
    const bump = (objectId: string | null, key: keyof LinkCounts) => {
      if (!objectId) return
      const current = counts[objectId] ?? { avBv: 0, fahndungen: 0, schluessel: 0, kontakte: 0 }
      current[key] += 1
      counts[objectId] = current
    }
    for (const row of avBvResult.data ?? []) bump(row.object_id, 'avBv')
    for (const row of fahndungResult.data ?? []) bump(row.object_id, 'fahndungen')
    for (const row of schluesselResult.data ?? []) bump(row.object_id, 'schluessel')
    for (const row of kontaktResult.data ?? []) bump(row.object_id, 'kontakte')
    setLinks(counts)
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true); setError('') }
  function openEdit(item: OperationalObject) { setEditing(item); setForm({ strasse: item.strasse ?? '', hausnummer: item.hausnummer ?? '', plz: item.plz ?? '', ort: item.ort ?? '', label: item.label ?? '', note: item.note ?? '' }); setShowForm(true); setError('') }

  async function save() {
    const address = composeObjectAddress(form)
    if (!address) { setError('Bitte Straße, PLZ und Ort eingeben.'); return }
    setSaving(true)
    const payload = {
      address, strasse: form.strasse.trim(), hausnummer: form.hausnummer.trim() || null, plz: form.plz.trim(), ort: form.ort.trim(),
      label: form.label.trim() || null, note: form.note.trim() || null,
    }
    const response = editing ? await supabase.from('operational_objects').update(payload).eq('id', editing.id) : await supabase.from('operational_objects').insert({ ...payload, created_by: profile?.id ?? null })
    setSaving(false)
    if (response.error) { setError('Objekt konnte nicht gespeichert werden.'); return }
    logAudit(editing ? 'Objekt bearbeitet' : 'Objekt angelegt', address); setShowForm(false); setNotice('Objekt wurde gespeichert.'); await load()
  }
  async function remove() {
    if (!editing) return
    const objectId = editing.id
    // Gezielte exact-count-Abfragen statt der oben geladenen Bulk-Listen: die
    // Bulk-Listen laden ALLE object_id-Werte der Tabellen ohne Paginierung und
    // würden ab mehr Zeilen als das API-Seitenlimit stillschweigend
    // unvollständig - ein außerhalb der geladenen Seite liegender Eintrag
    // würde das Objekt fälschlich als unverknüpft erscheinen lassen. Ein
    // exact-count ist dagegen unabhängig von der Tabellengröße korrekt.
    const [avBvCount, fahndungCount, schluesselCount, kontaktCount] = await Promise.all([
      supabase.from('zentrale_av_bv').select('id', { count: 'exact', head: true }).eq('object_id', objectId),
      supabase.from('zentrale_fahndungen').select('id', { count: 'exact', head: true }).eq('object_id', objectId),
      supabase.from('zentrale_schluessel').select('id', { count: 'exact', head: true }).eq('object_id', objectId),
      supabase.from('zentrale_kontakte').select('id', { count: 'exact', head: true }).eq('object_id', objectId),
    ])
    if (avBvCount.error || fahndungCount.error || schluesselCount.error || kontaktCount.error) {
      setError('Verknüpfungen konnten nicht geprüft werden - Löschen abgebrochen.')
      return
    }
    const total = (avBvCount.count ?? 0) + (fahndungCount.count ?? 0) + (schluesselCount.count ?? 0) + (kontaktCount.count ?? 0)
    if (total > 0) {
      setError('Dieses Objekt ist noch mit Einträgen verknüpft (AV/BV, Fahndungen, Schlüssel oder Kontakte) und kann daher nicht gelöscht werden.')
      return
    }
    if (!window.confirm(`Objekt „${objectLabel(editing)}“ endgültig löschen?`)) return
    const result = await supabase.from('operational_objects').delete().eq('id', objectId)
    if (result.error) { setError('Objekt konnte nicht gelöscht werden.'); return }
    logAudit('Objekt endgültig gelöscht', objectLabel(editing)); setShowForm(false); setNotice('Objekt wurde endgültig gelöscht.'); await load()
  }

  return <div>
    <Link to="/zentrale" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" /> Zur Zentrale</Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich · Zentrale</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Objekte</h1><p className="text-sm text-gray-500 mt-1">Adressen/Gebäude - wird von AV/BV & EV, Fahndungen, Schlüsseln und Kontakten als Verknüpfung genutzt.</p></div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3">
          <div><h2 className="font-bold text-gray-900">Objekte-Register</h2><p className="text-sm text-gray-500">{objects.length} Objekte erfasst.</p></div>
          {canManage ? <button type="button" onClick={openNew} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Objekt</button> : null}
        </div>
        {objects.length === 0 ? <Empty text="Noch keine Objekte erfasst." /> : <div className="divide-y divide-gray-100">{objects.map(item => {
          const count = links[item.id]
          return <article key={item.id} className="p-4 sm:p-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900">{objectLabel(item)}</h3>
              {item.note ? <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-wrap">{item.note}</p> : null}
              {count ? <div className="flex flex-wrap gap-1.5 mt-2">
                {count.avBv ? <span className="text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{count.avBv}× AV/BV & EV</span> : null}
                {count.fahndungen ? <span className="text-xs font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{count.fahndungen}× Fahndung</span> : null}
                {count.schluessel ? <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{count.schluessel}× Schlüssel</span> : null}
                {count.kontakte ? <span className="text-xs font-medium bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{count.kontakte}× Kontakt</span> : null}
              </div> : null}
            </div>
            {canManage ? <button type="button" onClick={() => openEdit(item)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex-shrink-0" aria-label="Objekt bearbeiten"><Pencil className="w-4 h-4" /></button> : null}
          </article>
        })}</div>}
      </section>
    )}
    {showForm ? <Modal title={editing ? 'Objekt bearbeiten' : 'Objekt anlegen'} close={() => setShowForm(false)}>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2"><Field label="Straße *" value={form.strasse} onChange={value => setForm(current => ({ ...current, strasse: value }))} /></div>
        <Field label="Hausnr." value={form.hausnummer} onChange={value => setForm(current => ({ ...current, hausnummer: value }))} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="PLZ *" value={form.plz} onChange={value => setForm(current => ({ ...current, plz: value }))} />
        <div className="col-span-2"><Field label="Ort *" value={form.ort} onChange={value => setForm(current => ({ ...current, ort: value }))} /></div>
      </div>
      <Field label="Bezeichnung (optional, z. B. Name des Gebäudes)" value={form.label} onChange={value => setForm(current => ({ ...current, label: value }))} />
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
