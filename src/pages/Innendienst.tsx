import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, CheckCircle2, ClipboardList, Coins, FileClock, Mail, Music, Palette, Pencil, Plus, Receipt, ShieldAlert, Trash2, X } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import MailDeliveries, { OwnerNotifications } from '../components/MailDeliveries'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import type { CashDenominations, InnendienstRecord, InnendienstRecordKind, InnendienstShiftTask, ZentraleEntry, ZentraleUnterlage } from '../lib/types'
import { EntryModal } from '../components/ZentraleEntryEditor'
import { EMPTY_ENTRY_FORM, entryToForm, type EntryFormState } from '../lib/zentraleEntries'
import InnendienstGebuehrenPanel from './innendienst/InnendienstGebuehren'

// Euro-Stückelungen in Cent (Ganzzahlen statt Fließkomma, um Rundungsfehler zu vermeiden).
const DENOMINATIONS: { cents: number; label: string }[] = [
  { cents: 20000, label: '200 €' }, { cents: 10000, label: '100 €' },
  { cents: 5000, label: '50 €' }, { cents: 2000, label: '20 €' }, { cents: 1000, label: '10 €' }, { cents: 500, label: '5 €' },
  { cents: 200, label: '2 €' }, { cents: 100, label: '1 €' },
  { cents: 50, label: '50 Cent' }, { cents: 20, label: '20 Cent' }, { cents: 10, label: '10 Cent' },
  { cents: 5, label: '5 Cent' }, { cents: 2, label: '2 Cent' }, { cents: 1, label: '1 Cent' },
]
const EURO_FORMAT = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' })
function formatEuro(value: number) { return EURO_FORMAT.format(value) }
function countedTotalCents(denominations: CashDenominations) {
  return DENOMINATIONS.reduce((sum, item) => sum + item.cents * (denominations[String(item.cents)] ?? 0), 0)
}

type TabId = 'bescheide' | 'rsa_rsb' | 'unterlagen' | 'uebergabe' | 'gebuehren'
const TABS: { id: TabId; label: string; icon: typeof BookOpen }[] = [
  { id: 'bescheide', label: 'Bescheide & Verstöße', icon: ClipboardList },
  { id: 'rsa_rsb', label: 'RSa/RSb', icon: Mail },
  { id: 'unterlagen', label: 'Formulare & Unterlagen', icon: BookOpen },
  { id: 'uebergabe', label: 'Schichtübergabe', icon: FileClock },
  { id: 'gebuehren', label: 'Gebührenordnung', icon: Receipt },
]
const KIND_LABEL: Record<InnendienstRecordKind, string> = { bescheid_strassenmusik: 'Bescheid Straßenmusik', bescheid_strassenkunst: 'Bescheid Straßenkunst', verstoss: 'Verstoß gegen Auflagen' }
const BESCHEID_KINDS: InnendienstRecordKind[] = ['bescheid_strassenmusik', 'bescheid_strassenkunst']
const inputClass = 'mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function todayLocal() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }

export default function Innendienst() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const canManageZentrale = isStrictAdmin || isGenehmiger || (areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []).some(role => ['sachbearbeiter', 'admin'].includes(role))
  const [activeTab, setActiveTab] = useState<TabId>('bescheide')
  const [shift, setShift] = useState<'tag' | 'nacht'>('tag')
  const [ownTask, setOwnTask] = useState<InnendienstShiftTask | null>(null)
  const [records, setRecords] = useState<InnendienstRecord[]>([])
  const [entries, setEntries] = useState<ZentraleEntry[]>([])
  const [unterlagen, setUnterlagen] = useState<ZentraleUnterlage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ kind: 'bescheid_strassenmusik' as InnendienstRecordKind, subject: '', reference: '', note: '', relatedBescheidId: '' })
  const [showHandoverForm, setShowHandoverForm] = useState(false)
  const [editingHandover, setEditingHandover] = useState<ZentraleEntry | null>(null)
  const [handoverForm, setHandoverForm] = useState<EntryFormState>(EMPTY_ENTRY_FORM)
  const [handoverError, setHandoverError] = useState('')
  const [openRsaRsbCount, setOpenRsaRsbCount] = useState(0)
  const [kasseStep, setKasseStep] = useState<'revenue' | 'count' | null>(null)
  const [expectedRevenueInput, setExpectedRevenueInput] = useState('')
  const [denomInputs, setDenomInputs] = useState<Record<string, string>>({})

  const userId = profile?.id
  const load = useCallback(async () => {
    setLoading(true)
    const today = todayLocal()
    const [recordResult, entryResult, mailResult, unterlageResult] = await Promise.all([
      supabase.from('innendienst_records').select('*').order('issued_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('zentrale_entries').select('*').order('updated_at', { ascending: false }),
      supabase.from('mail_deliveries').select('id', { count: 'exact', head: true }).in('status', ['offen', 'spaeter_erneut']),
      supabase.from('zentrale_unterlagen').select('*').order('titel'),
    ])
    const taskResult = userId ? await supabase.from('innendienst_shift_tasks').select('*').eq('user_id', userId).eq('duty_date', today).eq('shift', shift).maybeSingle() : null
    if (recordResult.error || entryResult.error) setError('Einige Informationen konnten nicht geladen werden.')
    else setError('')
    setOwnTask((taskResult?.data ?? null) as InnendienstShiftTask | null)
    setRecords((recordResult.data ?? []) as unknown as InnendienstRecord[])
    setEntries((entryResult.data ?? []) as ZentraleEntry[])
    setUnterlagen(unterlageResult.error ? [] : (unterlageResult.data ?? []) as ZentraleUnterlage[])
    setOpenRsaRsbCount(mailResult.count ?? 0)
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

  function openNewBescheid(kind: InnendienstRecordKind) { setForm({ kind, subject: '', reference: '', note: '', relatedBescheidId: '' }); setShowForm(true); setError('') }
  function openNewViolation(bescheid?: InnendienstRecord) { setForm({ kind: 'verstoss', subject: '', reference: '', note: '', relatedBescheidId: bescheid?.id ?? '' }); setShowForm(true); setError('') }
  async function saveRecord() {
    if (!profile?.id || !form.subject.trim()) { setError('Bitte einen Betreff angeben.'); return }
    if (form.kind === 'verstoss' && !form.relatedBescheidId) { setError('Bitte den Bescheid auswählen, gegen dessen Auflagen verstoßen wurde.'); return }
    setSaving(true)
    const { error: insertError } = await supabase.from('innendienst_records').insert({
      kind: form.kind, subject: form.subject.trim(), reference: form.reference.trim() || null, note: form.note.trim() || null,
      related_bescheid_id: form.kind === 'verstoss' ? form.relatedBescheidId : null, created_by: profile.id,
    })
    setSaving(false)
    if (insertError) { setError('Der Eintrag konnte nicht gespeichert werden.'); return }
    setShowForm(false); setActiveTab('bescheide'); await load()
  }
  async function toggleStatus(item: InnendienstRecord) {
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

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Innendienst</h1><p className="text-sm text-gray-500 mt-1">Unterstützung bei der täglichen Dienstabwicklung – als Ergänzung zum Aktenprogramm.</p></div><select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={shift} onChange={event => setShift(event.target.value as 'tag' | 'nacht')} aria-label="Schicht"><option value="tag">Tagdienst</option><option value="nacht">Nachtdienst</option></select></div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : null}

    {!loading ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-bold text-gray-900 flex items-center gap-2"><Coins className="w-4 h-4 text-blue-700" /> Kassenabrechnung</h2><p className="text-xs text-gray-500 mt-0.5">Grundbestand {formatEuro(ownTask?.float_amount ?? 500)} · erst Erlös laut Kasse, dann Stückelungen zählen.</p>
        {ownTask?.kasse_confirmed_at && ownTask.expected_revenue != null ? <div className="mt-2 space-y-1.5"><div className="rounded-xl bg-green-50 border border-green-200 text-green-800 px-4 py-3 flex items-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Abgerechnet um {new Date(ownTask.kasse_confirmed_at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}</div>
          <dl className="text-sm grid grid-cols-2 gap-x-3 gap-y-1 px-1"><dt className="text-gray-500">Erlös lt. Kasse</dt><dd className="text-right font-medium">{formatEuro(ownTask.expected_revenue)}</dd><dt className="text-gray-500">Gezählt</dt><dd className="text-right font-medium">{formatEuro(ownTask.counted_total ?? 0)}</dd><dt className="text-gray-500">Differenz</dt><dd className={`text-right font-bold ${Math.round(((ownTask.counted_total ?? 0) - ownTask.float_amount - ownTask.expected_revenue) * 100) === 0 ? 'text-green-700' : 'text-red-700'}`}>{formatEuro((ownTask.counted_total ?? 0) - ownTask.float_amount - ownTask.expected_revenue)}</dd></dl>
          <button type="button" onClick={openKasseWizard} className="text-xs font-semibold text-blue-700 mt-1">Erneut abrechnen</button>
        </div> : <div className="mt-2"><p className="text-sm text-gray-500 mb-2">{ownTask?.kasse_confirmed_at ? 'Bestätigt, aber ohne Kassensturz erfasst – bitte nachholen.' : 'Noch nicht bestätigt.'}</p><button type="button" onClick={openKasseWizard} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2 rounded-lg">Kasse abrechnen</button></div>}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-bold text-gray-900 flex items-center gap-2"><Mail className="w-4 h-4 text-blue-700" /> RSa/RSb</h2><p className="text-sm text-gray-700 mt-2">{openRsaRsbCount} offene Sendung{openRsaRsbCount === 1 ? '' : 'en'}.</p><button type="button" onClick={() => setActiveTab('rsa_rsb')} className="text-sm font-semibold text-blue-700 mt-2">Übersicht öffnen →</button>{profile?.id ? <div className="mt-3"><OwnerNotifications userId={profile.id} /></div> : null}</section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><h2 className="font-bold text-gray-900 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-blue-700" /> Bescheide heute</h2></div><div className="grid grid-cols-2 gap-2 mt-2"><Stat icon={Music} label="Straßenmusik" value={todaysBescheide.filter(item => item.kind === 'bescheid_strassenmusik').length} /><Stat icon={Palette} label="Straßenkunst" value={todaysBescheide.filter(item => item.kind === 'bescheid_strassenkunst').length} /></div><div className="flex flex-wrap gap-2 mt-3"><button type="button" onClick={() => openNewBescheid('bescheid_strassenmusik')} className="inline-flex items-center gap-1.5 text-xs font-medium border border-gray-300 px-3 py-1.5 rounded-lg"><Plus className="w-3.5 h-3.5" /> Straßenmusik</button><button type="button" onClick={() => openNewBescheid('bescheid_strassenkunst')} className="inline-flex items-center gap-1.5 text-xs font-medium border border-gray-300 px-3 py-1.5 rounded-lg"><Plus className="w-3.5 h-3.5" /> Straßenkunst</button></div></section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-bold text-gray-900 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-blue-700" /> Verstöße & Übergabe</h2><p className="text-sm text-gray-700 mt-2">{openViolations.length} offene{openViolations.length === 1 ? 'r' : ''} Verstoß{openViolations.length === 1 ? '' : 'e'} gegen Auflagen eines Bescheids.</p>{bescheide.length === 0 ? <p className="text-xs text-gray-400 mt-1">Verstöße lassen sich erst nach dem ersten Bescheid erfassen.</p> : <button type="button" onClick={() => openNewViolation()} className="inline-flex items-center gap-1.5 text-xs font-medium border border-gray-300 px-3 py-1.5 rounded-lg mt-2"><Plus className="w-3.5 h-3.5" /> Verstoß melden</button>}{handovers.length > 0 ? <div className="mt-3 space-y-1.5">{handovers.slice(0, 3).map(item => <p key={item.id} className="text-sm text-gray-700">• {item.title}</p>)}</div> : null}</section>
    </div> : null}

    <nav className="flex gap-1.5 overflow-x-auto pb-2 mb-5" aria-label="Bereiche des Innendienstes">{TABS.map(tab => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex items-center gap-2 whitespace-nowrap border px-3 py-2 rounded-xl text-sm font-medium ${activeTab === tab.id ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}><Icon className="w-4 h-4" />{tab.label}</button> })}</nav>

    {!loading && activeTab === 'bescheide' ? <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden"><div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3"><h2 className="font-bold text-gray-900">Bescheide & Verstöße</h2><button type="button" onClick={() => openNewBescheid('bescheid_strassenmusik')} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Bescheid</button></div>{bescheide.length === 0 ? <Empty text="Noch keine Bescheide erfasst." /> : <div className="divide-y divide-gray-100">{bescheide.map(bescheid => {
      const violations = violationsByBescheid.get(bescheid.id) ?? []
      return <article key={bescheid.id} className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{KIND_LABEL[bescheid.kind]}</span><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bescheid.status === 'offen' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>{bescheid.status === 'offen' ? 'Offen' : 'Erledigt'}</span><span className="text-xs text-gray-400">{new Date(bescheid.issued_date).toLocaleDateString('de-AT')}</span></div><h3 className="font-semibold text-gray-900 mt-1.5">{bescheid.subject}</h3>{bescheid.reference ? <p className="text-xs text-gray-500 mt-0.5">Bezug: {bescheid.reference}</p> : null}{bescheid.note ? <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{bescheid.note}</p> : null}</div><div className="flex gap-1 flex-shrink-0"><button type="button" onClick={() => void toggleStatus(bescheid)} className="text-xs font-medium text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg">{bescheid.status === 'offen' ? 'Erledigt' : 'Wieder öffnen'}</button><button type="button" onClick={() => void removeRecord(bescheid)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Bescheid löschen"><Trash2 className="w-4 h-4" /></button></div></div>

        <div className="mt-3 pl-3 border-l-2 border-gray-200 space-y-2">{violations.map(violation => <div key={violation.id} className="flex items-start justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-red-700">Verstoß</span><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${violation.status === 'offen' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>{violation.status === 'offen' ? 'Offen' : 'Erledigt'}</span></div><p className="text-sm text-gray-800 mt-1">{violation.subject}</p>{violation.note ? <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">{violation.note}</p> : null}</div><div className="flex gap-1 flex-shrink-0"><button type="button" onClick={() => void toggleStatus(violation)} className="text-xs font-medium text-gray-600 border border-gray-300 px-2 py-1 rounded-lg">{violation.status === 'offen' ? 'Erledigt' : 'Öffnen'}</button><button type="button" onClick={() => void removeRecord(violation)} className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg" aria-label="Verstoß löschen"><Trash2 className="w-3.5 h-3.5" /></button></div></div>)}
          <button type="button" onClick={() => openNewViolation(bescheid)} className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700"><Plus className="w-3.5 h-3.5" /> Verstoß zu diesem Bescheid melden</button>
        </div>
      </article>
    })}</div>}</section> : null}

    {!loading && activeTab === 'rsa_rsb' ? <MailDeliveries /> : null}
    {!loading && activeTab === 'unterlagen' ? (unterlagen.length === 0 ? <Empty text="Keine Unterlagen vorhanden." /> : <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">{unterlagen.map(item => <article key={item.id} className="p-4 sm:p-5"><h3 className="font-semibold text-gray-900">{item.titel}</h3>{item.fundort ? <p className="text-sm text-gray-600 mt-1">{item.fundort}</p> : null}{item.note ? <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.note}</p> : null}</article>)}</div>) : null}
    {!loading && activeTab === 'uebergabe' ? <div>
      {canManageZentrale ? <div className="mb-3 flex justify-end"><button type="button" onClick={openNewHandover} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Übergabepunkt</button></div> : null}
      {handovers.length === 0 ? <Empty text="Keine offenen Übergabepunkte." /> : <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">{handovers.map(item => <article key={item.id} className="p-4 sm:p-5 flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold text-gray-900">{item.title}</h3>{item.description ? <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.description}</p> : null}</div>{canManageZentrale ? <button type="button" onClick={() => openEditHandover(item)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex-shrink-0" aria-label="Übergabepunkt bearbeiten"><Pencil className="w-4 h-4" /></button> : null}</article>)}</div>}
    </div> : null}
    {!loading && activeTab === 'gebuehren' ? <InnendienstGebuehrenPanel isGenehmiger={isGenehmiger} /> : null}

    {showForm ? <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[94vh] overflow-y-auto"><div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 sm:px-6 py-4 border-b"><h2 className="font-bold text-gray-900">{form.kind === 'verstoss' ? 'Verstoß gegen Auflagen melden' : 'Neuer Bescheid'}</h2><button type="button" onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button></div><div className="px-5 sm:px-6 py-4 space-y-4">
      <label className="block text-xs font-medium text-gray-600">Art<select className={inputClass} value={form.kind} onChange={event => setForm(current => ({ ...current, kind: event.target.value as InnendienstRecordKind, relatedBescheidId: event.target.value === 'verstoss' ? current.relatedBescheidId : '' }))}>{Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {form.kind === 'verstoss' ? <label className="block text-xs font-medium text-gray-600">Zugehöriger Bescheid *{bescheide.length === 0 ? <p className="mt-1 text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">Zuerst einen Bescheid erfassen – ein Verstoß bezieht sich immer auf dessen Auflagen.</p> : <select className={inputClass} value={form.relatedBescheidId} onChange={event => setForm(current => ({ ...current, relatedBescheidId: event.target.value }))}><option value="">Bitte wählen</option>{bescheide.map(item => <option key={item.id} value={item.id}>{KIND_LABEL[item.kind]} · {item.subject} ({new Date(item.issued_date).toLocaleDateString('de-AT')})</option>)}</select>}</label> : null}
      <label className="block text-xs font-medium text-gray-600">{form.kind === 'verstoss' ? 'Betreff des Verstoßes *' : 'Betreff *'}<input className={inputClass} value={form.subject} onChange={event => setForm(current => ({ ...current, subject: event.target.value }))} /></label>
      {form.kind !== 'verstoss' ? <label className="block text-xs font-medium text-gray-600">Bezug / Geschäftszahl<input className={inputClass} value={form.reference} onChange={event => setForm(current => ({ ...current, reference: event.target.value }))} /></label> : null}
      <label className="block text-xs font-medium text-gray-600">Bemerkung<textarea className={`${inputClass} min-h-24 resize-y`} value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></label>
      {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
      <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setShowForm(false)} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button><button type="button" disabled={saving || (form.kind === 'verstoss' && bescheide.length === 0)} onClick={() => void saveRecord()} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button></div>
    </div></div></div> : null}

    {showHandoverForm ? <EntryModal entry={handoverForm} setEntry={setHandoverForm} editing={editingHandover} saving={saving} error={handoverError} close={() => setShowHandoverForm(false)} save={saveHandover} remove={deleteHandover} /> : null}

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

function Stat({ icon: Icon, label, value }: { icon: typeof Music; label: string; value: number }) { return <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2.5"><Icon className="w-4 h-4 text-gray-400 mb-1" /><p className="text-xs text-gray-500">{label}</p><p className="text-lg font-bold text-gray-900">{value}</p></div> }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"><CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{text}</p></div> }
