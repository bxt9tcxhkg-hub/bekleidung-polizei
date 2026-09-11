import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpen, CheckCircle2, ClipboardList, Coins, FileClock, Mail, Music, Palette, Plus, ShieldAlert, Trash2, X } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import PortalChrome from '../components/PortalChrome'
import MailDeliveries, { OwnerNotifications } from '../components/MailDeliveries'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { InnendienstRecord, InnendienstRecordKind, InnendienstShiftTask, ZentraleEntry } from '../lib/types'

type TabId = 'bescheide' | 'rsa_rsb' | 'unterlagen' | 'uebergabe'
const TABS: { id: TabId; label: string; icon: typeof BookOpen }[] = [
  { id: 'bescheide', label: 'Bescheide & Verstöße', icon: ClipboardList },
  { id: 'rsa_rsb', label: 'RSa/RSb', icon: Mail },
  { id: 'unterlagen', label: 'Formulare & Unterlagen', icon: BookOpen },
  { id: 'uebergabe', label: 'Schichtübergabe', icon: FileClock },
]
const KIND_LABEL: Record<InnendienstRecordKind, string> = { bescheid_strassenmusik: 'Bescheid Straßenmusik', bescheid_strassenkunst: 'Bescheid Straßenkunst', verstoss: 'Verstoß gegen Auflagen' }
const inputClass = 'mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500'

function todayLocal() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }

export default function Innendienst() {
  const { profile, hasAreaAccess } = useAuth()
  const [activeTab, setActiveTab] = useState<TabId>('bescheide')
  const [shift, setShift] = useState<'tag' | 'nacht'>('tag')
  const [ownTask, setOwnTask] = useState<InnendienstShiftTask | null>(null)
  const [records, setRecords] = useState<InnendienstRecord[]>([])
  const [entries, setEntries] = useState<ZentraleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ kind: 'bescheid_strassenmusik' as InnendienstRecordKind, subject: '', reference: '', note: '' })
  const [openRsaRsbCount, setOpenRsaRsbCount] = useState(0)

  const userId = profile?.id
  const load = useCallback(async () => {
    setLoading(true)
    const today = todayLocal()
    const [recordResult, entryResult, mailResult] = await Promise.all([
      supabase.from('innendienst_records').select('*, creator:profiles!innendienst_records_created_by_fkey(id,name,dienstnummer)').order('issued_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('zentrale_entries').select('*').order('updated_at', { ascending: false }),
      supabase.from('mail_deliveries').select('id', { count: 'exact', head: true }).in('status', ['offen', 'spaeter_erneut']),
    ])
    const taskResult = userId ? await supabase.from('innendienst_shift_tasks').select('*').eq('user_id', userId).eq('duty_date', today).eq('shift', shift).maybeSingle() : null
    if (recordResult.error || entryResult.error) setError('Einige Informationen konnten nicht geladen werden.')
    else setError('')
    setOwnTask((taskResult?.data ?? null) as InnendienstShiftTask | null)
    setRecords((recordResult.data ?? []) as unknown as InnendienstRecord[])
    setEntries((entryResult.data ?? []) as ZentraleEntry[])
    setOpenRsaRsbCount(mailResult.count ?? 0)
    setLoading(false)
  }, [userId, shift])
  useEffect(() => { void load() }, [load])

  const today = todayLocal()
  const todaysRecords = useMemo(() => records.filter(item => item.issued_date === today), [records, today])
  const openViolations = useMemo(() => records.filter(item => item.kind === 'verstoss' && item.status === 'offen'), [records])
  const handovers = useMemo(() => entries.filter(item => item.category === 'uebergabe' && item.status !== 'erledigt'), [entries])

  async function confirmKasse() {
    if (!profile?.id) return
    setSaving(true)
    const { error: upsertError } = await supabase.from('innendienst_shift_tasks').upsert(
      { user_id: profile.id, duty_date: today, shift, kasse_confirmed_at: new Date().toISOString() },
      { onConflict: 'user_id,duty_date,shift' },
    )
    setSaving(false)
    if (upsertError) { setError('Die Bestätigung konnte nicht gespeichert werden.'); return }
    await load()
  }

  function openNewRecord(kind: InnendienstRecordKind) { setForm({ kind, subject: '', reference: '', note: '' }); setShowForm(true); setError('') }
  async function saveRecord() {
    if (!profile?.id || !form.subject.trim()) { setError('Bitte einen Betreff angeben.'); return }
    setSaving(true)
    const { error: insertError } = await supabase.from('innendienst_records').insert({ kind: form.kind, subject: form.subject.trim(), reference: form.reference.trim() || null, note: form.note.trim() || null, created_by: profile.id })
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
    if (!window.confirm(`Eintrag „${item.subject}“ endgültig löschen?`)) return
    const { error: deleteError } = await supabase.from('innendienst_records').delete().eq('id', item.id)
    if (deleteError) { setError('Der Eintrag konnte nicht gelöscht werden.'); return }
    await load()
  }

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  return <PortalChrome wide>
    <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-5"><ArrowLeft className="w-4 h-4" /> Zurück zum Portal</Link>
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5"><div><p className="text-xs font-bold uppercase tracking-wider text-red-700">Operativer Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Innendienst</h1><p className="text-sm text-gray-500 mt-1">Unterstützung bei der täglichen Dienstabwicklung – als Ergänzung zum Aktenprogramm.</p></div><select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={shift} onChange={event => setShift(event.target.value as 'tag' | 'nacht')} aria-label="Schicht"><option value="tag">Tagdienst</option><option value="nacht">Nachtdienst</option></select></div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-700" /></div> : null}

    {!loading ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-bold text-gray-900 flex items-center gap-2"><Coins className="w-4 h-4 text-red-700" /> Kasse bei Schichtbeginn</h2>{ownTask?.kasse_confirmed_at ? <div className="mt-2 rounded-xl bg-green-50 border border-green-200 text-green-800 px-4 py-3 flex items-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4" /> Abgerechnet um {new Date(ownTask.kasse_confirmed_at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}</div> : <div className="mt-2"><p className="text-sm text-gray-500 mb-2">Noch nicht bestätigt.</p><button type="button" disabled={saving} onClick={() => void confirmKasse()} className="bg-red-700 hover:bg-red-800 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60">Kasse abgerechnet – bestätigen</button></div>}</section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-bold text-gray-900 flex items-center gap-2"><Mail className="w-4 h-4 text-red-700" /> RSa/RSb</h2><p className="text-sm text-gray-700 mt-2">{openRsaRsbCount} offene Sendung{openRsaRsbCount === 1 ? '' : 'en'}.</p><button type="button" onClick={() => setActiveTab('rsa_rsb')} className="text-sm font-semibold text-red-700 mt-2">Übersicht öffnen →</button>{profile?.id ? <div className="mt-3"><OwnerNotifications userId={profile.id} /></div> : null}</section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><h2 className="font-bold text-gray-900 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-red-700" /> Bescheide heute</h2></div><div className="grid grid-cols-2 gap-2 mt-2"><Stat icon={Music} label="Straßenmusik" value={todaysRecords.filter(item => item.kind === 'bescheid_strassenmusik').length} /><Stat icon={Palette} label="Straßenkunst" value={todaysRecords.filter(item => item.kind === 'bescheid_strassenkunst').length} /></div><div className="flex flex-wrap gap-2 mt-3"><button type="button" onClick={() => openNewRecord('bescheid_strassenmusik')} className="inline-flex items-center gap-1.5 text-xs font-medium border border-gray-300 px-3 py-1.5 rounded-lg"><Plus className="w-3.5 h-3.5" /> Straßenmusik</button><button type="button" onClick={() => openNewRecord('bescheid_strassenkunst')} className="inline-flex items-center gap-1.5 text-xs font-medium border border-gray-300 px-3 py-1.5 rounded-lg"><Plus className="w-3.5 h-3.5" /> Straßenkunst</button></div></section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-bold text-gray-900 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-red-700" /> Verstöße & Übergabe</h2><p className="text-sm text-gray-700 mt-2">{openViolations.length} offene{openViolations.length === 1 ? 'r' : ''} Verstoß{openViolations.length === 1 ? '' : 'e'} gegen Auflagen.</p><button type="button" onClick={() => openNewRecord('verstoss')} className="inline-flex items-center gap-1.5 text-xs font-medium border border-gray-300 px-3 py-1.5 rounded-lg mt-2"><Plus className="w-3.5 h-3.5" /> Verstoß erfassen</button>{handovers.length > 0 ? <div className="mt-3 space-y-1.5">{handovers.slice(0, 3).map(item => <p key={item.id} className="text-sm text-gray-700">• {item.title}</p>)}</div> : null}</section>
    </div> : null}

    <nav className="flex gap-1.5 overflow-x-auto pb-2 mb-5" aria-label="Bereiche des Innendienstes">{TABS.map(tab => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex items-center gap-2 whitespace-nowrap border px-3 py-2 rounded-xl text-sm font-medium ${activeTab === tab.id ? 'bg-red-50 border-red-300 text-red-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}><Icon className="w-4 h-4" />{tab.label}</button> })}</nav>

    {!loading && activeTab === 'bescheide' ? <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden"><div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3"><h2 className="font-bold text-gray-900">Bescheide & Verstöße</h2><button type="button" onClick={() => openNewRecord('bescheid_strassenmusik')} className="inline-flex items-center gap-2 bg-red-700 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Eintrag</button></div>{records.length === 0 ? <Empty text="Noch keine Einträge vorhanden." /> : <div className="divide-y divide-gray-100">{records.map(item => <article key={item.id} className="p-4 sm:p-5 flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{KIND_LABEL[item.kind]}</span><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.status === 'offen' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>{item.status === 'offen' ? 'Offen' : 'Erledigt'}</span><span className="text-xs text-gray-400">{new Date(item.issued_date).toLocaleDateString('de-AT')}</span></div><h3 className="font-semibold text-gray-900 mt-1.5">{item.subject}</h3>{item.reference ? <p className="text-xs text-gray-500 mt-0.5">Bezug: {item.reference}</p> : null}{item.note ? <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.note}</p> : null}</div><div className="flex gap-1 flex-shrink-0"><button type="button" onClick={() => void toggleStatus(item)} className="text-xs font-medium text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg">{item.status === 'offen' ? 'Erledigt' : 'Wieder öffnen'}</button><button type="button" onClick={() => void removeRecord(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Eintrag löschen"><Trash2 className="w-4 h-4" /></button></div></article>)}</div>}</section> : null}

    {!loading && activeTab === 'rsa_rsb' ? <MailDeliveries /> : null}
    {!loading && activeTab === 'unterlagen' ? (entries.filter(item => item.category === 'unterlage').length === 0 ? <Empty text="Keine Unterlagen vorhanden." /> : <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">{entries.filter(item => item.category === 'unterlage').map(item => <article key={item.id} className="p-4 sm:p-5"><h3 className="font-semibold text-gray-900">{item.title}</h3>{item.description ? <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.description}</p> : null}</article>)}</div>) : null}
    {!loading && activeTab === 'uebergabe' ? (handovers.length === 0 ? <Empty text="Keine offenen Übergabepunkte." /> : <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">{handovers.map(item => <article key={item.id} className="p-4 sm:p-5"><h3 className="font-semibold text-gray-900">{item.title}</h3>{item.description ? <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.description}</p> : null}</article>)}</div>) : null}

    {showForm ? <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[94vh] overflow-y-auto"><div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 sm:px-6 py-4 border-b"><h2 className="font-bold text-gray-900">Neuer Eintrag</h2><button type="button" onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button></div><div className="px-5 sm:px-6 py-4 space-y-4">
      <label className="block text-xs font-medium text-gray-600">Art<select className={inputClass} value={form.kind} onChange={event => setForm(current => ({ ...current, kind: event.target.value as InnendienstRecordKind }))}>{Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-xs font-medium text-gray-600">Betreff *<input className={inputClass} value={form.subject} onChange={event => setForm(current => ({ ...current, subject: event.target.value }))} /></label>
      <label className="block text-xs font-medium text-gray-600">Bezug / Geschäftszahl<input className={inputClass} value={form.reference} onChange={event => setForm(current => ({ ...current, reference: event.target.value }))} /></label>
      <label className="block text-xs font-medium text-gray-600">Bemerkung<textarea className={`${inputClass} min-h-24 resize-y`} value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></label>
      {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
      <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setShowForm(false)} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button><button type="button" disabled={saving} onClick={() => void saveRecord()} className="bg-red-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button></div>
    </div></div></div> : null}
  </PortalChrome>
}

function Stat({ icon: Icon, label, value }: { icon: typeof Music; label: string; value: number }) { return <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2.5"><Icon className="w-4 h-4 text-gray-400 mb-1" /><p className="text-xs text-gray-500">{label}</p><p className="text-lg font-bold text-gray-900">{value}</p></div> }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"><CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{text}</p></div> }
