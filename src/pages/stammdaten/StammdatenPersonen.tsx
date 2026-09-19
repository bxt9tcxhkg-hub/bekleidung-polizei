import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Merge, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import type { OperationalPerson } from '../../lib/types'
import { Empty, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import { ObjectPicker } from '../../components/RegisterPickers'
import { objectLabel, personDisplayName, personLabel, useObjects } from '../../lib/register'
import { useOwnOperativBereicheToday } from '../../lib/dutyAccess'

// Zentrales Personen-Register: Basis für die Verknüpfung von Personenhinweisen,
// RSa/RSb, AV/BV & EV und Fahndungen auf dieselbe Person, statt Namen in
// jeder Kategorie separat als Freitext zu erfassen. Die Anschrift ist eine
// echte Verknüpfung zum Objekte-Register (home_object_id), keine erneute
// Freitext-Eingabe der Adresse.

type LinkCounts = { hinweise: number; rsaRsb: number; avBv: number; fahndungen: number; schutzGefaehrder: number; schutzPerson: number }
type PhoneEntry = { id: string; number: string; erhoben_am: string }
function todayLocal() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
const emptyForm = { vorname: '', nachname: '', birthDate: '', phone: '', phoneErhobenAm: '', phoneNumberId: null as string | null, homeObjectId: null as string | null, note: '' }

export default function StammdatenPersonen() {
  const { profile, hasAreaAccess, isStrictAdmin } = useAuth()
  const { bereiche: eigeneBereicheHeute } = useOwnOperativBereicheToday(profile?.id)
  // Die Register sind für die Zentrale lesbar; ihre Pflege ist ausschließlich Aufgabe der Administration.
  const canManage = isStrictAdmin
  const [persons, setPersons] = useState<OperationalPerson[]>([])
  const [links, setLinks] = useState<Record<string, LinkCounts>>({})
  const [phoneByPerson, setPhoneByPerson] = useState<Record<string, PhoneEntry>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<OperationalPerson | null>(null)
  const [form, setForm] = useState(emptyForm)
  const { objects, setObjects } = useObjects()
  const [mergeItem, setMergeItem] = useState<OperationalPerson | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)
  const [mergeSaving, setMergeSaving] = useState(false)
  const [mergeError, setMergeError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [personResult, noteResult, mailResult, avBvResult, fahndungResult, schutzfallResult, schutzPersonResult, phoneResult] = await Promise.all([
      supabase.from('operational_persons').select('*, home_object:operational_objects(id, address, label, strasse, hausnummer, plz, ort)').order('nachname').order('vorname'),
      // Für die Löschsperre absichtlich ALLE Hinweise/Zustellungen zählen,
      // nicht nur aktive/offene: person_id ist hier ON DELETE CASCADE, ein
      // archivierter Hinweis oder ein bereits geschlossener RSa/RSb-Fall
      // dürfen beim Löschen der Person nicht unbemerkt mitgelöscht werden.
      supabase.from('operational_person_notes').select('person_id'),
      supabase.from('mail_deliveries').select('person_id'),
      supabase.from('zentrale_av_bv').select('person_id').not('person_id', 'is', null),
      supabase.from('zentrale_fahndungen').select('person_id').not('person_id', 'is', null),
      supabase.from('schutzfaelle').select('gefaehrder_id').not('gefaehrder_id', 'is', null),
      supabase.from('schutzfall_personen').select('person_id'),
      // Eine Person hat höchstens eine Telefonnummer im gemeinsamen Register
      // (von dieser Seite so gepflegt, keine DB-Eindeutigkeit erzwungen).
      supabase.from('operational_phone_numbers').select('id, person_id, number, erhoben_am').not('person_id', 'is', null),
    ])
    // Diese Zähler dienen nur der Anzeige (Badges je Person) - remove() prüft
    // die tatsächliche Löschsperre separat per exact-count, unabhängig von
    // Ladefehlern oder API-Seitenlimits hier.
    const linksFailed = Boolean(noteResult.error || mailResult.error || avBvResult.error || fahndungResult.error || schutzfallResult.error || schutzPersonResult.error || phoneResult.error)
    if (personResult.error) setError('Das Personen-Register konnte nicht geladen werden.')
    else if (linksFailed) setError('Verknüpfungszahlen konnten nicht vollständig geladen werden (Anzeige ggf. unvollständig).')
    else setError('')
    setPersons((personResult.data ?? []) as OperationalPerson[])
    const counts: Record<string, LinkCounts> = {}
    const bump = (personId: string | null, key: keyof LinkCounts) => {
      if (!personId) return
      const current = counts[personId] ?? { hinweise: 0, rsaRsb: 0, avBv: 0, fahndungen: 0, schutzGefaehrder: 0, schutzPerson: 0 }
      current[key] += 1
      counts[personId] = current
    }
    for (const row of noteResult.data ?? []) bump(row.person_id, 'hinweise')
    for (const row of mailResult.data ?? []) bump(row.person_id, 'rsaRsb')
    for (const row of avBvResult.data ?? []) bump(row.person_id, 'avBv')
    for (const row of fahndungResult.data ?? []) bump(row.person_id, 'fahndungen')
    for (const row of schutzfallResult.data ?? []) bump(row.gefaehrder_id, 'schutzGefaehrder')
    for (const row of schutzPersonResult.data ?? []) bump(row.person_id, 'schutzPerson')
    setLinks(counts)
    const phones: Record<string, PhoneEntry> = {}
    for (const row of phoneResult.data ?? []) { if (row.person_id) phones[row.person_id] = { id: row.id, number: row.number, erhoben_am: row.erhoben_am } }
    setPhoneByPerson(phones)
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  if (!hasAreaAccess('zentrale') && eigeneBereicheHeute.size === 0) return <Navigate to="/" replace />

  function openNew() { setEditing(null); setForm({ ...emptyForm, phoneErhobenAm: todayLocal() }); setShowForm(true); setError('') }
  function openEdit(item: OperationalPerson) {
    setEditing(item)
    const phone = phoneByPerson[item.id]
    setForm({ vorname: item.vorname ?? '', nachname: item.nachname ?? '', birthDate: item.birth_date ?? '', phone: phone?.number ?? '', phoneErhobenAm: phone?.erhoben_am ?? todayLocal(), phoneNumberId: phone?.id ?? null, homeObjectId: item.home_object_id, note: item.note ?? '' })
    setShowForm(true); setError('')
  }

  async function save() {
    // Am Telefon ist oft zunächst nur Vor- oder Nachname bekannt - beide
    // einzeln optional, aber mindestens eines muss angegeben werden.
    if (!form.vorname.trim() && !form.nachname.trim()) { setError('Bitte Vor- oder Nachname eingeben.'); return }
    setSaving(true)
    const payload = { vorname: form.vorname.trim() || null, nachname: form.nachname.trim() || null, birth_date: form.birthDate || null, home_object_id: form.homeObjectId, note: form.note.trim() || null }
    const response = editing
      ? await supabase.from('operational_persons').update(payload).eq('id', editing.id).select('id').single()
      : await supabase.from('operational_persons').insert({ ...payload, created_by: profile?.id ?? null }).select('id').single()
    if (response.error || !response.data) { setSaving(false); setError('Person konnte nicht gespeichert werden.'); return }
    const personId = response.data.id
    // Telefonnummer lebt im gemeinsamen Register (operational_phone_numbers),
    // eine Person hat davon höchstens eine - hier direkt verwaltet statt über
    // eine eigene Auswahlkomponente.
    const number = form.phone.trim()
    const phoneResponse = number
      ? (form.phoneNumberId
        ? await supabase.from('operational_phone_numbers').update({ number, erhoben_am: form.phoneErhobenAm || todayLocal() }).eq('id', form.phoneNumberId)
        : await supabase.from('operational_phone_numbers').insert({ person_id: personId, number, erhoben_am: form.phoneErhobenAm || todayLocal(), created_by: profile?.id ?? null }))
      : (form.phoneNumberId ? await supabase.from('operational_phone_numbers').delete().eq('id', form.phoneNumberId) : { error: null })
    setSaving(false)
    if (phoneResponse.error) { setError('Person wurde gespeichert, die Telefonnummer konnte aber nicht gespeichert werden.'); await load(); return }
    logAudit(editing ? 'Person bearbeitet' : 'Person angelegt', personDisplayName(payload)); setShowForm(false); setNotice('Person wurde gespeichert.'); await load()
  }
  async function remove() {
    if (!editing) return
    const personId = editing.id
    // Gezielte exact-count-Abfragen statt der oben geladenen Bulk-Listen: die
    // Bulk-Listen laden ALLE person_id-Werte der Tabellen ohne Paginierung und
    // würden ab mehr Zeilen als das API-Seitenlimit stillschweigend
    // unvollständig - ein außerhalb der geladenen Seite liegender Hinweis
    // würde die Person fälschlich als unverknüpft erscheinen lassen. Ein
    // exact-count ist dagegen unabhängig von der Tabellengröße korrekt.
    const [noteCount, mailCount, avBvCount, fahndungCount, schutzGefaehrderCount, schutzPersonCount] = await Promise.all([
      supabase.from('operational_person_notes').select('id', { count: 'exact', head: true }).eq('person_id', personId),
      supabase.from('mail_deliveries').select('id', { count: 'exact', head: true }).eq('person_id', personId),
      supabase.from('zentrale_av_bv').select('id', { count: 'exact', head: true }).eq('person_id', personId),
      supabase.from('zentrale_fahndungen').select('id', { count: 'exact', head: true }).eq('person_id', personId),
      supabase.from('schutzfaelle').select('id', { count: 'exact', head: true }).eq('gefaehrder_id', personId),
      supabase.from('schutzfall_personen').select('person_id', { count: 'exact', head: true }).eq('person_id', personId),
    ])
    if (noteCount.error || mailCount.error || avBvCount.error || fahndungCount.error || schutzGefaehrderCount.error || schutzPersonCount.error) {
      setError('Verknüpfungen konnten nicht geprüft werden - Löschen abgebrochen.')
      return
    }
    const total = (noteCount.count ?? 0) + (mailCount.count ?? 0) + (avBvCount.count ?? 0) + (fahndungCount.count ?? 0) + (schutzGefaehrderCount.count ?? 0) + (schutzPersonCount.count ?? 0)
    if (total > 0) {
      const references = [
        (schutzGefaehrderCount.count ?? 0) > 0 || (schutzPersonCount.count ?? 0) > 0 ? 'Schutzmaßnahmen' : null,
        (noteCount.count ?? 0) > 0 ? 'Personenhinweise' : null,
        (mailCount.count ?? 0) > 0 ? 'RSa/RSb' : null,
        (avBvCount.count ?? 0) > 0 ? 'Altbestand AV/BV & EV' : null,
        (fahndungCount.count ?? 0) > 0 ? 'Fahndungen' : null,
      ].filter(Boolean).join(', ')
      setError(`Diese Person ist noch verknüpft mit: ${references}. Zum Schutz der Einsatzhistorie ist das endgültige Löschen gesperrt.`)
      return
    }
    if (!window.confirm(`Person „${personDisplayName(editing)}“ endgültig löschen?`)) return
    // IDs vorab merken: Der FK setzt person_id beim Löschen auf NULL. Die
    // Telefonnummern werden erst NACH erfolgreicher Personenlöschung entfernt,
    // damit bei einer Rechte- oder Datenbankblockade keine Telefonnummer verloren geht.
    const phoneRows = await supabase.from('operational_phone_numbers').select('id').eq('person_id', personId)
    if (phoneRows.error) { setError('Telefonnummern konnten nicht geprüft werden - Person wurde nicht gelöscht.'); return }
    const result = await supabase.from('operational_persons').delete().eq('id', personId).select('id').maybeSingle()
    if (result.error) { setError(`Person konnte nicht gelöscht werden: ${result.error.message}`); return }
    if (!result.data) { setError('Person wurde nicht gelöscht. Bitte Admin-Berechtigung und Benutzerstatus prüfen.'); return }
    const phoneIds = (phoneRows.data ?? []).map(row => row.id)
    let cleanupWarning = false
    if (phoneIds.length > 0) {
      const phoneDelete = await supabase.from('operational_phone_numbers').delete().in('id', phoneIds)
      cleanupWarning = Boolean(phoneDelete.error)
    }
    logAudit('Person endgültig gelöscht', personDisplayName(editing)); setShowForm(false); setNotice(cleanupWarning ? 'Person wurde gelöscht; verwaiste Telefonnummern konnten nicht vollständig bereinigt werden.' : 'Person wurde endgültig gelöscht.'); await load()
  }

  async function mergePersons() {
    if (!mergeItem || !mergeTargetId) { setMergeError('Bitte die zu übernehmende Person auswählen.'); return }
    setMergeSaving(true); setMergeError('')
    const result = await supabase.rpc('merge_operational_persons', { p_keep_id: mergeItem.id, p_remove_id: mergeTargetId })
    setMergeSaving(false)
    if (result.error) { setMergeError('Die Personen konnten nicht zusammengeführt werden.'); return }
    const removedName = personDisplayName(persons.find(person => person.id === mergeTargetId))
    logAudit('Personen zusammengeführt', `${removedName} → ${personDisplayName(mergeItem)}`)
    setMergeItem(null); setMergeTargetId(null); setNotice('Die Personen wurden zusammengeführt.'); await load()
  }

  return <div>
    <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" /> Zum Portal</Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Stammdaten &amp; Nachschlagewerke</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Personen</h1><p className="text-sm text-gray-500 mt-1">Zentrales Register - wird von Personenhinweisen, RSa/RSb, AV/BV & EV und Fahndungen als Verknüpfung genutzt.</p></div>
    {!canManage ? <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">Nur lesender Zugriff. Änderungen an diesen Stammdaten führt ausschließlich die Administration durch.</div> : null}
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
          const phone = phoneByPerson[item.id]
          return <article key={item.id} className="p-4 sm:p-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900">{personDisplayName(item)}</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                {item.birth_date ? <span>Geb.: {new Date(item.birth_date).toLocaleDateString('de-AT')}</span> : null}
                {phone ? <span>TEL: {phone.number} (erhoben {new Date(phone.erhoben_am).toLocaleDateString('de-AT')})</span> : null}
                {item.home_object ? <span>Anschrift: {objectLabel(item.home_object)}</span> : null}
              </div>
              {item.note ? <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-wrap">{item.note}</p> : null}
              {count ? <div className="flex flex-wrap gap-1.5 mt-2">
                {count.hinweise ? <span className="text-xs font-medium bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{count.hinweise}× Personenhinweis</span> : null}
                {count.rsaRsb ? <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{count.rsaRsb}× RSa/RSb</span> : null}
                {count.avBv ? <span className="text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{count.avBv}× AV/BV & EV</span> : null}
                {count.fahndungen ? <span className="text-xs font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{count.fahndungen}× Fahndung</span> : null}
                {count.schutzGefaehrder ? <span className="text-xs font-medium bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">{count.schutzGefaehrder}× Schutzfall (Gefährder)</span> : null}
                {count.schutzPerson ? <span className="text-xs font-medium bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">{count.schutzPerson}× Schutzfall (geschützte Person)</span> : null}
              </div> : null}
            </div>
            {canManage ? <div className="flex items-center gap-1 flex-shrink-0">
              <button type="button" onClick={() => { setMergeItem(item); setMergeTargetId(null); setMergeError('') }} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg" aria-label="Mit anderer Person zusammenführen"><Merge className="w-4 h-4" /></button>
              <button type="button" onClick={() => openEdit(item)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg" aria-label="Person bearbeiten"><Pencil className="w-4 h-4" /></button>
            </div> : null}
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
      <Field label="Geburtsdatum" type="date" value={form.birthDate} onChange={value => setForm(current => ({ ...current, birthDate: value }))} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Telefonnummer" value={form.phone} onChange={value => setForm(current => ({ ...current, phone: value }))} />
        <Field label="Erhoben am" type="date" value={form.phoneErhobenAm} onChange={value => setForm(current => ({ ...current, phoneErhobenAm: value }))} />
      </div>
      <ObjectPicker label="Anschrift" objects={objects} value={form.homeObjectId} onChange={value => setForm(current => ({ ...current, homeObjectId: value }))} createdBy={profile?.id ?? null} onCreated={object => setObjects(current => [...current, object].sort((a, b) => objectLabel(a).localeCompare(objectLabel(b))))} />
      <label className="block text-xs font-medium text-gray-600">Notiz<textarea className={`${inputClass} min-h-20 resize-y`} value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></label>
      {error ? <ErrorMessage text={error} /> : null}
      <div className="flex flex-wrap gap-3 pt-2">
        {editing && canManage ? <button type="button" disabled={saving} onClick={() => void remove()} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /> Endgültig löschen</button> : <span className="mr-auto" />}
        <button type="button" onClick={() => setShowForm(false)} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button>
        <button type="button" disabled={saving} onClick={() => void save()} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button>
      </div>
    </Modal> : null}
    {mergeItem ? <Modal title="Personen zusammenführen" close={() => setMergeItem(null)}>
      <p className="text-sm text-gray-600">Bleibt bestehen: <strong>{personDisplayName(mergeItem)}</strong>. Alle Verweise (Personenhinweise, RSa/RSb, AV/BV & EV, Fahndungen, Parteien in Einsätzen, Schutzmaßnahmen) der unten gewählten Person werden hierher umgehängt, fehlende Stammdaten übernommen, danach wird die gewählte Person endgültig gelöscht.</p>
      <label className="block text-xs font-medium text-gray-600">Wird entfernt und übernommen in „{personDisplayName(mergeItem)}“
        <select className={inputClass} value={mergeTargetId ?? ''} onChange={event => setMergeTargetId(event.target.value || null)}>
          <option value="">– Person wählen –</option>
          {persons.filter(person => person.id !== mergeItem.id).map(person => <option key={person.id} value={person.id}>{personLabel(person)}</option>)}
        </select>
      </label>
      {mergeError ? <ErrorMessage text={mergeError} /> : null}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={() => setMergeItem(null)} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button>
        <button type="button" disabled={mergeSaving || !mergeTargetId} onClick={() => void mergePersons()} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{mergeSaving ? 'Zusammenführen…' : 'Zusammenführen'}</button>
      </div>
    </Modal> : null}
  </div>
}
