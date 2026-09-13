import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { AlertTriangle, Car, CheckCircle2, ClipboardList, Construction, Pencil, Plus, Radio, ShieldAlert, Trash2, UsersRound } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { Actions, Area, ErrorMessage, Field, Modal, inputClass } from '../components/ZentraleEntryEditor'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import { geocodeLocation, routeAlongRoad } from '../lib/geocode'
import type { AvBvArt, DutyAssignment, DutyFunctionConfig, FahndungArt, FleetVehicle, IncidentDisposition, KontrollauftragZielfunktion, VehicleCheck, VehicleCheckStatus, ZentraleAvBv, ZentraleEntry, ZentraleFahndung } from '../lib/types'
import { personDisplayName } from '../lib/register'

// RSa/RSb und Kontrollbehelfe (Unterlagen) sind eigene Sidebar-Seiten (siehe
// AussendienstLayout) - dieselben Daten hier zusätzlich als Tab zu zeigen, wäre eine Dopplung.
type TabId = 'einsaetze' | 'kontrollauftraege' | 'hinweise' | 'fahrzeug'
const TABS: { id: TabId; label: string; icon: typeof Radio }[] = [
  { id: 'einsaetze', label: 'Einsätze', icon: Radio },
  { id: 'kontrollauftraege', label: 'Kontrollaufträge', icon: ClipboardList },
  { id: 'hinweise', label: 'Operative Hinweise', icon: ShieldAlert },
  { id: 'fahrzeug', label: 'Fahrzeug', icon: Car },
]
const DISPOSITION_LABEL: Record<IncidentDisposition, string> = { jd: 'JD fährt an', vd: 'VD fährt an', bp: 'An Bundespolizei (BP) weitergegeben', keine_anfahrt: 'Keine Anfahrt erforderlich' }
const ZIELFUNKTION_LABEL: Record<KontrollauftragZielfunktion, string> = { jd: 'Nur JD', vd: 'Nur VD', beide: 'JD und VD' }
const AV_BV_ART_LABEL: Record<AvBvArt, string> = { amtsverbot: 'Amtsverbot', betretungsverbot: 'Betretungsverbot', einreiseverbot: 'Einreiseverbot' }
const FAHNDUNG_ART_LABEL: Record<FahndungArt, string> = { person: 'Person', fahrzeug: 'Fahrzeug', objekt: 'Objekt', sonstiges: 'Sonstiges' }

const emptyAuftrag = { title: '', description: '', location: '', validFrom: '', validUntil: '', targetFunction: 'beide' as KontrollauftragZielfunktion }
// Vereinfachte, rein textuelle Baustellen-Meldung für die Streife - kein
// Kartenzeichnen wie in der Zentrale. Ohne Endpunkt wird derselbe Standort
// für Start und Ende verwendet (Wahrnehmung ohne genauen Streckenverlauf).
const EMPTY_BAUSTELLE_REPORT = { titel: '', startAddress: '', endAddress: '', note: '' }
type BaustelleReportState = typeof EMPTY_BAUSTELLE_REPORT

function todayLocal() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function formatTime(value: string) { return new Date(value).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) }

export default function Aussendienst() {
  const { profile, hasAreaAccess, isGenehmiger, isStrictAdmin, areaRoles, operativeModeActive } = useAuth()
  const zentraleRoles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManageZentrale = isStrictAdmin || isGenehmiger || (operativeModeActive && zentraleRoles.some(role => ['sachbearbeiter', 'admin'].includes(role)))
  const [activeTab, setActiveTab] = useState<TabId>('einsaetze')
  const [assignments, setAssignments] = useState<DutyAssignment[]>([])
  const [functions, setFunctions] = useState<DutyFunctionConfig[]>([])
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [checks, setChecks] = useState<VehicleCheck[]>([])
  const [entries, setEntries] = useState<ZentraleEntry[]>([])
  const [avBv, setAvBv] = useState<ZentraleAvBv[]>([])
  const [fahndungen, setFahndungen] = useState<ZentraleFahndung[]>([])
  // Wie in Zentrale.tsx: bei Ladefehler darf "Keine aktuell dringenden
  // Warnungen" nicht fälschlich Entwarnung geben.
  const [criticalSourcesError, setCriticalSourcesError] = useState(false)
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
  const [notice, setNotice] = useState('')
  const [showBaustelleForm, setShowBaustelleForm] = useState(false)
  const [baustelleReport, setBaustelleReport] = useState<BaustelleReportState>(EMPTY_BAUSTELLE_REPORT)
  const [baustelleSaving, setBaustelleSaving] = useState(false)
  const [baustelleError, setBaustelleError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const today = todayLocal()
    const [dutyResult, functionResult, vehicleResult, checkResult, entryResult, incidentResult, avBvResult, fahndungResult] = await Promise.all([
      supabase.from('duty_assignments').select('*, profiles(id,name,dienstnummer)').eq('duty_date', today),
      supabase.from('duty_functions').select('*'),
      supabase.from('fleet_vehicles').select('*').eq('active', true),
      supabase.from('vehicle_checks').select('*').eq('duty_date', today),
      supabase.from('zentrale_entries').select('*').order('priority').order('updated_at', { ascending: false }),
      supabase.from('incident_reports').select('id,reported_at,location,summary,disposition,status,note').gte('reported_at', `${today}T00:00:00`).order('reported_at', { ascending: false }),
      // AV/BV & EV und Fahndungen liegen in eigenen Tabellen (siehe ZentraleAvBv/ZentraleFahndungen) - hier nur lesend für den Außendienst.
      supabase.from('zentrale_av_bv').select('*, person:operational_persons(id,vorname,nachname,birth_date), object:operational_objects(id,address,label)').eq('status', 'offen'),
      supabase.from('zentrale_fahndungen').select('*, person:operational_persons(id,vorname,nachname,birth_date), object:operational_objects(id,address,label)').eq('status', 'offen'),
    ])
    if (dutyResult.error || entryResult.error) setError('Einige Informationen konnten nicht geladen werden.')
    else setError('')
    setAssignments((dutyResult.data ?? []) as unknown as DutyAssignment[])
    setFunctions((functionResult.data ?? []) as DutyFunctionConfig[])
    setVehicles((vehicleResult.data ?? []) as FleetVehicle[])
    setChecks((checkResult.data ?? []) as VehicleCheck[])
    setEntries((entryResult.data ?? []) as ZentraleEntry[])
    setIncidents(incidentResult.data ?? [])
    setAvBv(avBvResult.error ? [] : (avBvResult.data ?? []) as unknown as ZentraleAvBv[])
    setFahndungen(fahndungResult.error ? [] : (fahndungResult.data ?? []) as unknown as ZentraleFahndung[])
    setCriticalSourcesError(Boolean(avBvResult.error || fahndungResult.error))
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const ownAssignment = assignments.find(item => item.user_id === profile?.id)
  const ownFunction = functions.find(item => item.code === ownAssignment?.function)
  const ownVehicle = vehicles.find(item => item.id === ownAssignment?.vehicle_id)
  const ownCheck = checks.find(item => item.vehicle_id === ownAssignment?.vehicle_id && item.shift === ownAssignment?.shift)
  const patrolMates = useMemo(() => ownAssignment ? assignments.filter(item => item.user_id !== profile?.id && item.function === ownAssignment.function && item.shift === ownAssignment.shift) : [], [assignments, ownAssignment, profile?.id])

  const criticalEntries = useMemo(() => entries.filter(item => item.status !== 'erledigt' && item.priority === 'kritisch'), [entries])
  const criticalItems = useMemo(() => [
    ...criticalEntries.map(item => ({ id: item.id, title: item.title, description: item.description })),
    ...avBv.filter(item => item.priority === 'kritisch').map(item => ({ id: item.id, title: `AV/BV & EV (${AV_BV_ART_LABEL[item.art]}) · ${(item.person ? personDisplayName(item.person) : (item.object?.address ?? item.gebiet ?? 'ohne Zuordnung'))}`, description: item.grund })),
    ...fahndungen.filter(item => item.priority === 'kritisch').map(item => ({ id: item.id, title: `Fahndung (${FAHNDUNG_ART_LABEL[item.art]}) · ${(item.person ? personDisplayName(item.person) : (item.object?.address ?? 'ohne Zuordnung'))}`, description: item.beschreibung })),
  ], [avBv, criticalEntries, fahndungen])
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

  function openBaustelleReport() { setBaustelleReport(EMPTY_BAUSTELLE_REPORT); setBaustelleError(''); setShowBaustelleForm(true) }
  async function saveBaustelleReport() {
    if (!profile?.id) return
    if (!baustelleReport.titel.trim()) { setBaustelleError('Bitte eine Bezeichnung eingeben.'); return }
    const startAddress = baustelleReport.startAddress.trim()
    if (!startAddress) { setBaustelleError('Bitte zumindest den Standort angeben.'); return }
    setBaustelleSaving(true)
    const startResult = await geocodeLocation(startAddress)
    if (!startResult) { setBaustelleSaving(false); setBaustelleError('Standort konnte nicht gefunden werden.'); return }
    const endAddress = baustelleReport.endAddress.trim()
    // Ohne Endadresse gilt derselbe Standort für Start und Ende (kurzer Punkt statt Streckenabschnitt).
    const endResult = endAddress ? await geocodeLocation(endAddress) : startResult
    if (!endResult) { setBaustelleSaving(false); setBaustelleError('Der zweite Standort konnte nicht gefunden werden.'); return }
    // Streckenverlauf entlang des Straßennetzes statt Luftlinie - wie in der
    // Zentrale-Erfassung; best effort, bei Fehlschlag bleibt path null (Luftlinie).
    const path = await routeAlongRoad(startResult, endResult)
    // Ohne Verwaltungsrecht entsteht die Meldung immer als "gemeldet" (ungeprüft) -
    // Sachbearbeiter/Genehmiger bestätigen sie in der Zentrale (RLS erzwingt das zusätzlich).
    const response = await supabase.from('zentrale_baustellen').insert({ titel: baustelleReport.titel.trim(), start_lat: startResult.lat, start_lng: startResult.lng, end_lat: endResult.lat, end_lng: endResult.lng, path, note: baustelleReport.note.trim() || null, created_by: profile.id, status: canManageZentrale ? 'offen' : 'gemeldet' })
    setBaustelleSaving(false)
    if (response.error) { setBaustelleError('Die Meldung konnte nicht gespeichert werden.'); return }
    logAudit('Baustelle gemeldet', baustelleReport.titel.trim()); setShowBaustelleForm(false); setNotice(canManageZentrale ? 'Baustelle wurde angelegt.' : 'Baustelle wurde gemeldet und wartet auf Prüfung durch die Zentrale.')
  }

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  return <div>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Außendienst / Streife</h1><p className="text-sm text-gray-500 mt-1">Tagesaktuelle Aufträge und Hilfsmittel – als Ergänzung zum Aktenprogramm.</p></div>
    {error ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
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

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 lg:col-span-2"><h2 className="font-bold text-gray-900 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-blue-700" /> Wichtige Hinweise</h2>
        {criticalSourcesError ? <p className="text-xs font-medium text-amber-700 flex items-center gap-1.5 mt-2"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> AV/BV & EV bzw. Fahndungen konnten nicht vollständig geladen werden - es könnten weitere Warnungen fehlen. Bitte Seite neu laden.</p> : null}
        {criticalItems.length === 0 ? (criticalSourcesError ? null : <p className="text-sm text-gray-500 mt-2">Keine aktuell dringenden Warnungen.</p>) : <div className="mt-2 space-y-2">{criticalItems.map(item => <div key={item.id} className="rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2"><p className="font-bold text-red-900 text-sm">{item.title}</p>{item.description ? <p className="text-sm text-red-800">{item.description}</p> : null}</div>)}</div>}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 lg:col-span-2"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-gray-900 flex items-center gap-2"><Construction className="w-4 h-4 text-blue-700" /> Baustelle wahrgenommen?</h2><button type="button" onClick={openBaustelleReport} className="inline-flex items-center gap-2 border border-blue-200 text-blue-800 text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Baustelle melden</button></div><p className="text-sm text-gray-500 mt-1">Wird von der Zentrale geprüft und dort auf der Karte bestätigt.</p></section>
    </div> : null}

    <nav className="flex gap-1.5 overflow-x-auto pb-2 mb-5" aria-label="Bereiche des Außendienstes">{TABS.map(tab => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex items-center gap-2 whitespace-nowrap border px-3 py-2 rounded-xl text-sm font-medium ${activeTab === tab.id ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}><Icon className="w-4 h-4" />{tab.label}</button> })}</nav>

    {!loading && activeTab === 'einsaetze' ? <EntryOrIncidentList kind="incidents" incidents={incidents} /> : null}
    {!loading && activeTab === 'kontrollauftraege' ? <div>
      {isGenehmiger ? <div className="mb-3 flex justify-end"><button type="button" onClick={openNewAuftrag} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Kontrollauftrag</button></div> : null}
      <EntryOrIncidentList kind="entries" entries={kontrollauftraege} canManage={isGenehmiger} onEdit={openEditAuftrag} />
    </div> : null}
    {!loading && activeTab === 'hinweise' ? <div className="space-y-4">
      <EntryOrIncidentList kind="entries" entries={entries.filter(item => item.category === 'lage')} />
      {avBv.length === 0 && fahndungen.length === 0 ? null : <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
        {avBv.map(item => <article key={item.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900">{AV_BV_ART_LABEL[item.art]} · {(item.person ? personDisplayName(item.person) : (item.object?.address ?? item.gebiet ?? 'ohne Zuordnung'))}</h3><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.priority === 'kritisch' ? 'bg-red-100 text-red-800' : item.priority === 'hoch' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>{item.priority}</span></div><p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{item.grund}</p></article>)}
        {fahndungen.map(item => <article key={item.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900">Fahndung ({FAHNDUNG_ART_LABEL[item.art]}) · {(item.person ? personDisplayName(item.person) : (item.object?.address ?? 'ohne Zuordnung'))}</h3><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.priority === 'kritisch' ? 'bg-red-100 text-red-800' : item.priority === 'hoch' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>{item.priority}</span></div><p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{item.beschreibung}</p></article>)}
      </div>}
    </div> : null}
    {!loading && activeTab === 'fahrzeug' ? (ownVehicle ? <div className="rounded-2xl border border-gray-200 bg-white p-5"><h2 className="font-bold text-gray-900">{ownVehicle.name}</h2><dl className="text-sm mt-3 space-y-1.5"><div className="flex justify-between"><dt className="text-gray-500">Rufname</dt><dd className="font-medium">{ownVehicle.call_sign || '–'}</dd></div><div className="flex justify-between"><dt className="text-gray-500">Kennzeichen</dt><dd className="font-medium">{ownVehicle.license_plate || '–'}</dd></div><div className="flex justify-between"><dt className="text-gray-500">Marke/Modell</dt><dd className="font-medium">{[ownVehicle.make, ownVehicle.model].filter(Boolean).join(' ') || '–'}</dd></div></dl><Link to={`/fuhrpark/${ownVehicle.id}`} className="inline-block mt-4 text-sm font-semibold text-blue-700">Fahrzeugdetails im Fuhrpark →</Link></div> : <Empty text="Kein Fahrzeug zugewiesen." />) : null}

    {showAuftragForm ? <AuftragModal auftrag={auftrag} setAuftrag={setAuftrag} editing={editingAuftrag} saving={saving} error={auftragError} close={() => setShowAuftragForm(false)} save={saveAuftrag} remove={deleteAuftrag} /> : null}
    {showBaustelleForm ? <BaustelleReportModal report={baustelleReport} setReport={setBaustelleReport} saving={baustelleSaving} error={baustelleError} close={() => setShowBaustelleForm(false)} save={saveBaustelleReport} /> : null}
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

// Rein textuelle Meldung ohne Kartenzeichnen - die genaue Streckenmarkierung
// (und Bestätigung) erfolgt in der Zentrale, siehe Zentrale.tsx BaustelleModal.
function BaustelleReportModal({ report, setReport, saving, error, close, save }: { report: BaustelleReportState; setReport: Dispatch<SetStateAction<BaustelleReportState>>; saving: boolean; error: string; close: () => void; save: () => Promise<void> }) {
  const patch = (values: Partial<BaustelleReportState>) => setReport(current => ({ ...current, ...values }))
  return <Modal title="Baustelle melden" close={close}>
    <Field label="Bezeichnung *" value={report.titel} onChange={value => patch({ titel: value })} />
    <Field label="Standort (Straße/Adresse) *" value={report.startAddress} onChange={value => patch({ startAddress: value })} />
    <Field label="Bis (optional, bei längerem Streckenabschnitt)" value={report.endAddress} onChange={value => patch({ endAddress: value })} />
    <Area label="Bemerkung (optional)" value={report.note} onChange={value => patch({ note: value })} />
    <p className="text-xs text-gray-500">Die Meldung wird als „ungeprüft“ gespeichert, bis die Zentrale sie bestätigt.</p>
    {error ? <ErrorMessage text={error} /> : null}
    <Actions saving={saving} close={close} save={save} />
  </Modal>
}
