import { useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { PersonPicker } from '../../components/RegisterPickers'
import { personDisplayName, usePersons } from '../../lib/register'
import { supabase } from '../../lib/supabase'
import type { CashDenominations, InnendienstGebuehrensatz, InnendienstGebuehrensatzPosition, InnendienstPersonEntscheidung, InnendienstPersonEntscheidungStatus, InnendienstRecord, InnendienstRecordKind, InnendienstShiftTask, Profile, ZentraleEntry } from '../../lib/types'
import { EntryModal } from '../../components/ZentraleEntryEditor'
import { EMPTY_ENTRY_FORM, entryToForm, type EntryFormState } from '../../lib/zentraleEntries'
import { generateBescheidPdf, type BescheidKind } from '../../lib/innendienstBescheidPdf'
import { officerPrintName } from '../../lib/printDocs'
import { BESCHEID_KINDS, DENOMINATIONS, EMPTY_BESCHEID_FORM, countedTotalCents, formatEuro, inputClass, todayLocal, type BescheidFormState } from './innendienstShared'
import { useOwnOperativBereicheToday } from '../../lib/dutyAccess'
import { operationalToday } from '../../lib/zentraleShared'

// Innendienst ist in eigenständige Sidebar-Seiten aufgeteilt (Übersicht,
// Bescheide & Verstöße, Schichtübergabe, Gebührenordnung - kein Tab-Streifen
// mehr, Vorlage ist Bekleidung). Diese Hülle bündelt weiterhin die
// gemeinsamen Daten/Handler (ein Laden für alle Seiten), rendert Kopfzeile
// und alle Modals, und reicht den Rest über den Outlet-Context durch.

export type InnendienstShiftTaskWithProfile = InnendienstShiftTask & { profile: Pick<Profile, 'id' | 'name'> | null }

export interface InnendienstContext {
  loading: boolean
  shift: 'tag' | 'nacht'
  ownTask: InnendienstShiftTask | null
  /** Bereits von anderen Personen für dieselbe Schicht bestätigte Kassenabrechnungen (Schichtübernahme). */
  otherConfirmedTasks: InnendienstShiftTaskWithProfile[]
  bescheide: InnendienstRecord[]
  violationsByBescheid: Map<string, InnendienstRecord[]>
  violationCountByPerson: Map<string, number>
  personEntscheidungen: Map<string, InnendienstPersonEntscheidung>
  todaysBescheide: InnendienstRecord[]
  handovers: ZentraleEntry[]
  canManageZentrale: boolean
  canDecideBescheide: boolean
  gebuehrensaetze: InnendienstGebuehrensatz[]
  openKasseWizard: () => void
  openNewBescheid: (kind: InnendienstRecordKind) => void
  openEditBescheid: (item: InnendienstRecord) => void
  setPersonEntscheidung: (personId: string, status: InnendienstPersonEntscheidungStatus) => Promise<void>
  printBescheid: (item: InnendienstRecord) => void
  openNewHandover: () => void
  openEditHandover: (item: ZentraleEntry) => void
}

export default function InnendienstShell() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const { bereiche: eigeneBereicheHeute } = useOwnOperativBereicheToday(profile?.id)
  const navigate = useNavigate()
  const canManageZentrale = isStrictAdmin || isGenehmiger || (areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []).some(role => ['sachbearbeiter', 'admin'].includes(role))
  const canDecideBescheide = isStrictAdmin || isGenehmiger
  const [shift, setShift] = useState<'tag' | 'nacht'>('tag')
  const [ownTask, setOwnTask] = useState<InnendienstShiftTask | null>(null)
  const [shiftTasksToday, setShiftTasksToday] = useState<InnendienstShiftTaskWithProfile[]>([])
  const [records, setRecords] = useState<InnendienstRecord[]>([])
  const [personEntscheidungenRows, setPersonEntscheidungenRows] = useState<InnendienstPersonEntscheidung[]>([])
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
    // operationalToday() statt todayLocal(): ein Nachtdienst, der z. B. um
    // 19:00 mit duty_date=gestern begonnen hat, läuft bis 8 Uhr unter dem
    // Vortag (siehe Migration 20260919000000/20260925052718) - sonst würde
    // eine Schichtübernahme kurz vor Dienstende die Kassenzeile der
    // laufenden Nacht unter dem falschen Kalendertag suchen.
    const dutyDate = operationalToday()
    const [recordResult, entryResult, gebuehrensatzResult, gebuehrensatzPositionResult, entscheidungResult] = await Promise.all([
      supabase.from('innendienst_records').select('*, person:operational_persons(id,vorname,nachname,birth_date), gebuehrensatz:innendienst_gebuehrensaetze(id,name)').order('issued_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('zentrale_entries').select('*').order('updated_at', { ascending: false }),
      supabase.from('innendienst_gebuehrensaetze').select('*').eq('active', true).order('name'),
      supabase.from('innendienst_gebuehrensatz_positionen').select('*, position:innendienst_gebuehrenpositionen(id,name,betrag,active)'),
      supabase.from('innendienst_person_entscheidungen').select('*'),
    ])
    // Ohne user_id-Filter, damit bei einer Schichtübernahme sichtbar ist, dass
    // die Kasse bereits von der/dem Vorgängerin/Vorgänger abgerechnet wurde
    // (RLS erlaubt zusätzlich zur eigenen Zeile das Lesen fremder Zeilen
    // exakt für duty_date+shift der eigenen Innendienst-Diensteinteilung,
    // siehe Migration 20260926120000).
    const taskResult = await supabase.from('innendienst_shift_tasks').select('*, profile:profiles!innendienst_shift_tasks_user_id_fkey(id,name)').eq('duty_date', dutyDate).eq('shift', shift)
    if (recordResult.error || entryResult.error) setError('Einige Informationen konnten nicht geladen werden.')
    else setError('')
    const tasksToday = (taskResult.data ?? []) as unknown as InnendienstShiftTaskWithProfile[]
    setShiftTasksToday(tasksToday)
    setOwnTask((tasksToday.find(item => item.user_id === userId) ?? null) as InnendienstShiftTask | null)
    setRecords((recordResult.data ?? []) as unknown as InnendienstRecord[])
    setEntries((entryResult.data ?? []) as ZentraleEntry[])
    setGebuehrensaetze(gebuehrensatzResult.error ? [] : (gebuehrensatzResult.data ?? []) as InnendienstGebuehrensatz[])
    setGebuehrensatzPositionen(gebuehrensatzPositionResult.error ? [] : (gebuehrensatzPositionResult.data ?? []) as unknown as InnendienstGebuehrensatzPosition[])
    setPersonEntscheidungenRows(entscheidungResult.error ? [] : (entscheidungResult.data ?? []) as InnendienstPersonEntscheidung[])
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
  const personEntscheidungen = useMemo(() => new Map(personEntscheidungenRows.map(item => [item.person_id, item])), [personEntscheidungenRows])
  const todaysBescheide = useMemo(() => bescheide.filter(item => item.issued_date === today), [bescheide, today])
  const handovers = useMemo(() => entries.filter(item => item.category === 'uebergabe' && item.status !== 'erledigt'), [entries])
  // expected_revenue != null wie im eigenen Zweig (Zeile mit
  // kasse_confirmed_at, aber ohne Kassensturz erfasst, gilt dort ebenfalls
  // als unvollständig) - sonst würde eine fremde unvollständige Zeile
  // fälschlich als "bereits abgerechnet" angezeigt.
  const otherConfirmedTasks = useMemo(() => shiftTasksToday.filter(item => item.user_id !== userId && item.kasse_confirmed_at && item.expected_revenue != null), [shiftTasksToday, userId])

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
        user_id: profile.id, duty_date: operationalToday(), shift, kasse_confirmed_at: new Date().toISOString(),
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
      zeitVon: item.zeit_von?.slice(0, 5) ?? '', zeitBis: item.zeit_bis?.slice(0, 5) ?? '',
      gebuehrensatzId: item.gebuehrensatz_id ?? '', planbeilage: true,
    })
    setShowForm(true); setError('')
  }
  async function saveRecord() {
    if (!profile?.id) return
    setSaving(true)
    if (!form.personId) { setSaving(false); setError('Bitte die Person auswählen, für die der Bescheid ausgestellt wird.'); return }
    const person = persons.find(item => item.id === form.personId)
    if (!person?.birth_date) { setSaving(false); setError('Für den Bescheid muss das Geburtsdatum der antragstellenden Person erfasst sein.'); return }
    const entscheidung = personEntscheidungen.get(form.personId)
    if (!editingBescheid && entscheidung?.status === 'gesperrt') { setSaving(false); setError('Für diese Person dürfen laut Kommandantenentscheidung keine weiteren Bescheide ausgestellt werden.'); return }
    if (!editingBescheid && entscheidung?.status === 'ruecksprache') { setSaving(false); setError('Vor einer Ausstellung ist laut Kommandantenentscheidung Rücksprache erforderlich.'); return }
    const payload = {
      kind: form.kind, subject: personDisplayName(person), person_id: form.personId,
      reference: form.reference.trim() || null, note: null,
      standplaetze: null,
      zeit_von: form.zeitVon || null, zeit_bis: form.zeitBis || null,
      gebuehrensatz_id: form.gebuehrensatzId || null,
      planbeilage: true,
    }
    const response = editingBescheid
      ? await supabase.from('innendienst_records').update(payload).eq('id', editingBescheid.id).select('id').maybeSingle()
      : await supabase.from('innendienst_records').insert({ ...payload, created_by: profile.id }).select('id').single()
    setSaving(false)
    if (response.error || !response.data) {
      setError(response.error?.message.includes('höchstens zwei') ? 'Pro Tag dürfen höchstens zwei Bescheide ausgestellt werden.' : 'Der Bescheid konnte nicht gespeichert werden.')
      return
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
    generateBescheidPdf({
      kind: item.kind as BescheidKind,
      aktenzahl: item.reference,
      bearbeiterName: officerPrintName(profile),
      personName: item.person ? personDisplayName(item.person) : item.subject,
      personBirthDate: item.person?.birth_date ?? null,
      zeitVon: item.zeit_von?.slice(0, 5) ?? null,
      zeitBis: item.zeit_bis?.slice(0, 5) ?? null,
      kostenPositionen: positionen,
      issuedDate: item.issued_date,
    })
  }
  async function setPersonEntscheidung(personId: string, status: InnendienstPersonEntscheidungStatus) {
    if (!profile?.id) return
    const response = await supabase.from('innendienst_person_entscheidungen').upsert({ person_id: personId, status, entschieden_von: profile.id, entschieden_am: new Date().toISOString() }, { onConflict: 'person_id' }).select('person_id').maybeSingle()
    if (response.error || !response.data) { setError('Die Entscheidung konnte nicht gespeichert werden.'); return }
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

  if (!hasAreaAccess('zentrale') && !isStrictAdmin && !eigeneBereicheHeute.has('innendienst')) return <Navigate to="/" replace />

  const ctx: InnendienstContext = {
    loading, shift, ownTask, otherConfirmedTasks, bescheide, violationsByBescheid, violationCountByPerson, personEntscheidungen, todaysBescheide, handovers, canManageZentrale, canDecideBescheide, gebuehrensaetze,
    openKasseWizard, openNewBescheid, openEditBescheid, setPersonEntscheidung, printBescheid, openNewHandover, openEditHandover,
  }

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Innendienst</h1><p className="text-sm text-gray-500 mt-1">Unterstützung bei der täglichen Dienstabwicklung – als Ergänzung zum Aktenprogramm.</p></div><select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={shift} onChange={event => setShift(event.target.value as 'tag' | 'nacht')} aria-label="Schicht"><option value="tag">Tagdienst</option><option value="nacht">Nachtdienst</option></select></div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : <Outlet context={ctx} />}

    {showForm ? <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[94vh] overflow-y-auto"><div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 sm:px-6 py-4 border-b"><h2 className="font-bold text-gray-900">{editingBescheid ? 'Bescheid bearbeiten' : 'Neuer Bescheid'}</h2><button type="button" onClick={() => { setShowForm(false); setEditingBescheid(null) }} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button></div><div className="px-5 sm:px-6 py-4 space-y-4">
      <label className="block text-xs font-medium text-gray-600">Art<select className={inputClass} disabled={!!editingBescheid} value={form.kind} onChange={event => setForm(current => ({ ...current, kind: event.target.value as InnendienstRecordKind }))}><option value="bescheid_strassenmusik">Bescheid Straßenmusik</option><option value="bescheid_strassenkunst">Bescheid Straßenkunst</option></select></label>
      <>
        <PersonPicker label="Person, für die der Bescheid ausgestellt wird" persons={persons} value={form.personId} onChange={value => setForm(current => ({ ...current, personId: value }))} createdBy={profile?.id ?? null} onCreated={person => setPersons(current => [...current, person])} required />
        {form.personId && (violationCountByPerson.get(form.personId) ?? 0) > 0 ? <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">Diese Person hat bereits {violationCountByPerson.get(form.personId)} Verstoß/Verstöße erfasst.</p> : null}
        {form.personId && personEntscheidungen.get(form.personId)?.status === 'gesperrt' ? <p className="text-sm font-semibold text-red-700 bg-red-50 px-3 py-2 rounded-lg">Keine weitere Ausstellung – Entscheidung des Kommandanten.</p> : null}
        {form.personId && personEntscheidungen.get(form.personId)?.status === 'ruecksprache' ? <p className="text-sm font-semibold text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">Vor der Ausstellung ist Rücksprache mit dem Kommandanten erforderlich.</p> : null}
        <label className="block text-xs font-medium text-gray-600">Bezug / Geschäftszahl (Aktenzahl)<input className={inputClass} value={form.reference} onChange={event => setForm(current => ({ ...current, reference: event.target.value }))} /></label>
        <div className="rounded-xl border border-gray-200 p-3 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Bescheiddaten</p>
          <p className="text-xs text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">Die Standplätze sind durch die Planbeilage festgelegt. Bei {form.kind === 'bescheid_strassenmusik' ? 'Straßenmusik wird immer das Luftbild' : 'Straßenkunst wird immer der Katasterplan'} als Bestandteil des Bescheides mitgedruckt.</p>
          {form.kind === 'bescheid_strassenkunst' ? <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-600">Zeit von<input type="time" className={inputClass} value={form.zeitVon} onChange={event => setForm(current => ({ ...current, zeitVon: event.target.value }))} /></label>
            <label className="block text-xs font-medium text-gray-600">Zeit bis<input type="time" className={inputClass} value={form.zeitBis} onChange={event => setForm(current => ({ ...current, zeitBis: event.target.value }))} /></label>
          </div> : null}
          <label className="block text-xs font-medium text-gray-600">Gebührensatz (Kostenaufstellung im PDF)<select className={inputClass} value={form.gebuehrensatzId} onChange={event => setForm(current => ({ ...current, gebuehrensatzId: event.target.value }))}><option value="">Keiner</option>{gebuehrensaetze.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
      </>
      {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
      <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => { setShowForm(false); setEditingBescheid(null) }} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button><button type="button" disabled={saving} onClick={() => void saveRecord()} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button></div>
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
