import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { AlertTriangle, BookOpen, Car, CheckCircle2, ClipboardList, Mail, Pencil, Plus, Radio, ShieldAlert, Trash2, UsersRound } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import MailDeliveries from '../components/MailDeliveries'
import { Actions, Area, ErrorMessage, Field, Modal, inputClass } from '../components/ZentraleEntryEditor'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import type { DutyAssignment, DutyFunctionConfig, FleetVehicle, IncidentDisposition, KontrollauftragZielfunktion, VehicleCheck, VehicleCheckStatus, ZentraleEntry } from '../lib/types'

type TabId = 'einsaetze' | 'kontrollauftraege' | 'hinweise' | 'rsa_rsb' | 'kontrollbehelfe' | 'fahrzeug'
const TABS: { id: TabId; label: string; icon: typeof Radio }[] = [
  { id: 'einsaetze', label: 'Einsätze', icon: Radio },
  { id: 'kontrollauftraege', label: 'Kontrollaufträge', icon: ClipboardList },
  { id: 'hinweise', label: 'Operative Hinweise', icon: ShieldAlert },
  { id: 'rsa_rsb', label: 'RSa/RSb', icon: Mail },
  { id: 'kontrollbehelfe', label: 'Kontrollbehelfe', icon: BookOpen },
  { id: 'fahrzeug', label: 'Fahrzeug', icon: Car },
]
const DISPOSITION_LABEL: Record<IncidentDisposition, string> = { jd: 'JD fährt an', vd: 'VD fährt an', bp: 'An Bundespolizei (BP) weitergegeben', keine_anfahrt: 'Keine Anfahrt erforderlich' }
const ZIELFUNKTION_LABEL: Record<KontrollauftragZielfunktion, string> = { jd: 'Nur JD', vd: 'Nur VD', beide: 'JD und VD' }

const emptyAuftrag = { title: '', description: '', location: '', validFrom: '', validUntil: '', targetFunction: 'beide' as KontrollauftragZielfunktion }

function todayLocal() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function formatTime(value: string) { return new Date(value).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) }

export default function Aussendienst() {
  const { profile, hasAreaAccess, isGenehmiger } = useAuth()
  const [activeTab, setActiveTab] = useState<TabId>('einsaetze')
  const [assignments, setAssignments] = useState<DutyAssignment[]>([])
  const [functions, setFunctions] = useState<DutyFunctionConfig[]>([])
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [checks, setChecks] = useState<VehicleCheck[]>([])
  const [entries, setEntries] = useState<ZentraleEntry[]>([])
  const [incidents, setIncidents] = useState<{ id: string; reported_at: string; location: string | null; summary: string; disposition: IncidentDisposition; status: string; note: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [checkNote, setCheckNote] = useState('')
  const [showMangelForm, setShowMangelForm] = useState(false)
  const [showAuftragForm, setShowAuftragForm] = useState(false)
  const [editingAuftrag, setEditingAuftrag] = useState<ZentraleEntry | null>(null)
  const [auftrag, setAuftrag] = useState(emptyAuftrag)
  const [auftragError, setAuftragError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const today = todayLocal()
    const [dutyResult, functionResult, vehicleResult, checkResult, entryResult, incidentResult] = await Promise.all([
      supabase.from('duty_assignments').select('*, profiles(id,name,dienstnummer)').eq('duty_date', today),
      supabase.from('duty_functions').select('*'),
      supabase.from('fleet_vehicles').select('*').eq('active', true),
      supabase.from('vehicle_checks').select('*').eq('duty_date', today),
      supabase.from('zentrale_entries').select('*').order('priority').order('updated_at', { ascending: false }),
      supabase.from('incident_reports').select('id,reported_at,location,summary,disposition,status,note').gte('reported_at', `${today}T00:00:00`).order('reported_at', { ascending: false }),
    ])
    if (dutyResult.error || entryResult.error) setError('Einige Informationen konnten nicht geladen werden.')
    else setError('')
    setAssignments((dutyResult.data ?? []) as unknown as DutyAssignment[])
    setFunctions((functionResult.data ?? []) as DutyFunctionConfig[])
    setVehicles((vehicleResult.data ?? []) as FleetVehicle[])
    setChecks((checkResult.data ?? []) as VehicleCheck[])
    setEntries((entryResult.data ?? []) as ZentraleEntry[])
    setIncidents(incidentResult.data ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const ownAssignment = assignments.find(item => item.user_id === profile?.id)
  const ownFunction = functions.find(item => item.code === ownAssignment?.function)
  const ownVehicle = vehicles.find(item => item.id === ownAssignment?.vehicle_id)
  const ownCheck = checks.find(item => item.vehicle_id === ownAssignment?.vehicle_id && item.shift === ownAssignment?.shift)
  const patrolMates = useMemo(() => ownAssignment ? assignments.filter(item => item.user_id !== profile?.id && item.function === ownAssignment.function && item.shift === ownAssignment.shift) : [], [assignments, ownAssignment, profile?.id])

  const criticalEntries = useMemo(() => entries.filter(item => item.status !== 'erledigt' && item.priority === 'kritisch'), [entries])
  const openIncidents = useMemo(() => {
    const relevant = ownAssignment?.function === 'jd' ? incidents.filter(item => item.disposition === 'jd')
      : ownAssignment?.function === 'vd' ? incidents.filter(item => item.disposition === 'vd')
      : incidents
    return relevant.filter(item => item.status === 'offen')
  }, [incidents, ownAssignment?.function])
  const ownFunctionOrders = useCallback((item: ZentraleEntry) => item.category === 'kontrollauftrag' && (!ownAssignment || item.target_function == null || item.target_function === 'beide' || item.target_function === ownAssignment.function), [ownAssignment])
  const openOrders = useMemo(() => entries.filter(item => ownFunctionOrders(item) && item.status !== 'erledigt'), [entries, ownFunctionOrders])
  const kontrollauftraege = useMemo(() => entries.filter(ownFunctionOrders), [entries, ownFunctionOrders])

  async function saveVehicleCheck(status: VehicleCheckStatus, note: string) {
    if (!profile?.id || !ownAssignment?.vehicle_id) return
    setSaving(true)
    const { error: checkError } = await supabase.from('vehicle_checks').upsert(
      { vehicle_id: ownAssignment.vehicle_id, duty_date: todayLocal(), shift: ownAssignment.shift, status, note: note.trim() || null, checked_by: profile.id },
      { onConflict: 'vehicle_id,duty_date,shift' },
    )
    setSaving(false)
    if (checkError) { setError('Die Kontrolle konnte nicht gespeichert werden.'); return }
    setShowMangelForm(false); setCheckNote(''); await load()
  }

  function openNewAuftrag() { setEditingAuftrag(null); setAuftrag(emptyAuftrag); setAuftragError(''); setShowAuftragForm(true) }
  function openEditAuftrag(item: ZentraleEntry) { setEditingAuftrag(item); setAuftrag({ title: item.title, description: item.description ?? '', location: item.location ?? '', validFrom: item.valid_from?.slice(0, 10) ?? '', validUntil: item.valid_until?.slice(0, 10) ?? '', targetFunction: item.target_function ?? 'beide' }); setAuftragError(''); setShowAuftragForm(true) }
  async function saveAuftrag() {
    if (!auftrag.title.trim()) { setAuftragError('Bitte eine Bezeichnung eingeben.'); return }
    setSaving(true)
    const payload = { category: 'kontrollauftrag' as const, title: auftrag.title.trim(), description: auftrag.description.trim() || null, location: auftrag.location.trim() || null, valid_from: auftrag.validFrom || null, valid_until: auftrag.validUntil || null, target_function: auftrag.targetFunction }
    const response = editingAuftrag ? await supabase.from('zentrale_entries').update(payload).eq('id', editingAuftrag.id) : await supabase.from('zentrale_entries').insert({ ...payload, created_by: profile?.id ?? null })
    setSaving(false)
    if (response.error) { setAuftragError('Kontrollauftrag konnte nicht gespeichert werden.'); return }
    logAudit(editingAuftrag ? 'Kontrollauftrag bearbeitet' : 'Kontrollauftrag angelegt', auftrag.title.trim()); setShowAuftragForm(false); await load()
  }
  async function deleteAuftrag() {
    if (!editingAuftrag || !window.confirm(`Kontrollauftrag „${editingAuftrag.title}“ endgültig löschen?`)) return
    const result = await supabase.from('zentrale_entries').delete().eq('id', editingAuftrag.id)
    if (result.error) { setAuftragError('Kontrollauftrag konnte nicht gelöscht werden.'); return }
    logAudit('Kontrollauftrag endgültig gelöscht', editingAuftrag.title); setShowAuftragForm(false); await load()
  }

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  return <div>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Außendienst / Streife</h1><p className="text-sm text-gray-500 mt-1">Tagesaktuelle Aufträge und Hilfsmittel – als Ergänzung zum Aktenprogramm.</p></div>
    {error ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : null}

    {!loading && !ownAssignment ? <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 mb-6"><div className="flex items-start gap-3"><AlertTriangle className="w-6 h-6 text-amber-700 flex-shrink-0" /><div><h2 className="font-bold text-gray-900">Noch keine Funktion für heute gewählt</h2><p className="text-sm text-gray-600 mt-1">Bitte zuerst auf der Portal-Startseite die heutige Funktion (z. B. JD oder VD) auswählen, um Streife, Fahrzeug und passende Aufträge zu sehen.</p><Link to="/" className="inline-block mt-3 text-sm font-semibold text-blue-700">Funktion jetzt wählen →</Link></div></div></div> : null}

    {!loading && ownAssignment ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-bold text-gray-900 flex items-center gap-2"><UsersRound className="w-4 h-4 text-blue-700" /> Meine Streife</h2><p className="text-sm text-gray-500 mt-1">{ownFunction?.label ?? ownAssignment.function} · {ownAssignment.shift === 'tag' ? 'Tagdienst' : 'Nachtdienst'}</p><p className="text-sm text-gray-700 mt-2">{patrolMates.length === 0 ? 'Keine weiteren Kolleginnen/Kollegen in dieser Funktion eingetragen.' : `Mit: ${patrolMates.map(item => item.profiles?.name).filter(Boolean).join(', ')}`}</p>{ownVehicle ? <p className="text-sm font-semibold text-blue-700 mt-2">Fahrzeug: {ownVehicle.call_sign || ownVehicle.name}{ownVehicle.license_plate ? ` · ${ownVehicle.license_plate}` : ''}</p> : <p className="text-sm text-gray-500 mt-2">Kein Fahrzeug zugewiesen (auf der Startseite wählbar).</p>}</section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-bold text-gray-900 flex items-center gap-2"><Radio className="w-4 h-4 text-blue-700" /> Jetzt offen</h2>{openIncidents.length === 0 && openOrders.length === 0 ? <p className="text-sm text-gray-500 mt-2">Keine offenen Einsätze oder dringenden Aufträge.</p> : <ul className="mt-2 space-y-1.5 text-sm text-gray-700">{openIncidents.slice(0, 4).map(item => <li key={item.id}>• {formatTime(item.reported_at)} – {item.location || item.summary.slice(0, 40)}</li>)}{openOrders.slice(0, 4).map(item => <li key={item.id}>• Auftrag: {item.title}</li>)}</ul>}</section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 lg:col-span-2"><h2 className="font-bold text-gray-900 flex items-center gap-2"><Car className="w-4 h-4 text-blue-700" /> Vor Dienstbeginn – Fahrzeug- und Materialcheck</h2>
        {!ownVehicle ? <p className="text-sm text-gray-500 mt-2">Erst nach Fahrzeugzuweisung möglich.</p>
        : ownCheck ? <div className={`mt-2 rounded-xl px-4 py-3 flex items-center gap-2 text-sm ${ownCheck.status === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>{ownCheck.status === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}<span>{ownCheck.status === 'ok' ? 'Kontrolliert – in Ordnung' : `Mangel gemeldet${ownCheck.note ? `: ${ownCheck.note}` : ''}`}</span></div>
        : <div className="mt-2"><p className="text-sm text-amber-700 mb-2">Noch nicht kontrolliert – bitte vor Dienstantritt durchführen (kein Zwang, nur Erinnerung).</p><div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void saveVehicleCheck('ok', '')} className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60">Kontrolliert – in Ordnung</button><button type="button" onClick={() => setShowMangelForm(true)} className="border border-amber-300 text-amber-800 text-sm font-medium px-4 py-2 rounded-lg">Mangel melden</button></div>
          {showMangelForm ? <div className="mt-3 flex flex-col sm:flex-row gap-2"><input className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Was fehlt / ist beschädigt?" value={checkNote} onChange={event => setCheckNote(event.target.value)} /><button type="button" disabled={saving} onClick={() => void saveVehicleCheck('mangel', checkNote)} className="bg-amber-700 hover:bg-amber-800 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60">Melden</button></div> : null}</div>}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 lg:col-span-2"><h2 className="font-bold text-gray-900 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-blue-700" /> Wichtige Hinweise</h2>{criticalEntries.length === 0 ? <p className="text-sm text-gray-500 mt-2">Keine aktuell dringenden Warnungen.</p> : <div className="mt-2 space-y-2">{criticalEntries.map(item => <div key={item.id} className="rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2"><p className="font-bold text-red-900 text-sm">{item.title}</p>{item.description ? <p className="text-sm text-red-800">{item.description}</p> : null}</div>)}</div>}</section>
    </div> : null}

    <nav className="flex gap-1.5 overflow-x-auto pb-2 mb-5" aria-label="Bereiche des Außendienstes">{TABS.map(tab => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex items-center gap-2 whitespace-nowrap border px-3 py-2 rounded-xl text-sm font-medium ${activeTab === tab.id ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}><Icon className="w-4 h-4" />{tab.label}</button> })}</nav>

    {!loading && activeTab === 'einsaetze' ? <EntryOrIncidentList kind="incidents" incidents={incidents} /> : null}
    {!loading && activeTab === 'kontrollauftraege' ? <div>
      {isGenehmiger ? <div className="mb-3 flex justify-end"><button type="button" onClick={openNewAuftrag} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Kontrollauftrag</button></div> : null}
      <EntryOrIncidentList kind="entries" entries={kontrollauftraege} canManage={isGenehmiger} onEdit={openEditAuftrag} />
    </div> : null}
    {!loading && activeTab === 'hinweise' ? <EntryOrIncidentList kind="entries" entries={entries.filter(item => item.category === 'lage' || item.category === 'verbot' || item.category === 'fahndung')} /> : null}
    {!loading && activeTab === 'rsa_rsb' ? <MailDeliveries /> : null}
    {!loading && activeTab === 'kontrollbehelfe' ? <EntryOrIncidentList kind="entries" entries={entries.filter(item => item.category === 'unterlage')} /> : null}
    {!loading && activeTab === 'fahrzeug' ? (ownVehicle ? <div className="rounded-2xl border border-gray-200 bg-white p-5"><h2 className="font-bold text-gray-900">{ownVehicle.name}</h2><dl className="text-sm mt-3 space-y-1.5"><div className="flex justify-between"><dt className="text-gray-500">Rufname</dt><dd className="font-medium">{ownVehicle.call_sign || '–'}</dd></div><div className="flex justify-between"><dt className="text-gray-500">Kennzeichen</dt><dd className="font-medium">{ownVehicle.license_plate || '–'}</dd></div><div className="flex justify-between"><dt className="text-gray-500">Marke/Modell</dt><dd className="font-medium">{[ownVehicle.make, ownVehicle.model].filter(Boolean).join(' ') || '–'}</dd></div></dl><Link to={`/fuhrpark/${ownVehicle.id}`} className="inline-block mt-4 text-sm font-semibold text-blue-700">Fahrzeugdetails im Fuhrpark →</Link></div> : <Empty text="Kein Fahrzeug zugewiesen." />) : null}

    {showAuftragForm ? <AuftragModal auftrag={auftrag} setAuftrag={setAuftrag} editing={editingAuftrag} saving={saving} error={auftragError} close={() => setShowAuftragForm(false)} save={saveAuftrag} remove={deleteAuftrag} /> : null}
  </div>
}

function EntryOrIncidentList({ kind, entries, incidents, canManage, onEdit }: { kind: 'entries' | 'incidents'; entries?: ZentraleEntry[]; incidents?: { id: string; reported_at: string; location: string | null; summary: string; disposition: IncidentDisposition; status: string; note: string | null }[]; canManage?: boolean; onEdit?: (item: ZentraleEntry) => void }) {
  if (kind === 'incidents') {
    if (!incidents || incidents.length === 0) return <Empty text="Heute wurden noch keine Meldungen erfasst." />
    return <div className="space-y-3">{incidents.map(item => <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-gray-900">{formatTime(item.reported_at)}</span><span className={`text-xs font-semibold px-2 py-1 rounded-full ${item.status === 'weitergegeben' ? 'bg-blue-100 text-blue-800' : item.status === 'erledigt' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{item.status === 'weitergegeben' ? 'An BP weitergegeben' : item.status === 'erledigt' ? 'Erledigt' : 'Offen'}</span></div><p className="font-semibold text-gray-900 mt-2">{item.location || 'Ohne Ortsangabe'}</p><p className="text-sm text-gray-700 mt-1">{item.summary}</p><p className="text-xs text-gray-500 mt-2">{DISPOSITION_LABEL[item.disposition]}</p></article>)}</div>
  }
  const list = entries ?? []
  if (list.length === 0) return <Empty text="Keine Einträge vorhanden." />
  return <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">{list.map(item => <article key={item.id} className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900">{item.title}</h3><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.priority === 'kritisch' ? 'bg-red-100 text-red-800' : item.priority === 'hoch' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>{item.priority}</span>{item.target_function ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">{ZIELFUNKTION_LABEL[item.target_function]}</span> : null}</div>{item.description ? <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{item.description}</p> : null}<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">{item.location ? <span>Ort: {item.location}</span> : null}{item.valid_from ? <span>Ab: {new Date(item.valid_from).toLocaleDateString('de-AT')}</span> : null}{item.valid_until ? <span>Bis: {new Date(item.valid_until).toLocaleDateString('de-AT')}</span> : null}</div></div>{canManage && onEdit ? <button type="button" onClick={() => onEdit(item)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg" aria-label="Eintrag bearbeiten"><Pencil className="w-4 h-4" /></button> : null}</div></article>)}</div>
}

function AuftragModal({ auftrag, setAuftrag, editing, saving, error, close, save, remove }: { auftrag: typeof emptyAuftrag; setAuftrag: Dispatch<SetStateAction<typeof emptyAuftrag>>; editing: ZentraleEntry | null; saving: boolean; error: string; close: () => void; save: () => Promise<void>; remove: () => Promise<void> }) {
  const patch = (values: Partial<typeof emptyAuftrag>) => setAuftrag(current => ({ ...current, ...values }))
  return <Modal title={editing ? 'Kontrollauftrag bearbeiten' : 'Kontrollauftrag anlegen'} close={close}>
    <Field label="Bezeichnung *" value={auftrag.title} onChange={value => patch({ title: value })} />
    <Area label="Welche Kontrollen sind durchzuführen" value={auftrag.description} onChange={value => patch({ description: value })} />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Ort" value={auftrag.location} onChange={value => patch({ location: value })} />
      <label className="text-xs font-medium text-gray-600">Zielfunktion<select className={inputClass} value={auftrag.targetFunction} onChange={event => patch({ targetFunction: event.target.value as KontrollauftragZielfunktion })}>{Object.entries(ZIELFUNKTION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <Field label="Von" type="date" value={auftrag.validFrom} onChange={value => patch({ validFrom: value })} />
      <Field label="Bis" type="date" value={auftrag.validUntil} onChange={value => patch({ validUntil: value })} />
    </div>
    {error ? <ErrorMessage text={error} /> : null}
    <div className="flex flex-wrap gap-3 pt-2">{editing ? <button type="button" disabled={saving} onClick={() => void remove()} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /> Endgültig löschen</button> : <span className="mr-auto" />}<Actions saving={saving} close={close} save={save} /></div>
  </Modal>
}

function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"><CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{text}</p></div> }
