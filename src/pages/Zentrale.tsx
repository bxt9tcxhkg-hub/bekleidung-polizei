import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { AlertTriangle, ArrowLeft, BellRing, BookOpen, BriefcaseBusiness, CheckCircle2, ClipboardList, Contact, FileClock, KeyRound, LayoutDashboard, MapPin, Pencil, Plus, Radio, Search, ShieldAlert, Trash2, UserRoundCheck, UsersRound, X } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import PortalChrome from '../components/PortalChrome'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import type { DutyAssignment, DutyFunction, DutyShift, IncidentDisposition, IncidentReport, OperationalPersonNote, OperationalPersonNoteCategory, ZentraleEntry, ZentraleEntryCategory, ZentraleEntryPriority, ZentraleEntryStatus } from '../lib/types'

type TabId = 'uebersicht' | 'einsaetze' | 'personenhinweise' | ZentraleEntryCategory | 'strassenzustand'
const TABS: { id: TabId; label: string; icon: typeof Radio; description: string }[] = [
  { id: 'uebersicht', label: 'Übersicht', icon: LayoutDashboard, description: 'Besetzung, offene Meldungen und relevante Informationen' },
  { id: 'einsaetze', label: 'Einsätze', icon: Radio, description: 'Meldungen schnell erfassen und disponieren' },
  { id: 'lage', label: 'Operative Lage', icon: Radio, description: 'Ereignisse, Sperren, Gefahren- und Lagehinweise' },
  { id: 'kontrollauftrag', label: 'Kontrollaufträge', icon: ClipboardList, description: 'Aufträge der Dienstführung mit Status und Rückmeldung' },
  { id: 'verbot', label: 'AV/BV & EV', icon: ShieldAlert, description: 'Laufende Annäherungs-, Betretungs- und einstweilige Verbote' },
  { id: 'personenhinweise', label: 'Personenhinweise', icon: UserRoundCheck, description: 'Sicherheitsrelevante Hinweise mit Gültigkeit und Handlungsinformation' },
  { id: 'fahndung', label: 'Fahndungen', icon: Search, description: 'Aktuell offene interne Fahndungshinweise' },
  { id: 'brief', label: 'RSa/RSb', icon: FileClock, description: 'Offene Zustellungen und Fristen' },
  { id: 'schluessel', label: 'Schlüssel', icon: KeyRound, description: 'Hinterlegte Schlüssel und Zutrittshinweise' },
  { id: 'kontakt', label: 'Kontakte', icon: Contact, description: 'Dienstlich notwendige Kontakte und Rufbereitschaften' },
  { id: 'alarmierung', label: 'Alarmierung', icon: BellRing, description: 'Verständigungsreihenfolgen und Eskalationswege' },
  { id: 'uebergabe', label: 'Schichtübergabe', icon: BriefcaseBusiness, description: 'Offene Punkte und Informationen für die Folgeschicht' },
  { id: 'strassenzustand', label: 'Straßenzustand', icon: MapPin, description: 'Bericht erfassen, prüfen und als PDF versenden' },
  { id: 'unterlage', label: 'Unterlagen', icon: BookOpen, description: 'Formulare, Vorlagen und operative Arbeitshilfen' },
]
const inputClass = 'mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
const STATUS_LABEL: Record<ZentraleEntryStatus, string> = { offen: 'Offen', in_bearbeitung: 'In Bearbeitung', erledigt: 'Erledigt' }
const PRIORITY_LABEL: Record<ZentraleEntryPriority, string> = { normal: 'Normal', hoch: 'Hoch', kritisch: 'Kritisch' }
const FUNCTION_LABEL: Record<DutyFunction, string> = { zentrale: 'Zentrale', innendienst: 'Innendienst', jd: 'Journaldienst (JD)', vd: 'Verkehrsdienst (VD)' }
const FUNCTION_TARGET: Record<DutyFunction, number | null> = { zentrale: 1, innendienst: 1, jd: 2, vd: null }
const DISPOSITION_LABEL: Record<IncidentDisposition, string> = { jd: 'JD fährt an', vd: 'VD fährt an', bp: 'An Bundespolizei (BP) weitergegeben', keine_anfahrt: 'Keine Anfahrt erforderlich' }
const PERSON_NOTE_LABEL: Record<OperationalPersonNoteCategory, string> = { infektionsschutz: 'Infektionsschutz', aggressiv: 'Aggressives Verhalten', waffenverbot: 'Waffenverbot', fluchtgefahr: 'Fluchtgefahr', suizidgefahr: 'Suizidgefahr', sonstiges: 'Sonstiger Sicherheitshinweis' }

function todayValue(value: string | null) { return value ? value.slice(0, 10) : '' }
function todayLocal() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function normalizeText(value: string | null | undefined) { return (value ?? '').toLocaleLowerCase('de-AT').replace(/straße/g, 'strasse').replace(/str\./g, 'strasse').replace(/[^a-z0-9äöüß]+/g, ' ').trim() }
function normalizePhone(value: string | null | undefined) { return (value ?? '').replace(/\D/g, '') }
function formatTime(value: string) { return new Date(value).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) }

export default function Zentrale() {
  const { profile, hasAreaAccess, isStrictAdmin, areaRoles } = useAuth()
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManage = isStrictAdmin || roles.some(role => ['zentralist', 'sachbearbeiter', 'admin'].includes(role))
  const [activeTab, setActiveTab] = useState<TabId>('uebersicht')
  const [entries, setEntries] = useState<ZentraleEntry[]>([])
  const [assignments, setAssignments] = useState<DutyAssignment[]>([])
  const [incidents, setIncidents] = useState<IncidentReport[]>([])
  const [personNotes, setPersonNotes] = useState<OperationalPersonNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [editing, setEditing] = useState<ZentraleEntry | null>(null)
  const [entry, setEntry] = useState({ title: '', description: '', priority: 'normal' as ZentraleEntryPriority, status: 'offen' as ZentraleEntryStatus, validFrom: '', validUntil: '', location: '', responsible: '', reference: '', restricted: false })
  const [dutyShift, setDutyShift] = useState<DutyShift>('tag')
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [incident, setIncident] = useState({ callerPhone: '', callerName: '', location: '', summary: '', involvedPerson: '', involvedBirthDate: '', disposition: 'jd' as IncidentDisposition, note: '' })
  const [showPersonForm, setShowPersonForm] = useState(false)
  const [person, setPerson] = useState({ name: '', birthDate: '', phone: '', category: 'aggressiv' as OperationalPersonNoteCategory, description: '', guidance: '', source: '', validUntil: '' })

  const ownAssignment = assignments.find(item => item.user_id === profile?.id && item.duty_date === todayLocal())
  const canOperateZentrale = canManage || ownAssignment?.function === 'zentrale'

  const load = useCallback(async () => {
    setLoading(true)
    const today = todayLocal()
    const [entryResult, dutyResult, incidentResult, personResult] = await Promise.all([
      supabase.from('zentrale_entries').select('*').order('priority').order('updated_at', { ascending: false }),
      supabase.from('duty_assignments').select('*, profiles(id,name,dienstnummer)').eq('duty_date', today).order('function'),
      supabase.from('incident_reports').select('*').gte('reported_at', `${today}T00:00:00`).order('reported_at', { ascending: false }),
      supabase.from('operational_person_notes').select('*').eq('active', true).order('updated_at', { ascending: false }),
    ])
    if (entryResult.error || dutyResult.error || incidentResult.error) setError('Die Informationen der Zentrale konnten nicht vollständig geladen werden.')
    else setError('')
    setEntries((entryResult.data ?? []) as ZentraleEntry[])
    setAssignments((dutyResult.data ?? []) as unknown as DutyAssignment[])
    setIncidents((incidentResult.data ?? []) as IncidentReport[])
    setPersonNotes(personResult.error ? [] : (personResult.data ?? []) as OperationalPersonNote[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (ownAssignment) setDutyShift(ownAssignment.shift) }, [ownAssignment])

  const currentTab = TABS.find(tab => tab.id === activeTab) ?? TABS[0]
  const visibleEntries = useMemo(() => activeTab === 'uebersicht' ? entries.filter(item => item.status !== 'erledigt') : entries.filter(item => item.category === activeTab), [activeTab, entries])
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
    const fallback: ZentraleEntryCategory = activeTab !== 'uebersicht' && activeTab !== 'einsaetze' && activeTab !== 'personenhinweise' && activeTab !== 'strassenzustand' ? activeTab : 'lage'
    setEditing(null); setEntry({ title: '', description: '', priority: 'normal', status: 'offen', validFrom: '', validUntil: '', location: '', responsible: '', reference: '', restricted: false }); setActiveTab(fallback); setShowEntryForm(true); setError('')
  }
  function openEdit(item: ZentraleEntry) { setEditing(item); setEntry({ title: item.title, description: item.description ?? '', priority: item.priority, status: item.status, validFrom: todayValue(item.valid_from), validUntil: todayValue(item.valid_until), location: item.location ?? '', responsible: item.responsible ?? '', reference: item.reference ?? '', restricted: item.restricted }); setShowEntryForm(true); setError('') }

  async function saveEntry() {
    if (!entry.title.trim()) { setError('Bitte eine Bezeichnung eingeben.'); return }
    const category = (editing?.category ?? activeTab) as ZentraleEntryCategory
    setSaving(true)
    const payload = { category, title: entry.title.trim(), description: entry.description.trim() || null, priority: entry.priority, status: entry.status, valid_from: entry.validFrom || null, valid_until: entry.validUntil || null, location: entry.location.trim() || null, responsible: entry.responsible.trim() || null, reference: entry.reference.trim() || null, restricted: entry.restricted }
    const response = editing ? await supabase.from('zentrale_entries').update(payload).eq('id', editing.id) : await supabase.from('zentrale_entries').insert({ ...payload, created_by: profile?.id ?? null })
    setSaving(false)
    if (response.error) { setError('Eintrag konnte nicht gespeichert werden.'); return }
    logAudit(editing ? 'Zentraleintrag bearbeitet' : 'Zentraleintrag angelegt', `${TABS.find(tab => tab.id === category)?.label} · ${entry.title.trim()}`); setShowEntryForm(false); setNotice('Eintrag wurde gespeichert.'); await load()
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

  async function savePersonNote() {
    if (!profile?.id || !person.name.trim() || !person.description.trim()) { setError('Bitte Person und sachlichen Hinweis eingeben.'); return }
    setSaving(true); const result = await supabase.from('operational_person_notes').insert({ person_name: person.name.trim(), birth_date: person.birthDate || null, phone: person.phone.trim() || null, category: person.category, note: person.description.trim(), action_guidance: person.guidance.trim() || null, source_reference: person.source.trim() || null, valid_until: person.validUntil || null, created_by: profile.id }); setSaving(false)
    if (result.error) { setError('Der Personenhinweis konnte nicht gespeichert werden.'); return }
    logAudit('Operativen Personenhinweis angelegt', `${PERSON_NOTE_LABEL[person.category]} · ${person.name.trim()}`); setShowPersonForm(false); setNotice('Personenhinweis wurde gespeichert.'); await load()
  }
  async function deletePersonNote(item: OperationalPersonNote) { if (!window.confirm(`Hinweis zu „${item.person_name}“ endgültig löschen?`)) return; const result = await supabase.from('operational_person_notes').delete().eq('id', item.id); if (result.error) { setError('Der Personenhinweis konnte nicht gelöscht werden.'); return } logAudit('Operativen Personenhinweis endgültig gelöscht', item.person_name); await load() }

  const incidentCards = <div className="space-y-3">{visibleIncidents.length === 0
    ? <Empty text="Heute wurden noch keine Meldungen erfasst." />
    : visibleIncidents.map(item => <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-gray-900">{formatTime(item.reported_at)}</span><span className={`text-xs font-semibold px-2 py-1 rounded-full ${item.status === 'weitergegeben' ? 'bg-blue-100 text-blue-800' : item.status === 'erledigt' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{item.status === 'weitergegeben' ? 'An BP weitergegeben' : item.status === 'erledigt' ? 'Erledigt' : 'Offen'}</span></div><p className="font-semibold text-gray-900 mt-2">{item.location || 'Ohne Ortsangabe'}</p><p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{item.summary}</p><div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-3">{item.caller_phone ? <span>TEL: {item.caller_phone}</span> : null}{item.caller_name ? <span>Melder: {item.caller_name}</span> : null}<span>{DISPOSITION_LABEL[item.disposition]}</span>{item.note ? <span>Bemerkung: {item.note}</span> : null}</div></div><div className="flex gap-2">{canOperateZentrale && item.status === 'offen' ? <button type="button" onClick={() => void completeIncident(item)} className="text-xs font-medium text-green-700 border border-green-200 px-3 py-2 rounded-lg">Erledigt</button> : null}{canManage ? <button type="button" onClick={() => void deleteIncident(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Einsatzmeldung löschen"><Trash2 className="w-4 h-4" /></button> : null}</div></div></article>)}</div>

  return <PortalChrome wide>
    <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-5"><ArrowLeft className="w-4 h-4" /> Zurück zum Portal</Link>
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5"><div><p className="text-xs font-bold uppercase tracking-wider text-red-700">Operativer Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Zentrale</h1><p className="text-sm text-gray-500 mt-1">Relevante Informationen auf einen Blick – ergänzend zum Aktenprogramm.</p></div>{canOperateZentrale ? <button type="button" onClick={openIncident} className="inline-flex items-center justify-center gap-2 bg-red-700 hover:bg-red-800 text-white text-sm font-medium px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Neue Meldung</button> : null}</div>
    <nav className="flex gap-1.5 overflow-x-auto pb-2 mb-5" aria-label="Bereiche der Zentrale">{TABS.map(tab => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => { setActiveTab(tab.id); setNotice('') }} className={`inline-flex items-center gap-2 whitespace-nowrap border px-3 py-2 rounded-xl text-sm font-medium ${activeTab === tab.id ? 'bg-red-50 border-red-300 text-red-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}><Icon className="w-4 h-4" />{tab.label}</button> })}</nav>
    {error && !showEntryForm && !showIncidentForm && !showPersonForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-700" /></div> : null}

    {!loading && activeTab === 'uebersicht' ? <div className="space-y-5">
      <DutyPanel assignments={shiftAssignments} dutyShift={dutyShift} setDutyShift={setDutyShift} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><Stat label="Kritische Hinweise" value={entries.filter(item => item.status !== 'erledigt' && item.priority === 'kritisch').length} color="red" /><Stat label="Offene Kontrollaufträge" value={entries.filter(item => item.category === 'kontrollauftrag' && item.status !== 'erledigt').length} color="blue" /><Stat label="Offene Übergaben" value={entries.filter(item => item.category === 'uebergabe' && item.status !== 'erledigt').length} color="amber" /></div>
      <section><div className="flex items-center justify-between mb-3"><h2 className="font-bold text-gray-900">Heutige Meldungen</h2>{canOperateZentrale ? <button type="button" onClick={openIncident} className="text-sm font-semibold text-red-700">Meldung erfassen</button> : null}</div>{incidentCards}</section>
    </div> : null}

    {!loading && activeTab === 'einsaetze' ? <section><div className="flex items-center justify-between gap-3 mb-3"><div><h2 className="font-bold text-gray-900">Einsätze</h2><p className="text-sm text-gray-500">Kurze interne Koordination, keine Aktenbearbeitung.</p></div>{canOperateZentrale ? <button type="button" onClick={openIncident} className="inline-flex items-center gap-2 bg-red-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Neue Meldung</button> : null}</div>{incidentCards}</section> : null}

    {!loading && activeTab === 'personenhinweise' ? <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden"><div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3"><div><h2 className="font-bold text-gray-900">Operative Personenhinweise</h2><p className="text-sm text-gray-500">Nur sachliche und aktuell erforderliche Sicherheitsinformationen.</p></div>{canManage ? <button type="button" onClick={() => { setPerson({ name: '', birthDate: '', phone: '', category: 'aggressiv', description: '', guidance: '', source: '', validUntil: '' }); setShowPersonForm(true) }} className="inline-flex items-center gap-2 bg-red-700 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Hinweis</button> : null}</div>{personNotes.length === 0 ? <Empty text="Keine für dich sichtbaren aktiven Hinweise vorhanden." /> : <div className="divide-y">{personNotes.map(item => <article key={item.id} className="p-4 sm:p-5 flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900">{item.person_name}</h3><span className="text-xs font-semibold bg-red-100 text-red-800 px-2 py-1 rounded-full">{PERSON_NOTE_LABEL[item.category]}</span></div><p className="text-sm text-gray-700 mt-2">{item.note}</p>{item.action_guidance ? <p className="text-sm font-medium text-gray-900 mt-2">Hinweis: {item.action_guidance}</p> : null}<div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-2">{item.birth_date ? <span>Geb.: {new Date(item.birth_date).toLocaleDateString('de-AT')}</span> : null}{item.phone ? <span>TEL: {item.phone}</span> : null}{item.valid_until ? <span>Gültig bis: {new Date(item.valid_until).toLocaleDateString('de-AT')}</span> : null}{item.source_reference ? <span>Grundlage: {item.source_reference}</span> : null}</div></div>{canManage ? <button type="button" onClick={() => void deletePersonNote(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Personenhinweis löschen"><Trash2 className="w-4 h-4" /></button> : null}</article>)}</div>}</section> : null}

    {!loading && activeTab === 'strassenzustand' ? <section className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6"><div className="flex items-start gap-3"><AlertTriangle className="w-6 h-6 text-amber-700" /><div><h2 className="font-bold text-gray-900">Straßenzustandsbericht in Planung</h2><p className="text-sm text-gray-600 mt-1">Sobald das Formular und der genaue Ablauf vorliegen, wird hier die Erfassung und PDF-Erstellung umgesetzt.</p></div></div></section> : null}

    {!loading && !['uebersicht', 'einsaetze', 'personenhinweise', 'strassenzustand'].includes(activeTab) ? <EntryList currentTab={currentTab} entries={visibleEntries} canManage={canManage} openNew={openNewEntry} openEdit={openEdit} /> : null}

    {showIncidentForm ? <IncidentModal incident={incident} setIncident={setIncident} vdAvailable={vdAvailable} contextEntries={contextEntries} contextPersonNotes={contextPersonNotes} saving={saving} error={error} close={() => setShowIncidentForm(false)} save={saveIncident} /> : null}
    {showPersonForm ? <PersonModal person={person} setPerson={setPerson} saving={saving} error={error} close={() => setShowPersonForm(false)} save={savePersonNote} /> : null}
    {showEntryForm ? <EntryModal entry={entry} setEntry={setEntry} editing={editing} saving={saving} error={error} close={() => setShowEntryForm(false)} save={saveEntry} remove={deleteEntry} /> : null}
  </PortalChrome>
}

function DutyPanel({ assignments, dutyShift, setDutyShift }: { assignments: DutyAssignment[]; dutyShift: DutyShift; setDutyShift: (value: DutyShift) => void }) {
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><UsersRound className="w-5 h-5 text-red-700" /><h2 className="font-bold text-gray-900">Heutige Besetzung</h2></div><p className="text-sm text-gray-500 mt-1">Die eigene Funktion wird direkt im Portal ausgewählt.</p></div><select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={dutyShift} onChange={event => setDutyShift(event.target.value as DutyShift)}><option value="tag">Tagdienst</option><option value="nacht">Nachtdienst</option></select></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">{(['zentrale', 'innendienst', 'jd', 'vd'] as DutyFunction[]).map(fn => { const assigned = assignments.filter(item => item.function === fn), target = FUNCTION_TARGET[fn]; return <div key={fn} className="rounded-xl bg-gray-50 border border-gray-200 p-3"><p className="text-xs font-semibold text-gray-500">{FUNCTION_LABEL[fn]}</p><p className="font-bold text-gray-900 mt-1">{assigned.length}{target !== null ? ` / ${target}` : ''}</p><p className="text-xs text-gray-500 mt-1 truncate">{assigned.map(item => item.profiles?.name).filter(Boolean).join(', ') || 'nicht eingetragen'}</p></div> })}</div></section>
}

function Stat({ label, value, color }: { label: string; value: number; color: 'red' | 'blue' | 'amber' }) { const classes = { red: 'border-red-200 bg-red-50 text-red-900', blue: 'border-blue-200 bg-blue-50 text-blue-900', amber: 'border-amber-200 bg-amber-50 text-amber-900' }[color]; return <div className={`rounded-xl border p-4 ${classes}`}><p className="text-xs font-medium">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></div> }
function Empty({ text }: { text: string }) { return <div className="px-5 py-10 text-center"><CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{text}</p></div> }

function EntryList({ currentTab, entries, canManage, openNew, openEdit }: { currentTab: (typeof TABS)[number]; entries: ZentraleEntry[]; canManage: boolean; openNew: () => void; openEdit: (item: ZentraleEntry) => void }) {
  return <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden"><div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3"><div><h2 className="font-bold text-gray-900">{currentTab.label}</h2><p className="text-sm text-gray-500 mt-0.5">{currentTab.description}</p></div>{canManage ? <button type="button" onClick={openNew} className="inline-flex items-center gap-2 bg-red-700 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Eintrag</button> : null}</div>{entries.length === 0 ? <Empty text="Keine Einträge vorhanden." /> : <div className="divide-y divide-gray-100">{entries.map(item => <article key={item.id} className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900">{item.title}</h3><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.priority === 'kritisch' ? 'bg-red-100 text-red-800' : item.priority === 'hoch' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>{PRIORITY_LABEL[item.priority]}</span><span className="text-xs text-gray-500">{STATUS_LABEL[item.status]}</span>{item.restricted ? <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Vertraulich</span> : null}</div>{item.description ? <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{item.description}</p> : null}<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mt-3">{item.location ? <span>Ort: {item.location}</span> : null}{item.responsible ? <span>Zuständig: {item.responsible}</span> : null}{item.valid_until ? <span>Bis: {new Date(item.valid_until).toLocaleDateString('de-AT')}</span> : null}{item.reference ? <span>Referenz: {item.reference}</span> : null}</div></div>{canManage ? <button type="button" onClick={() => openEdit(item)} className="p-2 text-gray-500 hover:text-red-700 hover:bg-red-50 rounded-lg" aria-label="Eintrag bearbeiten"><Pencil className="w-4 h-4" /></button> : null}</div></article>)}</div>}</section>
}

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) { return <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[94vh] overflow-y-auto"><div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 sm:px-6 py-4 border-b"><h2 className="font-bold text-gray-900">{title}</h2><button type="button" onClick={close} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button></div><div className="px-5 sm:px-6 py-4 space-y-4">{children}</div></div></div> }
function Actions({ saving, close, save }: { saving: boolean; close: () => void; save: () => Promise<void> }) { return <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={close} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button><button type="button" disabled={saving} onClick={() => void save()} className="bg-red-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button></div> }

function IncidentModal({ incident, setIncident, vdAvailable, contextEntries, contextPersonNotes, saving, error, close, save }: { incident: { callerPhone: string; callerName: string; location: string; summary: string; involvedPerson: string; involvedBirthDate: string; disposition: IncidentDisposition; note: string }; setIncident: Dispatch<SetStateAction<typeof incident>>; vdAvailable: boolean; contextEntries: ZentraleEntry[]; contextPersonNotes: OperationalPersonNote[]; saving: boolean; error: string; close: () => void; save: () => Promise<void> }) {
  const patch = (values: Partial<typeof incident>) => setIncident(current => ({ ...current, ...values }))
  return <Modal title="Neue Meldung" close={close}><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="TEL-Nr. des Melders" value={incident.callerPhone} onChange={value => patch({ callerPhone: value })} /><Field label="Name des Melders" value={incident.callerName} onChange={value => patch({ callerName: value })} /></div><div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700"><span className="font-medium">Meldezeit:</span> {new Date().toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}</div><Field label="Einsatzort" value={incident.location} onChange={value => patch({ location: value })} /><Area label="Kurzer Sachverhalt *" value={incident.summary} onChange={value => patch({ summary: value })} /><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="Beteiligte Person" value={incident.involvedPerson} onChange={value => patch({ involvedPerson: value })} /><Field label="Geburtsdatum zur eindeutigen Zuordnung" type="date" value={incident.involvedBirthDate} onChange={value => patch({ involvedBirthDate: value })} /></div><ContextHints entries={contextEntries} personNotes={contextPersonNotes} /><label className="block text-xs font-medium text-gray-600">Behandlung der Meldung<select className={inputClass} value={incident.disposition} onChange={event => patch({ disposition: event.target.value as IncidentDisposition })}><option value="jd">JD fährt an</option>{vdAvailable ? <option value="vd">VD fährt an</option> : null}<option value="bp">An Bundespolizei (BP) weitergegeben</option><option value="keine_anfahrt">Keine Anfahrt erforderlich</option></select></label><Area label="Optionale Bemerkung" value={incident.note} onChange={value => patch({ note: value })} />{error ? <ErrorMessage text={error} /> : null}<Actions saving={saving} close={close} save={save} /></Modal>
}

function ContextHints({ entries, personNotes }: { entries: ZentraleEntry[]; personNotes: OperationalPersonNote[] }) {
  if (entries.length === 0 && personNotes.length === 0) return null
  return <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><h3 className="font-bold text-blue-900">Relevante Hinweise gefunden</h3><p className="text-xs text-blue-700 mt-0.5">Automatisch zusammengetragen – die operative Bewertung bleibt beim Zentralisten.</p><div className="space-y-2 mt-3">{personNotes.map(item => <div key={item.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"><p className="text-sm font-bold text-red-900">{PERSON_NOTE_LABEL[item.category]} · {item.person_name}</p><p className="text-sm text-red-800">{item.note}</p>{item.action_guidance ? <p className="text-sm font-semibold text-red-900 mt-1">{item.action_guidance}</p> : null}</div>)}{entries.map(item => <div key={item.id} className={`rounded-lg border px-3 py-2 ${item.category === 'verbot' ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-white'}`}><p className="text-sm font-bold text-gray-900">{TABS.find(tab => tab.id === item.category)?.label}: {item.title}</p>{item.description ? <p className="text-sm text-gray-700">{item.description}</p> : null}{item.reference ? <p className="text-xs text-gray-500 mt-1">{item.reference}</p> : null}</div>)}</div></div>
}

function PersonModal({ person, setPerson, saving, error, close, save }: { person: { name: string; birthDate: string; phone: string; category: OperationalPersonNoteCategory; description: string; guidance: string; source: string; validUntil: string }; setPerson: Dispatch<SetStateAction<typeof person>>; saving: boolean; error: string; close: () => void; save: () => Promise<void> }) {
  const patch = (values: Partial<typeof person>) => setPerson(current => ({ ...current, ...values }))
  return <Modal title="Operativen Personenhinweis anlegen" close={close}><div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">Nur erforderliche, sachliche und überprüfbare Informationen erfassen. Bei Infektionsrisiken möglichst den notwendigen Schutz statt einer Diagnose beschreiben.</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="Person *" value={person.name} onChange={value => patch({ name: value })} /><Field label="Geburtsdatum" type="date" value={person.birthDate} onChange={value => patch({ birthDate: value })} /><Field label="Telefonnummer" value={person.phone} onChange={value => patch({ phone: value })} /><label className="text-xs font-medium text-gray-600">Art<select className={inputClass} value={person.category} onChange={event => patch({ category: event.target.value as OperationalPersonNoteCategory })}>{Object.entries(PERSON_NOTE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><Area label="Sachlicher Hinweis *" value={person.description} onChange={value => patch({ description: value })} /><Area label="Konkreter Handlungshinweis" value={person.guidance} onChange={value => patch({ guidance: value })} /><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="Grundlage / Referenz" value={person.source} onChange={value => patch({ source: value })} /><Field label="Gültig bis" type="date" value={person.validUntil} onChange={value => patch({ validUntil: value })} /></div>{error ? <ErrorMessage text={error} /> : null}<Actions saving={saving} close={close} save={save} /></Modal>
}

function EntryModal({ entry, setEntry, editing, saving, error, close, save, remove }: { entry: { title: string; description: string; priority: ZentraleEntryPriority; status: ZentraleEntryStatus; validFrom: string; validUntil: string; location: string; responsible: string; reference: string; restricted: boolean }; setEntry: Dispatch<SetStateAction<typeof entry>>; editing: ZentraleEntry | null; saving: boolean; error: string; close: () => void; save: () => Promise<void>; remove: () => Promise<void> }) {
  const patch = (values: Partial<typeof entry>) => setEntry(current => ({ ...current, ...values }))
  return <Modal title={editing ? 'Eintrag bearbeiten' : 'Eintrag anlegen'} close={close}><Field label="Bezeichnung *" value={entry.title} onChange={value => patch({ title: value })} /><Area label="Beschreibung" value={entry.description} onChange={value => patch({ description: value })} /><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><label className="text-xs font-medium text-gray-600">Priorität<select className={inputClass} value={entry.priority} onChange={event => patch({ priority: event.target.value as ZentraleEntryPriority })}><option value="normal">Normal</option><option value="hoch">Hoch</option><option value="kritisch">Kritisch</option></select></label><label className="text-xs font-medium text-gray-600">Status<select className={inputClass} value={entry.status} onChange={event => patch({ status: event.target.value as ZentraleEntryStatus })}><option value="offen">Offen</option><option value="in_bearbeitung">In Bearbeitung</option><option value="erledigt">Erledigt</option></select></label><Field label="Gültig ab" type="date" value={entry.validFrom} onChange={value => patch({ validFrom: value })} /><Field label="Gültig bis" type="date" value={entry.validUntil} onChange={value => patch({ validUntil: value })} /><Field label="Ort / Bereich" value={entry.location} onChange={value => patch({ location: value })} /><Field label="Zuständig / Kontakt" value={entry.responsible} onChange={value => patch({ responsible: value })} /></div><Field label="Aktenzeichen, Schlüsselnummer, Telefonnummer oder Link" value={entry.reference} onChange={value => patch({ reference: value })} /><label className="flex items-start gap-2.5 text-sm text-gray-700"><input type="checkbox" className="mt-0.5 rounded" checked={entry.restricted} onChange={event => patch({ restricted: event.target.checked })} /><span><strong>Vertraulich</strong><br /><span className="text-xs text-gray-500">Nur Zentralisten, zuständige Sachbearbeiter und Admins können den Eintrag sehen.</span></span></label>{error ? <ErrorMessage text={error} /> : null}<div className="flex flex-wrap gap-3 pt-2">{editing ? <button type="button" disabled={saving} onClick={() => void remove()} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /> Endgültig löschen</button> : <span className="mr-auto" />}<button type="button" onClick={close} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button><button type="button" disabled={saving} onClick={() => void save()} className="bg-red-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : 'Speichern'}</button></div></Modal>
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="block text-xs font-medium text-gray-600">{label}<input type={type} className={inputClass} value={value} onChange={event => onChange(event.target.value)} /></label> }
function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-xs font-medium text-gray-600">{label}<textarea className={`${inputClass} min-h-24 resize-y`} value={value} onChange={event => onChange(event.target.value)} /></label> }
function ErrorMessage({ text }: { text: string }) { return <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{text}</p> }
