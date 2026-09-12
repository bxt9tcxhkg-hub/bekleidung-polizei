import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { AlertTriangle, BriefcaseBusiness, CheckCircle2, LayoutDashboard, MapPin, Plus, Radio, Trash2, UsersRound } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import type { DutyAssignment, DutyFunctionConfig, DutyShift, IncidentDisposition, IncidentReport, OperationalPersonNote, OperationalPersonNoteCategory, ZentraleEntry, ZentraleEntryCategory } from '../lib/types'
import { Actions, Area, Empty, EntryList, EntryModal, ErrorMessage, Field, Modal, inputClass } from '../components/ZentraleEntryEditor'
import { EMPTY_ENTRY_FORM, entryToForm, type EntryFormState } from '../lib/zentraleEntries'
import ZentraleStrassenzustand from './zentrale/ZentraleStrassenzustand'

// Auf der Zentrale-Hauptseite bleiben nur die Bereiche, die den Zentralisten
// im Tagesgeschäft unmittelbar betreffen. AV/BV & EV, Personenhinweise,
// Fahndungen, RSa/RSb, Schlüssel, Kontakte, Alarmierung und Unterlagen sind
// eigenständige Seiten in der Sidebar (siehe ZentraleLayout). Kontrollaufträge
// betreffen nur die Streifen (JD/VD) und werden dort im Außendienst verwaltet.
type TabId = 'uebersicht' | 'einsaetze' | 'lage' | 'uebergabe' | 'strassenzustand'
const TABS: { id: TabId; label: string; icon: typeof Radio; description: string }[] = [
  { id: 'uebersicht', label: 'Übersicht', icon: LayoutDashboard, description: 'Besetzung, offene Meldungen und relevante Informationen' },
  { id: 'einsaetze', label: 'Einsätze', icon: Radio, description: 'Meldungen schnell erfassen und disponieren' },
  { id: 'lage', label: 'Operative Lage', icon: Radio, description: 'Ereignisse, Sperren, Gefahren- und Lagehinweise' },
  { id: 'uebergabe', label: 'Schichtübergabe', icon: BriefcaseBusiness, description: 'Offene Punkte und Informationen für die Folgeschicht' },
  { id: 'strassenzustand', label: 'Straßenzustand', icon: MapPin, description: 'Bericht erfassen, prüfen und als PDF versenden' },
]
const DISPOSITION_LABEL: Record<IncidentDisposition, string> = { jd: 'JD fährt an', vd: 'VD fährt an', bp: 'An Bundespolizei (BP) weitergegeben', keine_anfahrt: 'Keine Anfahrt erforderlich' }
const PERSON_NOTE_LABEL: Record<OperationalPersonNoteCategory, string> = { infektionsschutz: 'Infektionsschutz', aggressiv: 'Aggressives Verhalten', waffenverbot: 'Waffenverbot', fluchtgefahr: 'Fluchtgefahr', suizidgefahr: 'Suizidgefahr', sonstiges: 'Sonstiger Sicherheitshinweis' }
// Wohin ein Klick auf einen "Sofort wichtig"-Eintrag führt, dessen Kategorie
// jetzt eine eigene Sidebar-Seite ist statt eines Tabs auf dieser Seite.
const CATEGORY_ROUTE: Partial<Record<ZentraleEntryCategory, string>> = { verbot: '/zentrale/av-bv-ev', fahndung: '/zentrale/fahndungen', brief: '/zentrale/rsa-rsb', schluessel: '/zentrale/schluessel', kontakt: '/zentrale/kontakte', alarmierung: '/zentrale/alarmierung', unterlage: '/zentrale/unterlagen' }

function todayLocal() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function normalizeText(value: string | null | undefined) { return (value ?? '').toLocaleLowerCase('de-AT').replace(/straße/g, 'strasse').replace(/str\./g, 'strasse').replace(/[^a-z0-9äöüß]+/g, ' ').trim() }
function normalizePhone(value: string | null | undefined) { return (value ?? '').replace(/\D/g, '') }
function formatTime(value: string) { return new Date(value).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) }

export default function Zentrale() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const navigate = useNavigate()
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManage = isStrictAdmin || isGenehmiger || roles.some(role => ['sachbearbeiter', 'admin'].includes(role))
  const [activeTab, setActiveTab] = useState<TabId>('uebersicht')
  const [entries, setEntries] = useState<ZentraleEntry[]>([])
  const [assignments, setAssignments] = useState<DutyAssignment[]>([])
  const [dutyFunctions, setDutyFunctions] = useState<DutyFunctionConfig[]>([])
  const [incidents, setIncidents] = useState<IncidentReport[]>([])
  const [personNotes, setPersonNotes] = useState<OperationalPersonNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [editing, setEditing] = useState<ZentraleEntry | null>(null)
  const [entry, setEntry] = useState<EntryFormState>(EMPTY_ENTRY_FORM)
  const [dutyShift, setDutyShift] = useState<DutyShift>('tag')
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [incident, setIncident] = useState({ callerPhone: '', callerName: '', location: '', summary: '', involvedPerson: '', involvedBirthDate: '', disposition: 'jd' as IncidentDisposition, note: '' })

  const ownAssignment = assignments.find(item => item.user_id === profile?.id && item.duty_date === todayLocal())
  const canOperateZentrale = canManage || ownAssignment?.function === 'zentrale'

  const load = useCallback(async () => {
    setLoading(true)
    const today = todayLocal()
    // Kontrollaufträge betreffen nur die Streifen (JD/VD) und werden hier
    // bewusst nicht geladen – weder für die Tabs noch für "Sofort wichtig".
    const [entryResult, dutyResult, functionResult, incidentResult, personResult] = await Promise.all([
      supabase.from('zentrale_entries').select('*').neq('category', 'kontrollauftrag').order('priority').order('updated_at', { ascending: false }),
      supabase.from('duty_assignments').select('*, profiles(id,name,dienstnummer), fleet_vehicles(id,name,call_sign,license_plate)').eq('duty_date', today).order('function'),
      supabase.from('duty_functions').select('*').eq('active', true).order('sort_order').order('label'),
      supabase.from('incident_reports').select('*').gte('reported_at', `${today}T00:00:00`).order('reported_at', { ascending: false }),
      supabase.from('operational_person_notes').select('*').eq('active', true).order('updated_at', { ascending: false }),
    ])
    if (entryResult.error || dutyResult.error || incidentResult.error) setError('Die Informationen der Zentrale konnten nicht vollständig geladen werden.')
    else setError('')
    setEntries((entryResult.data ?? []) as ZentraleEntry[])
    setAssignments((dutyResult.data ?? []) as unknown as DutyAssignment[])
    setDutyFunctions((functionResult.data ?? []) as DutyFunctionConfig[])
    setIncidents((incidentResult.data ?? []) as IncidentReport[])
    setPersonNotes(personResult.error ? [] : (personResult.data ?? []) as OperationalPersonNote[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (ownAssignment) setDutyShift(ownAssignment.shift) }, [ownAssignment])

  const currentTab = TABS.find(tab => tab.id === activeTab) ?? TABS[0]
  const visibleEntries = useMemo(() => entries.filter(item => item.category === activeTab), [activeTab, entries])
  const criticalEntries = useMemo(() => entries.filter(item => item.status !== 'erledigt' && item.priority === 'kritisch'), [entries])
  const shiftAssignments = assignments.filter(item => item.shift === dutyShift)
  const vdAvailable = shiftAssignments.some(item => item.function === 'vd')
  const visibleIncidents = useMemo(() => {
    if (ownAssignment?.function === 'jd') return incidents.filter(item => item.disposition === 'jd')
    if (ownAssignment?.function === 'vd') return incidents.filter(item => item.disposition === 'vd')
    if (ownAssignment?.function === 'innendienst') return incidents.filter(item => item.disposition === 'keine_anfahrt')
    return incidents
  }, [incidents, ownAssignment?.function])
  const contextEntries = useMemo(() => {
    const place = normalizeText(incident.location), phone = normalizePhone(incident.callerPhone), name = normalizeText(incident.callerName)
    if (!place && !phone && name.length < 3) return []
    return entries.filter(item => { const itemLocation = normalizeText(item.location); return item.status !== 'erledigt' && ((place.length >= 4 && itemLocation.length >= 4 && (itemLocation.includes(place) || place.includes(itemLocation))) || (phone.length >= 5 && normalizePhone(item.reference).includes(phone)) || (name.length >= 3 && normalizeText(`${item.title} ${item.responsible ?? ''}`).includes(name))) })
  }, [entries, incident.callerName, incident.callerPhone, incident.location])
  const contextPersonNotes = useMemo(() => {
    const names = [normalizeText(incident.callerName), normalizeText(incident.involvedPerson)].filter(value => value.length >= 3), phone = normalizePhone(incident.callerPhone)
    return personNotes.filter(item => (phone.length >= 5 && normalizePhone(item.phone) === phone) || (names.includes(normalizeText(item.person_name)) && (!item.birth_date || item.birth_date === incident.involvedBirthDate)))
  }, [incident.callerName, incident.callerPhone, incident.involvedBirthDate, incident.involvedPerson, personNotes])

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  function openNewEntry() {
    const fallback: ZentraleEntryCategory = activeTab === 'lage' || activeTab === 'uebergabe' ? activeTab : 'lage'
    setEditing(null); setEntry(EMPTY_ENTRY_FORM); setActiveTab(fallback); setShowEntryForm(true); setError('')
  }
  function openEdit(item: ZentraleEntry) { setEditing(item); setEntry(entryToForm(item)); setShowEntryForm(true); setError('') }

  async function saveEntry() {
    if (!entry.title.trim()) { setError('Bitte eine Bezeichnung eingeben.'); return }
    const category = (editing?.category ?? activeTab) as ZentraleEntryCategory
    setSaving(true)
    const payload = { category, title: entry.title.trim(), description: entry.description.trim() || null, priority: entry.priority, status: entry.status, valid_from: entry.validFrom || null, valid_until: entry.validUntil || null, location: entry.location.trim() || null, responsible: entry.responsible.trim() || null, reference: entry.reference.trim() || null, restricted: entry.restricted }
    const response = editing ? await supabase.from('zentrale_entries').update(payload).eq('id', editing.id) : await supabase.from('zentrale_entries').insert({ ...payload, created_by: profile?.id ?? null })
    setSaving(false)
    if (response.error) { setError('Eintrag konnte nicht gespeichert werden.'); return }
    logAudit(editing ? 'Zentraleintrag bearbeitet' : 'Zentraleintrag angelegt', `${TABS.find(tab => tab.id === category)?.label ?? category} · ${entry.title.trim()}`); setShowEntryForm(false); setNotice('Eintrag wurde gespeichert.'); await load()
  }
  async function deleteEntry() { if (!editing || !window.confirm(`Eintrag „${editing.title}“ endgültig löschen?`)) return; const result = await supabase.from('zentrale_entries').delete().eq('id', editing.id); if (result.error) { setError('Eintrag konnte nicht gelöscht werden.'); return } logAudit('Zentraleintrag endgültig gelöscht', editing.title); setShowEntryForm(false); setNotice('Eintrag wurde endgültig gelöscht.'); await load() }

  function openIncident() { setIncident({ callerPhone: '', callerName: '', location: '', summary: '', involvedPerson: '', involvedBirthDate: '', disposition: vdAvailable ? 'vd' : 'jd', note: '' }); setShowIncidentForm(true); setError('') }
  async function saveIncident() {
    if (!profile?.id || !incident.summary.trim()) { setError('Bitte einen kurzen Sachverhalt eingeben.'); return }
    setSaving(true); const result = await supabase.from('incident_reports').insert({ caller_phone: incident.callerPhone.trim() || null, caller_name: incident.callerName.trim() || null, location: incident.location.trim() || null, summary: incident.summary.trim(), involved_person: incident.involvedPerson.trim() || null, involved_birth_date: incident.involvedBirthDate || null, disposition: incident.disposition, note: incident.note.trim() || null, status: incident.disposition === 'bp' ? 'weitergegeben' : 'offen', created_by: profile.id }); setSaving(false)
    if (result.error) { setError('Die Meldung konnte nicht gespeichert werden. Bitte heutige Funktion „Zentrale“ wählen.'); return }
    logAudit('Einsatzmeldung angelegt', `${DISPOSITION_LABEL[incident.disposition]} · ${incident.location.trim() || 'ohne Ortsangabe'}`); setShowIncidentForm(false); setActiveTab('einsaetze'); setNotice('Meldung wurde gespeichert.'); await load()
  }
  async function completeIncident(item: IncidentReport) { const result = await supabase.from('incident_reports').update({ status: 'erledigt' }).eq('id', item.id); if (result.error) { setError('Die Meldung konnte nicht abgeschlossen werden.'); return } setNotice('Meldung wurde als erledigt markiert.'); await load() }
  async function deleteIncident(item: IncidentReport) { if (!window.confirm('Diese Einsatzmeldung endgültig löschen?')) return; const result = await supabase.from('incident_reports').delete().eq('id', item.id); if (result.error) { setError('Die Einsatzmeldung konnte nicht gelöscht werden.'); return } logAudit('Einsatzmeldung endgültig gelöscht', item.location ?? item.summary.slice(0, 80)); await load() }

  const incidentCards = <div className="space-y-3">{visibleIncidents.length === 0
    ? <Empty text="Heute wurden noch keine Meldungen erfasst." />
    : visibleIncidents.map(item => <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-gray-900">{formatTime(item.reported_at)}</span><span className={`text-xs font-semibold px-2 py-1 rounded-full ${item.status === 'weitergegeben' ? 'bg-blue-100 text-blue-800' : item.status === 'erledigt' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{item.status === 'weitergegeben' ? 'An BP weitergegeben' : item.status === 'erledigt' ? 'Erledigt' : 'Offen'}</span></div><p className="font-semibold text-gray-900 mt-2">{item.location || 'Ohne Ortsangabe'}</p><p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{item.summary}</p><div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-3">{item.caller_phone ? <span>TEL: {item.caller_phone}</span> : null}{item.caller_name ? <span>Melder: {item.caller_name}</span> : null}<span>{DISPOSITION_LABEL[item.disposition]}</span>{item.note ? <span>Bemerkung: {item.note}</span> : null}</div></div><div className="flex gap-2">{canOperateZentrale && item.status === 'offen' ? <button type="button" onClick={() => void completeIncident(item)} className="text-xs font-medium text-green-700 border border-green-200 px-3 py-2 rounded-lg">Erledigt</button> : null}{canManage ? <button type="button" onClick={() => void deleteIncident(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Einsatzmeldung löschen"><Trash2 className="w-4 h-4" /></button> : null}</div></div></article>)}</div>

  return <div>
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Zentrale</h1><p className="text-sm text-gray-500 mt-1">Relevante Informationen auf einen Blick – ergänzend zum Aktenprogramm.</p></div>{canOperateZentrale ? <button type="button" onClick={openIncident} className="inline-flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Neue Meldung</button> : null}</div>
    <nav className="flex gap-1.5 overflow-x-auto pb-2 mb-5" aria-label="Bereiche der Zentrale">{TABS.map(tab => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => { setActiveTab(tab.id); setNotice('') }} className={`inline-flex items-center gap-2 whitespace-nowrap border px-3 py-2 rounded-xl text-sm font-medium ${activeTab === tab.id ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}><Icon className="w-4 h-4" />{tab.label}</button> })}</nav>
    {error && !showEntryForm && !showIncidentForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : null}

    {!loading && activeTab === 'uebersicht' ? <div className="space-y-6">
      <SofortWichtig entries={criticalEntries} onOpen={item => {
        if (item.category === 'lage' || item.category === 'uebergabe') { setActiveTab(item.category); openEdit(item) }
        else { const route = CATEGORY_ROUTE[item.category]; if (route) navigate(route) }
      }} />
      <div className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Heute relevant</h2>
        <DutyPanel assignments={shiftAssignments} functions={dutyFunctions} dutyShift={dutyShift} setDutyShift={setDutyShift} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Stat label="Kritische Hinweise" value={criticalEntries.length} color="red" /><Stat label="Offene Übergaben" value={entries.filter(item => item.category === 'uebergabe' && item.status !== 'erledigt').length} color="amber" /></div>
        <section><div className="flex items-center justify-between mb-3"><h2 className="font-bold text-gray-900">Heutige Meldungen</h2>{canOperateZentrale ? <button type="button" onClick={openIncident} className="text-sm font-semibold text-blue-700">Meldung erfassen</button> : null}</div>{incidentCards}</section>
      </div>
      <div><h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Informativ – bei Bedarf</h2><p className="text-sm text-gray-500">Weitere Bereiche (AV/BV & EV, Personenhinweise, Fahndungen, RSa/RSb, Schlüssel, Kontakte, Alarmierung, Unterlagen …) über die Seitenleiste.</p></div>
    </div> : null}

    {!loading && activeTab === 'einsaetze' ? <section><div className="flex items-center justify-between gap-3 mb-3"><div><h2 className="font-bold text-gray-900">Einsätze</h2><p className="text-sm text-gray-500">Kurze interne Koordination, keine Aktenbearbeitung.</p></div>{canOperateZentrale ? <button type="button" onClick={openIncident} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Neue Meldung</button> : null}</div>{incidentCards}</section> : null}

    {!loading && activeTab === 'strassenzustand' ? <ZentraleStrassenzustand canManage={canManage} /> : null}

    {!loading && (activeTab === 'lage' || activeTab === 'uebergabe') ? <EntryList title={currentTab.label} description={currentTab.description} entries={visibleEntries} canManage={canManage} openNew={openNewEntry} openEdit={openEdit} /> : null}

    {showIncidentForm ? <IncidentModal incident={incident} setIncident={setIncident} vdAvailable={vdAvailable} contextEntries={contextEntries} contextPersonNotes={contextPersonNotes} saving={saving} error={error} close={() => setShowIncidentForm(false)} save={saveIncident} /> : null}
    {showEntryForm ? <EntryModal entry={entry} setEntry={setEntry} editing={editing} saving={saving} error={error} close={() => setShowEntryForm(false)} save={saveEntry} remove={deleteEntry} /> : null}
  </div>
}

function DutyPanel({ assignments, functions, dutyShift, setDutyShift }: { assignments: DutyAssignment[]; functions: DutyFunctionConfig[]; dutyShift: DutyShift; setDutyShift: (value: DutyShift) => void }) {
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><UsersRound className="w-5 h-5 text-blue-700" /><h2 className="font-bold text-gray-900">Heutige Besetzung</h2></div><p className="text-sm text-gray-500 mt-1">Die eigene Funktion wird direkt im Portal ausgewählt.</p></div><select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={dutyShift} onChange={event => setDutyShift(event.target.value as DutyShift)}><option value="tag">Tagdienst</option><option value="nacht">Nachtdienst</option></select></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">{functions.map(fn => { const assigned = assignments.filter(item => item.function === fn.code); const vehicleNames = [...new Set(assigned.map(item => item.fleet_vehicles?.call_sign || item.fleet_vehicles?.name).filter(Boolean))]; return <div key={fn.code} className="rounded-xl bg-gray-50 border border-gray-200 p-3"><p className="text-xs font-semibold text-gray-500">{fn.label}</p><p className="font-bold text-gray-900 mt-1">{assigned.length}{fn.standard_staffing !== null ? ` / ${fn.standard_staffing}` : ''}</p><p className="text-xs text-gray-500 mt-1 truncate">{assigned.map(item => item.profiles?.name).filter(Boolean).join(', ') || 'nicht eingetragen'}</p>{fn.is_patrol && vehicleNames.length ? <p className="text-xs font-semibold text-blue-700 mt-1 truncate">Fahrzeug: {vehicleNames.join(', ')}</p> : null}</div> })}</div></section>
}

function Stat({ label, value, color }: { label: string; value: number; color: 'red' | 'blue' | 'amber' }) { const classes = { red: 'border-red-200 bg-red-50 text-red-900', blue: 'border-blue-200 bg-blue-50 text-blue-900', amber: 'border-amber-200 bg-amber-50 text-amber-900' }[color]; return <div className={`rounded-xl border p-4 ${classes}`}><p className="text-xs font-medium">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></div> }

// Ebene 1 der Übersicht: erfordert jetzt Aufmerksamkeit – direkt hervorgehoben, unabhängig von der Funktion.
function SofortWichtig({ entries, onOpen }: { entries: ZentraleEntry[]; onOpen: (item: ZentraleEntry) => void }) {
  if (entries.length === 0) return <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2 text-sm text-green-800"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Keine dringenden Punkte offen.</div>
  return <section><h2 className="text-xs font-bold uppercase tracking-wider text-red-700 mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Sofort wichtig</h2><div className="space-y-2">{entries.map(item => <button key={item.id} type="button" onClick={() => onOpen(item)} className="w-full text-left rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 hover:bg-red-100"><p className="font-bold text-red-900">{item.title}</p>{item.description ? <p className="text-sm text-red-800 mt-0.5 line-clamp-2">{item.description}</p> : null}</button>)}</div></section>
}

function IncidentModal({ incident, setIncident, vdAvailable, contextEntries, contextPersonNotes, saving, error, close, save }: { incident: { callerPhone: string; callerName: string; location: string; summary: string; involvedPerson: string; involvedBirthDate: string; disposition: IncidentDisposition; note: string }; setIncident: Dispatch<SetStateAction<typeof incident>>; vdAvailable: boolean; contextEntries: ZentraleEntry[]; contextPersonNotes: OperationalPersonNote[]; saving: boolean; error: string; close: () => void; save: () => Promise<void> }) {
  const patch = (values: Partial<typeof incident>) => setIncident(current => ({ ...current, ...values }))
  return <Modal title="Neue Meldung" close={close}><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="TEL-Nr. des Melders" value={incident.callerPhone} onChange={value => patch({ callerPhone: value })} /><Field label="Name des Melders" value={incident.callerName} onChange={value => patch({ callerName: value })} /></div><div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700"><span className="font-medium">Meldezeit:</span> {new Date().toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}</div><Field label="Einsatzort" value={incident.location} onChange={value => patch({ location: value })} /><Area label="Kurzer Sachverhalt *" value={incident.summary} onChange={value => patch({ summary: value })} /><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="Beteiligte Person" value={incident.involvedPerson} onChange={value => patch({ involvedPerson: value })} /><Field label="Geburtsdatum zur eindeutigen Zuordnung" type="date" value={incident.involvedBirthDate} onChange={value => patch({ involvedBirthDate: value })} /></div><ContextHints entries={contextEntries} personNotes={contextPersonNotes} /><label className="block text-xs font-medium text-gray-600">Behandlung der Meldung<select className={inputClass} value={incident.disposition} onChange={event => patch({ disposition: event.target.value as IncidentDisposition })}><option value="jd">JD fährt an</option>{vdAvailable ? <option value="vd">VD fährt an</option> : null}<option value="bp">An Bundespolizei (BP) weitergegeben</option><option value="keine_anfahrt">Keine Anfahrt erforderlich</option></select></label><Area label="Optionale Bemerkung" value={incident.note} onChange={value => patch({ note: value })} />{error ? <ErrorMessage text={error} /> : null}<Actions saving={saving} close={close} save={save} /></Modal>
}

function ContextHints({ entries, personNotes }: { entries: ZentraleEntry[]; personNotes: OperationalPersonNote[] }) {
  if (entries.length === 0 && personNotes.length === 0) return null
  return <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><h3 className="font-bold text-blue-900">Relevante Hinweise gefunden</h3><p className="text-xs text-blue-700 mt-0.5">Automatisch zusammengetragen – die operative Bewertung bleibt beim Zentralisten.</p><div className="space-y-2 mt-3">{personNotes.map(item => <div key={item.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"><p className="text-sm font-bold text-red-900">{PERSON_NOTE_LABEL[item.category]} · {item.person_name}</p><p className="text-sm text-red-800">{item.note}</p>{item.action_guidance ? <p className="text-sm font-semibold text-red-900 mt-1">{item.action_guidance}</p> : null}</div>)}{entries.map(item => <div key={item.id} className={`rounded-lg border px-3 py-2 ${item.category === 'verbot' ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-white'}`}><p className="text-sm font-bold text-gray-900">{item.title}</p>{item.description ? <p className="text-sm text-gray-700">{item.description}</p> : null}{item.reference ? <p className="text-xs text-gray-500 mt-1">{item.reference}</p> : null}</div>)}</div></div>
}
