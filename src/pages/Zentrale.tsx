import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, BellRing, BookOpen, BriefcaseBusiness, CheckCircle2, ClipboardList, Contact, FileClock, KeyRound, LayoutDashboard, MapPin, Pencil, Plus, Radio, Search, ShieldAlert, Trash2, X } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import PortalChrome from '../components/PortalChrome'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import type { ZentraleEntry, ZentraleEntryCategory, ZentraleEntryPriority, ZentraleEntryStatus } from '../lib/types'

type TabId = 'uebersicht' | ZentraleEntryCategory | 'strassenzustand'
const TABS: { id: TabId; label: string; icon: typeof Radio; description: string }[] = [
  { id: 'uebersicht', label: 'Übersicht', icon: LayoutDashboard, description: 'Aktuelle operative Informationen der Schicht' },
  { id: 'lage', label: 'Operative Lage', icon: Radio, description: 'Ereignisse, Sperren, Gefahren- und Lagehinweise' },
  { id: 'kontrollauftrag', label: 'Kontrollaufträge', icon: ClipboardList, description: 'Aufträge der Dienstführung mit Status und Rückmeldung' },
  { id: 'verbot', label: 'AV/BV & EV', icon: ShieldAlert, description: 'Laufende Annäherungs-, Betretungs- und einstweilige Verbote' },
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

function todayValue(value: string | null) { return value ? value.slice(0, 10) : '' }

export default function Zentrale() {
  const { profile, hasAreaAccess, isStrictAdmin, areaRoles } = useAuth()
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManage = isStrictAdmin || roles.some(role => ['zentralist', 'sachbearbeiter', 'admin'].includes(role))
  const [activeTab, setActiveTab] = useState<TabId>('uebersicht')
  const [entries, setEntries] = useState<ZentraleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ZentraleEntry | null>(null)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<ZentraleEntryPriority>('normal')
  const [status, setStatus] = useState<ZentraleEntryStatus>('offen')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [location, setLocation] = useState('')
  const [responsible, setResponsible] = useState('')
  const [reference, setReference] = useState('')
  const [restricted, setRestricted] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase.from('zentrale_entries').select('*').order('priority', { ascending: true }).order('updated_at', { ascending: false })
    if (loadError) { setError('Die Informationen der Zentrale konnten nicht geladen werden.'); setEntries([]) }
    else { setError(''); setEntries((data ?? []) as ZentraleEntry[]) }
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const currentTab = TABS.find(tab => tab.id === activeTab) ?? TABS[0]
  const visibleEntries = useMemo(() => activeTab === 'uebersicht' ? entries.filter(item => item.status !== 'erledigt') : entries.filter(item => item.category === activeTab), [activeTab, entries])
  const criticalCount = entries.filter(item => item.status !== 'erledigt' && item.priority === 'kritisch').length
  const openTasks = entries.filter(item => item.category === 'kontrollauftrag' && item.status !== 'erledigt').length
  const handovers = entries.filter(item => item.category === 'uebergabe' && item.status !== 'erledigt').length

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  function openNew(category?: ZentraleEntryCategory) {
    const fallback = activeTab !== 'uebersicht' && activeTab !== 'strassenzustand' ? activeTab : 'lage'
    setEditing(null); setTitle(''); setDescription(''); setPriority('normal'); setStatus('offen'); setValidFrom(''); setValidUntil(''); setLocation(''); setResponsible(''); setReference(''); setRestricted(false); setError('')
    if (category) setActiveTab(category); else if (activeTab === 'uebersicht' || activeTab === 'strassenzustand') setActiveTab(fallback)
    setShowForm(true)
  }

  function openEdit(item: ZentraleEntry) {
    setEditing(item); setTitle(item.title); setDescription(item.description ?? ''); setPriority(item.priority); setStatus(item.status)
    setValidFrom(todayValue(item.valid_from)); setValidUntil(todayValue(item.valid_until)); setLocation(item.location ?? ''); setResponsible(item.responsible ?? ''); setReference(item.reference ?? ''); setRestricted(item.restricted); setError(''); setShowForm(true)
  }

  async function saveEntry() {
    if (!title.trim()) { setError('Bitte eine Bezeichnung eingeben.'); return }
    const category = (editing?.category ?? activeTab) as ZentraleEntryCategory
    setSaving(true)
    const payload = { category, title: title.trim(), description: description.trim() || null, priority, status, valid_from: validFrom || null, valid_until: validUntil || null, location: location.trim() || null, responsible: responsible.trim() || null, reference: reference.trim() || null, restricted }
    const response = editing
      ? await supabase.from('zentrale_entries').update(payload).eq('id', editing.id)
      : await supabase.from('zentrale_entries').insert({ ...payload, created_by: profile?.id ?? null })
    setSaving(false)
    if (response.error) { setError('Eintrag konnte nicht gespeichert werden.'); return }
    logAudit(editing ? 'Zentraleintrag bearbeitet' : 'Zentraleintrag angelegt', `${TABS.find(tab => tab.id === category)?.label} · ${title.trim()}`)
    setShowForm(false); setNotice('Eintrag wurde gespeichert.'); await load()
  }

  async function deleteEntry() {
    if (!editing || !window.confirm(`Eintrag „${editing.title}“ endgültig löschen?`)) return
    setSaving(true)
    const { error: deleteError } = await supabase.from('zentrale_entries').delete().eq('id', editing.id)
    setSaving(false)
    if (deleteError) { setError('Eintrag konnte nicht gelöscht werden.'); return }
    logAudit('Zentraleintrag endgültig gelöscht', editing.title)
    setShowForm(false); setEditing(null); setNotice('Eintrag wurde endgültig gelöscht.'); await load()
  }

  return <PortalChrome wide>
    <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-5"><ArrowLeft className="w-4 h-4" /> Zurück zum Portal</Link>
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5"><div><p className="text-xs font-bold uppercase tracking-wider text-red-700">Operativer Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Zentrale</h1><p className="text-sm text-gray-500 mt-1">Interne Lage, Koordination und sichere Schichtübergabe – ergänzend zum Aktenprogramm.</p></div>{canManage && activeTab !== 'strassenzustand' ? <button type="button" onClick={() => openNew()} className="inline-flex items-center justify-center gap-2 bg-red-700 hover:bg-red-800 text-white text-sm font-medium px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Eintrag anlegen</button> : null}</div>

    <nav className="flex gap-1.5 overflow-x-auto pb-2 mb-5" aria-label="Bereiche der Zentrale">{TABS.map(tab => { const Icon=tab.icon; return <button key={tab.id} type="button" onClick={() => { setActiveTab(tab.id); setNotice('') }} className={`inline-flex items-center gap-2 whitespace-nowrap border px-3 py-2 rounded-xl text-sm font-medium ${activeTab===tab.id?'bg-red-50 border-red-300 text-red-800':'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}><Icon className="w-4 h-4" />{tab.label}</button> })}</nav>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}

    {activeTab === 'uebersicht' ? <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5"><div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-medium text-red-700">Kritische Hinweise</p><p className="text-2xl font-bold text-red-900 mt-1">{criticalCount}</p></div><div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-medium text-blue-700">Offene Kontrollaufträge</p><p className="text-2xl font-bold text-blue-900 mt-1">{openTasks}</p></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-medium text-amber-700">Offene Übergaben</p><p className="text-2xl font-bold text-amber-900 mt-1">{handovers}</p></div></div> : null}

    {activeTab === 'strassenzustand' ? <section className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6"><div className="flex items-start gap-3"><AlertTriangle className="w-6 h-6 text-amber-700" /><div><h2 className="font-bold text-gray-900">Straßenzustandsbericht in Planung</h2><p className="text-sm text-gray-600 mt-1">Sobald du das Formular und den genauen Ablauf bereitstellst, wird hier die Erfassung, PDF-Erstellung, Prüfung und Versanddokumentation umgesetzt.</p></div></div></section> : loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-700" /></div> : <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden"><div className="px-4 sm:px-5 py-4 border-b border-gray-200 bg-gray-50"><h2 className="font-bold text-gray-900">{currentTab.label}</h2><p className="text-sm text-gray-500 mt-0.5">{currentTab.description}</p></div>{visibleEntries.length===0?<div className="px-5 py-12 text-center"><CheckCircle2 className="w-9 h-9 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">Keine Einträge vorhanden.</p>{canManage?<button type="button" onClick={() => openNew()} className="text-sm font-medium text-red-700 mt-3">Ersten Eintrag anlegen</button>:null}</div>:<div className="divide-y divide-gray-100">{visibleEntries.map(item => <article key={item.id} className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900">{item.title}</h3><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.priority==='kritisch'?'bg-red-100 text-red-800':item.priority==='hoch'?'bg-amber-100 text-amber-800':'bg-gray-100 text-gray-600'}`}>{PRIORITY_LABEL[item.priority]}</span><span className="text-xs text-gray-500">{STATUS_LABEL[item.status]}</span>{item.restricted?<span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Vertraulich</span>:null}</div>{item.description?<p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{item.description}</p>:null}<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mt-3">{activeTab==='uebersicht'?<span>{TABS.find(tab=>tab.id===item.category)?.label}</span>:null}{item.location?<span>Ort: {item.location}</span>:null}{item.responsible?<span>Zuständig: {item.responsible}</span>:null}{item.valid_until?<span>Bis: {new Date(item.valid_until).toLocaleDateString('de-AT')}</span>:null}{item.reference?<span>Referenz: {item.reference}</span>:null}</div></div>{canManage?<button type="button" onClick={() => openEdit(item)} className="p-2 text-gray-500 hover:text-red-700 hover:bg-red-50 rounded-lg" aria-label="Eintrag bearbeiten"><Pencil className="w-4 h-4" /></button>:null}</div></article>)}</div>}</section>}

    {showForm ? <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[94vh] overflow-y-auto"><div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b"><div><h2 className="font-bold text-gray-900">{editing?'Eintrag bearbeiten':'Eintrag anlegen'}</h2><p className="text-xs text-gray-500 mt-0.5">{TABS.find(tab=>tab.id===(editing?.category??activeTab))?.label}</p></div><button type="button" onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button></div><div className="px-5 sm:px-6 py-4 space-y-4"><label className="block text-xs font-medium text-gray-600">Bezeichnung *<input className={inputClass} maxLength={160} value={title} onChange={event=>setTitle(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Beschreibung<textarea className={`${inputClass} min-h-28 resize-y`} maxLength={3000} value={description} onChange={event=>setDescription(event.target.value)} /></label><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><label className="block text-xs font-medium text-gray-600">Priorität<select className={inputClass} value={priority} onChange={event=>setPriority(event.target.value as ZentraleEntryPriority)}><option value="normal">Normal</option><option value="hoch">Hoch</option><option value="kritisch">Kritisch</option></select></label><label className="block text-xs font-medium text-gray-600">Status<select className={inputClass} value={status} onChange={event=>setStatus(event.target.value as ZentraleEntryStatus)}><option value="offen">Offen</option><option value="in_bearbeitung">In Bearbeitung</option><option value="erledigt">Erledigt</option></select></label><label className="block text-xs font-medium text-gray-600">Gültig ab<input type="date" className={inputClass} value={validFrom} onChange={event=>setValidFrom(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Gültig bis<input type="date" className={inputClass} value={validUntil} onChange={event=>setValidUntil(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Ort / Bereich<input className={inputClass} maxLength={200} value={location} onChange={event=>setLocation(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Zuständig / Kontakt<input className={inputClass} maxLength={200} value={responsible} onChange={event=>setResponsible(event.target.value)} /></label></div><label className="block text-xs font-medium text-gray-600">Aktenzeichen, Schlüsselnummer, Telefonnummer oder Link<input className={inputClass} maxLength={500} value={reference} onChange={event=>setReference(event.target.value)} /></label><label className="flex items-start gap-2.5 text-sm text-gray-700"><input type="checkbox" className="mt-0.5 rounded" checked={restricted} onChange={event=>setRestricted(event.target.checked)} /><span><strong>Vertraulich</strong><br/><span className="text-xs text-gray-500">Nur Zentralisten, zuständige Sachbearbeiter und Admins können den Eintrag sehen.</span></span></label>{error?<p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p>:null}</div><div className="flex flex-wrap gap-3 px-5 sm:px-6 py-4 border-t">{editing?<button type="button" disabled={saving} onClick={()=>{void deleteEntry()}} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /> Endgültig löschen</button>:null}<button type="button" onClick={()=>setShowForm(false)} className="border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg">Abbrechen</button><button type="button" disabled={saving} onClick={()=>{void saveEntry()}} className="bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-lg">{saving?'Speichern…':'Speichern'}</button></div></div></div> : null}
  </PortalChrome>
}
