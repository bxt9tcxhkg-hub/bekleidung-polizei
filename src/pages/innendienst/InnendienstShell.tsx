import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { PersonPicker } from '../../components/RegisterPickers'
import { composeObjectAddress, personDisplayName, usePersons } from '../../lib/register'
import { supabase } from '../../lib/supabase'
import type { CashDenominations, InnendienstGebuehrensatz, InnendienstGebuehrensatzPosition, InnendienstRecord, InnendienstRecordKind, InnendienstShiftTask, ZentraleEntry } from '../../lib/types'
import { EntryModal } from '../../components/ZentraleEntryEditor'
import { EMPTY_ENTRY_FORM, entryToForm, type EntryFormState } from '../../lib/zentraleEntries'
import { generateBescheidPdf, type BescheidKind } from '../../lib/innendienstBescheidPdf'
import { BESCHEID_KINDS, DENOMINATIONS, EMPTY_BESCHEID_FORM, KIND_LABEL, countedTotalCents, formatEuro, inputClass, todayLocal, type BescheidFormState } from './innendienstShared'

// Innendienst ist in eigenständige Sidebar-Seiten aufgeteilt (Übersicht,
// Bescheide & Verstöße, Schichtübergabe, Gebührenordnung - kein Tab-Streifen
// mehr, Vorlage ist Bekleidung). Diese Hülle bündelt weiterhin die
// gemeinsamen Daten/Handler (ein Laden für alle Seiten), rendert Kopfzeile
// und alle Modals, und reicht den Rest über den Outlet-Context durch.

export interface InnendienstContext {
  loading: boolean
  shift: 'tag' | 'nacht'
  ownTask: InnendienstShiftTask | null
  bescheide: InnendienstRecord[]
  violationsByBescheid: Map<string, InnendienstRecord[]>
  violationCountByPerson: Map<string, number>
  todaysBescheide: InnendienstRecord[]
  openViolations: InnendienstRecord[]
  handovers: ZentraleEntry[]
  canManageZentrale: boolean
  gebuehrensaetze: InnendienstGebuehrensatz[]
  openKasseWizard: () => void
  openNewBescheid: (kind: InnendienstRecordKind) => void
  openEditBescheid: (item: InnendienstRecord) => void
  openNewViolation: (bescheid?: InnendienstRecord) => void
  toggleStatus: (item: InnendienstRecord) => Promise<void>
  removeRecord: (item: InnendienstRecord) => Promise<void>
  printBescheid: (item: InnendienstRecord) => void
  openNewHandover: () => void
  openEditHandover: (item: ZentraleEntry) => void
}

export default function InnendienstShell() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const navigate = useNavigate()
  const canManageZentrale = isStrictAdmin || isGenehmiger || (operativeModeActive && (areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []).some(role => ['sachbearbeiter', 'admin'].includes(role)))
  const [shift, setShift] = useState<'tag' | 'nacht'>('tag')
  const [ownTask, setOwnTask] = useState<InnendienstShiftTask | null>(null)
  const [records, setRecords] = useState<InnendienstRecord[]>([])
  const [entries, setEntries] = useState<ZentraleEntry[]>([])
  const [gebuehrensaetze, setGebuehrensaetze] = useState<InnendienstGebuehrensatz[]>([])
  const [gebuehrensatzPositionen, setGebuehrensatzPositionen] = useState<InnendienstGebuehrensatzPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingBescheid, setEditingBescheid] = useState<InnendienstRecord | null>(null)
  const [form, setForm] = useState<BescheidFormState>(EMPTY_BESCHEID_FORM)
  const [showHandoverForm, setShowHandoverForm] = useState(false)
  const [editingHandover, setEditingHandover] = useState<ZentraleEntry | null>(null)
  const [handoverForm, setHandoverForm] = useState<EntryFormState>(EMPTY_ENTRY_FORM)
  const [handoverError, setHandoverError] = useState('')
  const [kasseStep, setKasseStep] = useState<'revenue' | 'count' | null>(null)
  const [expectedRevenueInput, setExpectedRevenueInput] = useState('')
  const [denomInputs, setDenomInputs] = useState<Record<string, string>>({})
  const { persons, setPersons } = usePersons()

  const userId = profile?.id
  const load = useCallback(async () => {
    setLoading(true)
    const today = todayLocal()
    const [recordResult, entryResult, gebuehrensatzResult, gebuehrensatzPositionResult] = await Promise.all([
      // home_object mit strukturierter Adresse zusätzlich geladen - für "whft. ..." im Bescheid-PDF.
      supabase.from('innendienst_records').select('*, person:operational_persons(id,vorname,nachname,birth_date,home_object:operational_objects(address,strasse,hausnummer,plz,ort)), gebuehrensatz:innendienst_gebuehrensaetze(id,name)').order('issued_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('zentrale_entries').select('*').order('updated_at', { ascending: false }),
      supabase.from('innendienst_gebuehrensaetze').select('*').eq('active', true).order('name'),
      supabase.from('innendienst_gebuehrensatz_positionen').select('*, position:innendienst_gebuehrenpositionen(id,name,betrag,active)'),
    ])
    const taskResult = userId ? await supabase.from('innendienst_shift_tasks').select('*').eq('user_id', userId).eq('duty_date', today).eq('shift', shift).maybeSingle() : null
    if (recordResult.error || entryResult.error) setError('Einige Informationen konnten nicht geladen werden.')
    else setError('')
    setOwnTask((taskResult?.data ?? null) as InnendienstShiftTask | null)
    setRecords((recordResult.data ?? []) as unknown as InnendienstRecord[])
    setEntries((entryResult.data ?? []) as ZentraleEntry[])
    setGebuehrensaetze(gebuehrensatzResult.error ? [] : (gebuehrensatzResult.data ?? []) as InnendienstGebuehrensatz[])
    setGebuehrensatzPositionen(gebuehrensatzPositionResult.error ? [] : (gebuehrensatzPositionResult.data ?? []) as unknown as InnendienstGebuehrensatzPosition[])
    setLoading(false)
  }, [userId, shift])
  useEffect(() => { void load() }, [load])

  const today = todayLocal()
  const bescheide = useMemo(() => records.filter(item => BESCHEID_KINDS.includes(item.kind)), [records])
  const violationsByBescheid = useMemo(() => {
    const map = new Map<string, InnendienstRecord[]>()
    for (const item of records) {
      if (item.kind !== 'verstoss' || !item.related_bescheid_id) continue
      const list = map.get(item.related_bescheid_id) ?? []
      list.push(item)
      map.set(item.related_bescheid_id, list)
    }
    return map
  }, [records])
  const violationCountByPerson = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of records) {
      if (item.kind !== 'verstoss' || !item.person_id) continue
      map.set(item.person_id, (map.get(item.person_id) ?? 0) + 1)
    }
    return map
  }, [records])
  const todaysBescheide = useMemo(() => bescheide.filter(item => item.issued_date === today), [bescheide, today])
  const openViolations = useMemo(() => records.filter(item => item.kind === 'verstoss' && item.status === 'offen'), [records])
  const handovers = useMemo(() => entries.filter(item => item.category === 'uebergabe' && item.status !== 'erledigt'), [entries])

  function openKasseWizard() {
    setExpectedRevenueInput(ownTask?.expected_revenue != null ? String(ownTask.expected_revenue) : '')
    const denoms = ownTask?.cash_denominations ?? {}
    setDenomInputs(Object.fromEntries(DENOMINATIONS.map(item => [String(item.cents), denoms[String(item.cents)] ? String(denoms[String(item.cents)]) : ''])))
    setKasseStep('revenue')
    setError('')
  }
  function closeKasseWizard() { setKasseStep(null) }
  function continueToCount() {
    const parsed = Number(expectedRevenueInput.replace(',', '.'))
    if (expectedRevenueInput.trim() === '' || Number.isNaN(parsed) || parsed < 0) { setError('Bitte den erwarteten Erlös laut Kasse als Zahl eingeben.'); return }
    setError('')
    setKasseStep('count')
  }
  const denomCountsParsed: CashDenominations = useMemo(() => Object.fromEntries(Object.entries(denomInputs).map(([cents, value]) => [cents, Number(value) || 0])), [denomInputs])
  const countedCents = useMemo(() => countedTotalCents(denomCountsParsed), [denomCountsParsed])
  const expectedRevenueParsed = Number(expectedRevenueInput.replace(',', '.')) || 0
  const expectedTotalCents = Math.round((ownTask?.float_amount ?? 500) * 100) + Math.round(expectedRevenueParsed * 100)
  const differenceCents = countedCents - expectedTotalCents

  async function saveKasse() {
    if (!profile?.id) return
    setSaving(true)
    const { error: upsertError } = await supabase.from('innendienst_shift_tasks').upsert(
      {
        user_id: profile.id, duty_date: today, shift, kasse_confirmed_at: new Date().toISOString(),
        expected_revenue: expectedRevenueParsed, cash_denominations: denomCountsParsed, counted_total: countedCents / 100,
      },
      { onConflict: 'user_id,duty_date,shift' },
    )
    setSaving(false)
    if (upsertError) { setError('Die Bestätigung konnte nicht gespeichert werden.'); return }
    setKasseStep(null)
    await load()
  }

  function openNewBescheid(kind: InnendienstRecordKind) { setEditingBescheid(null); setForm({ ...EMPTY_BESCHEID_FORM, kind }); setShowForm(true); setError('') }
  // Standplätze/Zeitfenster/Gebührensatz lassen sich nachträglich ergänzen
  // (z. B. wenn beim Erfassen noch nicht alles feststand) - dieselbe Maske
  // wie beim Anlegen, nur mit vorbefüllten Werten und Update statt Insert.
  function openEditBescheid(item: InnendienstRecord) {
    setEditingBescheid(item)
    setForm({
      kind: item.kind, personId: item.person_id, subject: item.subject, reference: item.reference ?? '', note: item.note ?? '', relatedBescheidId: '',
      standplaetze: item.standplaetze && item.standplaetze.length > 0 ? item.standplaetze : [''],
      zeitVon: item.zeit_von?.slice(0, 5) ?? '', zeitBis: item.zeit_bis?.slice(0, 5) ?? '',
      gebuehrensatzId: item.gebuehrensatz_id ?? '',
    })
    setShowForm(true); setError('')
  }
  function openNewViolation(bescheid?: InnendienstRecord) { setEditingBescheid(null); setForm({ ...EMPTY_BESCHEID_FORM, kind: 'verstoss', relatedBescheidId: bescheid?.id ?? '' }); setShowForm(true); setError('') }
  async function saveRecord() {
    if (!profile?.id) return
    setSaving(true)
    if (form.kind === 'verstoss') {
      // Ein Verstoß übernimmt die Person automatisch vom zugehörigen
      // Bescheid - subject bleibt hier die Freitext-Beschreibung des Vorfalls.
      if (!form.relatedBescheidId) { setSaving(false); setError('Bitte den Bescheid auswählen, gegen dessen Auflagen verstoßen wurde.'); return }
      if (!form.subject.trim()) { setSaving(false); setError('Bitte einen Betreff angeben.'); return }
      const relatedBescheid = bescheide.find(item => item.id === form.relatedBescheidId)
      const { error: insertError } = await supabase.from('innendienst_records').insert({
        kind: 'verstoss', subject: form.subject.trim(), note: form.note.trim() || null,
        related_bescheid_id: form.relatedBescheidId, person_id: relatedBescheid?.person_id ?? null, created_by: profile.id,
      })
      setSaving(false)
      if (insertError) { setError('Der Eintrag konnte nicht gespeichert werden.'); return }
    } else {
      // Ein Bescheid wird für eine Person ausgestellt - echte Verknüpfung
      // zum Personen-Register statt Namens-Freitext.
      if (!form.personId) { setSaving(false); setError('Bitte die Person auswählen, für die der Bescheid ausgestellt wird.'); return }
      const person = persons.find(item => item.id === form.personId)
      const standplaetze = form.standplaetze.map(item => item.trim()).filter(Boolean)
      const payload = {
        kind: form.kind, subject: person ? personDisplayName(person) : '', person_id: form.personId,
        reference: form.reference.trim() || null, note: form.note.trim() || null,
        standplaetze: standplaetze.length > 0 ? standplaetze : null,
        zeit_von: form.zeitVon || null, zeit_bis: form.zeitBis || null,
        gebuehrensatz_id: form.gebuehrensatzId || null,
      }
      const { error: saveError } = editingBescheid
        ? await supabase.from('innendienst_records').update(payload).eq('id', editingBescheid.id)
        : await supabase.from('innendienst_records').insert({ ...payload, created_by: profile.id })
      setSaving(false)
      if (saveError) { setError('Der Eintrag konnte nicht gespeichert werden.'); return }
    }
    setShowForm(false); setEditingBescheid(null); navigate('/innendienst/bescheide'); await load()
  }
  // Kostenaufstellung wird live aus dem verknüpften Gebührensatz gebildet
  // (keine gespeicherten Beträge, siehe Migration) - eine Position, die seit
  // Ausstellung deaktiviert wurde, taucht im PDF bewusst nicht mehr auf.
  function printBescheid(item: InnendienstRecord) {
    const positionen = gebuehrensatzPositionen
      .filter(row => row.gebuehrensatz_id === item.gebuehrensatz_id && row.position?.active !== false)
      .map(row => ({ name: row.position?.name ?? '–', betrag: row.position?.betrag ?? 0 }))
    const address = item.person?.home_object ? (composeObjectAddress(item.person.home_object) ?? item.person.home_object.address) : null
    generateBescheidPdf({
      kind: item.kind as BescheidKind,
      aktenzahl: item.reference,
      bearbeiterName: profile?.name ?? '',
      personName: item.person ? personDisplayName(item.person) : item.subject,
      personBirthDate: item.person?.birth_date ?? null,
      personAddress: address,
      standplaetze: item.standplaetze ?? [],
      zeitVon: item.zeit_von?.slice(0, 5) ?? null,
      zeitBis: item.zeit_bis?.slice(0, 5) ?? null,
      kostenPositionen: positionen,
      issuedDate: item.issued_date,
    })
  }
  async function toggleStatus(item: InnendienstRecord) {
    // "entzogen" wird ausschließlich automatisch beim Erfassen eines
    // Verstoßes gesetzt (DB-Trigger) - kein manuelles Umschalten hier,
    // sonst könnte ein Bescheid versehentlich wieder als "offen" gelten.
    if (item.status === 'entzogen') return
    const { error: updateError } = await supabase.from('innendienst_records').update({ status: item.status === 'offen' ? 'erledigt' : 'offen' }).eq('id', item.id)
    if (updateError) { setError('Der Status konnte nicht geändert werden.'); return }
    await load()
  }
  async function removeRecord(item: InnendienstRecord) {
    const hint = BESCHEID_KINDS.includes(item.kind) && (violationsByBescheid.get(item.id)?.length ?? 0) > 0 ? ' Damit werden auch die verknüpften Verstöße gelöscht.' : ''
    if (!window.confirm(`Eintrag „${item.subject}“ endgültig löschen?${hint}`)) return
    const { error: deleteError } = await supabase.from('innendienst_records').delete().eq('id', item.id)
    if (deleteError) { setError('Der Eintrag konnte nicht gelöscht werden.'); return }
    await load()
  }

  function openNewHandover() { setEditingHandover(null); setHandoverForm(EMPTY_ENTRY_FORM); setShowHandoverForm(true); setHandoverError('') }
  function openEditHandover(item: ZentraleEntry) { setEditingHandover(item); setHandoverForm(entryToForm(item)); setShowHandoverForm(true); setHandoverError('') }
  async function saveHandover() {
    if (!handoverForm.title.trim()) { setHandoverError('Bitte eine Bezeichnung eingeben.'); return }
    setSaving(true)
    const payload = { category: 'uebergabe' as const, title: handoverForm.title.trim(), description: handoverForm.description.trim() || null, priority: handoverForm.priority, status: handoverForm.status, valid_from: handoverForm.validFrom || null, valid_until: handoverForm.validUntil || null, location: handoverForm.location.trim() || null, responsible: handoverForm.responsible.trim() || null, reference: handoverForm.reference.trim() || null, restricted: handoverForm.restricted }
    const response = editingHandover ? await supabase.from('zentrale_entries').update(payload).eq('id', editingHandover.id) : await supabase.from('zentrale_entries').insert({ ...payload, created_by: profile?.id ?? null })
    setSaving(false)
    if (response.error) { setHandoverError('Übergabepunkt konnte nicht gespeichert werden.'); return }
    logAudit(editingHandover ? 'Schichtübergabe bearbeitet' : 'Schichtübergabe angelegt', handoverForm.title.trim()); setShowHandoverForm(false); await load()
  }
  async function deleteHandover() {
    if (!editingHandover || !window.confirm(`Übergabepunkt „${editingHandover.title}“ endgültig löschen?`)) return
    const result = await supabase.from('zentrale_entries').delete().eq('id', editingHandover.id)
    if (result.error) { setHandoverError('Übergabepunkt konnte nicht gelöscht werden.'); return }
    logAudit('Schichtübergabe endgültig gelöscht', editingHandover.title); setShowHandoverForm(false); await load()
  }

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  const ctx: InnendienstContext = {
    loading, shift, ownTask, bescheide, violationsByBescheid, violationCountByPerson, todaysBescheide, openViolations, handovers, canManageZentrale, gebuehrensaetze,
    openKasseWizard, openNewBescheid, openEditBescheid, openNewViolation, toggleStatus, removeRecord, printBescheid, openNewHandover, openEditHandover,
  }

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Innendienst</h1><p className="text-sm text-gray-500 mt-1">Unterstützung bei der täglichen Dienstabwicklung – als Ergänzung zum Aktenprogramm.</p></div><select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={shift} onChange={event => setShift(event.target.value as 'tag' | 'nacht')} aria-label="Schicht"><option value="tag">Tagdienst</option><option value="nacht">Nachtdienst</option></select></div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : <Outlet context={ctx} />}

    {showForm ? <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[94vh] overflow-y-auto"><div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 sm:px-6 py-4 border-b"><h2 className="font-bold text-gray-900">{form.kind === 'verstoss' ? 'Verstoß gegen Auflagen melden' : editingBescheid ? 'Bescheid bearbeiten' : 'Neuer Bescheid'}</h2><button type="button" onClick={() => { setShowForm(false); setEditingBescheid(null) }} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button></div><div className="px-5 sm:px-6 py-4 space-y-4">
      <label className="block text-xs font-medium text-gray-600">Art<select className={inputClass} disabled={!!editingBescheid} value={form.kind} onChange={event => setForm(current => ({ ...current, kind: event.target.value as InnendienstRecordKind, relatedBescheidId: event.target.value === 'verstoss' ? current.relatedBescheidId : '' }))}>{Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {form.kind === 'verstoss' ? <>
        <label className="block text-xs font-medium text-gray-600">Zugehöriger Bescheid *{bescheide.length === 0 ? <p className="mt-1 text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">Zuerst einen Bescheid erfassen – ein Verstoß bezieht sich immer auf dessen Auflagen.</p> : <select className={inputClass} value={form.relatedBescheidId} onChange={event => setForm(current => ({ ...current, relatedBescheidId: event.target.value }))}><option value="">Bitte wählen</option>{bescheide.map(item => <option key={item.id} value={item.id}>{KIND_LABEL[item.kind]} · {item.subject} ({new Date(item.issued_date).toLocaleDateString('de-AT')})</option>)}</select>}</label>
        <p className="text-xs text-gray-500 -mt-2">Der Bescheid wird beim Speichern automatisch entzogen.</p>
        <label className="block text-xs font-medium text-gray-600">Betreff des Verstoßes *<input className={inputClass} value={form.subject} onChange={event => setForm(current => ({ ...current, subject: event.target.value }))} /></label>
      </> : <>
        <PersonPicker label="Person, für die der Bescheid ausgestellt wird" persons={persons} value={form.personId} onChange={value => setForm(current => ({ ...current, personId: value }))} createdBy={profile?.id ?? null} onCreated={person => setPersons(current => [...current, person])} required />
        {form.personId && (violationCountByPerson.get(form.personId) ?? 0) > 0 ? <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">Diese Person hat bereits {violationCountByPerson.get(form.personId)} Verstoß/Verstöße erfasst.</p> : null}
        <label className="block text-xs font-medium text-gray-600">Bezug / Geschäftszahl (Aktenzahl)<input className={inputClass} value={form.reference} onChange={event => setForm(current => ({ ...current, reference: event.target.value }))} /></label>
        {/* Nur für den PDF-Export relevant (siehe lib/innendienstBescheidPdf.ts) - optional, ein Bescheid lässt sich auch ohne diese Angaben erfassen. */}
        <div className="rounded-xl border border-gray-200 p-3 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Für den PDF-Export (optional)</p>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Standplätze</p>
            {form.standplaetze.map((value, index) => <div key={index} className="flex items-center gap-2 mb-1.5">
              <input className={`${inputClass} mt-0`} value={value} placeholder={`Standplatz ${String.fromCharCode(97 + index)})`} onChange={event => setForm(current => ({ ...current, standplaetze: current.standplaetze.map((item, i) => i === index ? event.target.value : item) }))} />
              {form.standplaetze.length > 1 ? <button type="button" onClick={() => setForm(current => ({ ...current, standplaetze: current.standplaetze.filter((_, i) => i !== index) }))} className="p-2 text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0" aria-label="Standplatz entfernen"><Trash2 className="w-4 h-4" /></button> : null}
            </div>)}
            <button type="button" onClick={() => setForm(current => ({ ...current, standplaetze: [...current.standplaetze, ''] }))} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700"><Plus className="w-3.5 h-3.5" /> Weiterer Standplatz</button>
          </div>
          {form.kind === 'bescheid_strassenkunst' ? <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-600">Zeit von<input type="time" className={inputClass} value={form.zeitVon} onChange={event => setForm(current => ({ ...current, zeitVon: event.target.value }))} /></label>
            <label className="block text-xs font-medium text-gray-600">Zeit bis<input type="time" className={inputClass} value={form.zeitBis} onChange={event => setForm(current => ({ ...current, zeitBis: event.target.value }))} /></label>
          </div> : null}
          <label className="block text-xs font-medium text-gray-600">Gebührensatz (Kostenaufstellung im PDF)<select className={inputClass} value={form.gebuehrensatzId} onChange={event => setForm(current => ({ ...current, gebuehrensatzId: event.target.value }))}><option value="">Keiner</option>{gebuehrensaetze.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
      </>}
      <label className="block text-xs font-medium text-gray-600">Bemerkung<textarea className={`${inputClass} min-h-24 resize-y`} value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></label>
      {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
      <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => { setShowForm(false); setEditingBescheid(null) }} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button><button type="button" disabled={saving || (form.kind === 'verstoss' && bescheide.length === 0)} onClick={() => void saveRecord()} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button></div>
    </div></div></div> : null}

    {showHandoverForm ? <EntryModal entry={handoverForm} setEntry={setHandoverForm} editing={editingHandover} category="uebergabe" saving={saving} error={handoverError} close={() => setShowHandoverForm(false)} save={saveHandover} remove={deleteHandover} /> : null}

    {kasseStep ? <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[94vh] overflow-y-auto"><div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 sm:px-6 py-4 border-b"><h2 className="font-bold text-gray-900">Kassenabrechnung – {kasseStep === 'revenue' ? '1/2 Erlös' : '2/2 Stückelungen zählen'}</h2><button type="button" onClick={closeKasseWizard} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button></div><div className="px-5 sm:px-6 py-4 space-y-4">
      {kasseStep === 'revenue' ? <>
        <p className="text-sm text-gray-600">Grundbestand (Wechselgeld) der Kasse: <strong>{formatEuro(ownTask?.float_amount ?? 500)}</strong>. Zuerst den von der Kasse angezeigten erwarteten Erlös der Schicht eingeben.</p>
        <label className="block text-xs font-medium text-gray-600">Erwarteter Erlös laut Kasse (€) *<input inputMode="decimal" className={inputClass} value={expectedRevenueInput} onChange={event => setExpectedRevenueInput(event.target.value)} placeholder="z. B. 128,50" /></label>
        {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
        <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={closeKasseWizard} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button><button type="button" onClick={continueToCount} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg">Weiter zur Zählung</button></div>
      </> : <>
        <p className="text-sm text-gray-600">Bargeld nach Stückelung zählen. Grundbestand {formatEuro(ownTask?.float_amount ?? 500)} + Erlös {formatEuro(expectedRevenueParsed)} = erwartet <strong>{formatEuro(expectedTotalCents / 100)}</strong>.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">{DENOMINATIONS.map(item => <label key={item.cents} className="block text-xs font-medium text-gray-600">{item.label}<input type="number" inputMode="numeric" min={0} className={inputClass} value={denomInputs[String(item.cents)] ?? ''} onChange={event => setDenomInputs(current => ({ ...current, [String(item.cents)]: event.target.value }))} placeholder="0" /></label>)}</div>
        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 space-y-1"><div className="flex justify-between text-sm"><span className="text-gray-600">Gezählt</span><span className="font-semibold">{formatEuro(countedCents / 100)}</span></div><div className="flex justify-between text-sm"><span className="text-gray-600">Erwartet</span><span className="font-semibold">{formatEuro(expectedTotalCents / 100)}</span></div><div className={`flex justify-between text-sm font-bold ${differenceCents === 0 ? 'text-green-700' : 'text-red-700'}`}><span>Differenz</span><span>{differenceCents > 0 ? '+' : ''}{formatEuro(differenceCents / 100)}</span></div></div>
        {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
        <div className="flex justify-between gap-3 pt-2"><button type="button" onClick={() => setKasseStep('revenue')} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Zurück</button><button type="button" disabled={saving} onClick={() => void saveKasse()} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : 'Abrechnung bestätigen'}</button></div>
      </>}
    </div></div></div> : null}
  </div>
}
