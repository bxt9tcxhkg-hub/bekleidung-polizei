import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Link, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import { geocodeLocation, routeAlongRoad } from '../../lib/geocode'
import type { DutyAssignment, DutyFunctionConfig, FleetVehicle, IncidentDisposition, IncidentSupport, InnendienstRecord, VehicleCheck, VehicleCheckStatus, ZentraleBaustelle, ZentraleEntry } from '../../lib/types'
import { SCHUTZ_SELECT, type Schutzfall } from '../../lib/schutzmassnahmen'
import { locationParts, operationalToday, startOfOperationalDayIso } from '../../lib/zentraleShared'
import { parseKilometerLocation } from '../../lib/roadKilometer'
import { useOwnOperativBereicheToday } from '../../lib/dutyAccess'
import { EMPTY_AUFTRAG, EMPTY_BAUSTELLE_REPORT, type AuftragFormState, type BaustelleReportState } from '../../lib/aussendienstShared'
import { AuftragModal, BaustelleReportModal } from './aussendienstShared'

// Außendienst ist in eigenständige Sidebar-Seiten aufgeteilt (Übersicht,
// Einsätze, Kontrollaufträge, Operative Hinweise, Fahrzeug - kein
// Tab-Streifen mehr, Vorlage ist Bekleidung). Diese Hülle bündelt weiterhin
// die gemeinsamen Daten/Handler (ein Laden für alle Seiten), rendert Kopfzeile,
// Meldungen und Modals, und reicht den Rest über den Outlet-Context durch.

// location_lat/-lng zusätzlich zur Zentrale-Ansicht: damit sich eine Baustelle
// in der Nähe des Einsatzorts auch hier anzeigen lässt (siehe baustellen unten).
type SimpleIncident = {
  id: string; reported_at: string; reason_code: string | null; location: string | null; location_lat: number | null; location_lng: number | null; summary: string; disposition: IncidentDisposition; status: string; note: string | null
  caller_name: string | null; caller_phone: string | null; involved_person: string | null; involved_birth_date: string | null
  assigned_vehicle_id: string | null; taken_over_by: string | null; taken_over_at: string | null; taken_over_vehicle_id: string | null; completed_by: string | null; completed_at: string | null
  assigned_vehicle?: Pick<FleetVehicle, 'id' | 'name' | 'call_sign'> | null
  taken_over_by_profile?: { id: string; name: string } | null
}

export interface AussendienstContext {
  loading: boolean
  ownAssignment: DutyAssignment | undefined
  ownFunction: DutyFunctionConfig | undefined
  ownVehicle: FleetVehicle | undefined
  availableVehicles: FleetVehicle[]
  setDutyVehicle: (vehicleId: string) => Promise<void>
  ownCheck: VehicleCheck | undefined
  patrolMates: DutyAssignment[]
  criticalItems: { id: string; title: string; description: string | null }[]
  criticalSourcesError: boolean
  openIncidents: SimpleIncident[]
  ownIncidents: SimpleIncident[]
  supportedIncidents: SimpleIncident[]
  availableIncidents: SimpleIncident[]
  completedIncidents: SimpleIncident[]
  openOrders: ZentraleEntry[]
  kontrollauftraege: ZentraleEntry[]
  incidents: SimpleIncident[]
  entries: ZentraleEntry[]
  avBv: Schutzfall[]
  baustellen: ZentraleBaustelle[]
  heutigeBescheide: InnendienstRecord[]
  isGenehmiger: boolean
  saving: boolean
  checkNote: string
  setCheckNote: (value: string) => void
  showMangelForm: boolean
  setShowMangelForm: (value: boolean) => void
  saveVehicleCheck: (status: VehicleCheckStatus, note: string) => Promise<void>
  openNewAuftrag: () => void
  openEditAuftrag: (item: ZentraleEntry) => void
  toggleKontrollauftragErledigt: (item: ZentraleEntry) => Promise<void>
  openBaustelleReport: () => void
  patrolVehicles: { id: string; name: string; call_sign: string | null; license_plate: string | null }[]
  takeOverIncident: (id: string) => Promise<void>
  releaseIncidentTakeover: (id: string) => Promise<void>
  incidentSupports: IncidentSupport[]
  supportIncident: (id: string) => Promise<void>
  stopSupportingIncident: (id: string) => Promise<void>
  completeIncident: (id: string) => Promise<void>
  reopenIncident: (id: string) => Promise<void>
  bescheidZurueckziehen: (id: string) => Promise<void>
  incidentContextSummary: Record<string, { safety: number; attention: number }>
}

export default function AussendienstShell() {
  const { profile, hasAreaAccess, isGenehmiger, isStrictAdmin, areaRoles } = useAuth()
  const { bereiche: eigeneBereicheHeute } = useOwnOperativBereicheToday(profile?.id)
  const zentraleRoles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManageZentrale = isStrictAdmin || isGenehmiger || zentraleRoles.some(role => ['sachbearbeiter', 'admin'].includes(role))
  const [assignments, setAssignments] = useState<DutyAssignment[]>([])
  const [functions, setFunctions] = useState<DutyFunctionConfig[]>([])
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [checks, setChecks] = useState<VehicleCheck[]>([])
  const [entries, setEntries] = useState<ZentraleEntry[]>([])
  const [avBv, setAvBv] = useState<Schutzfall[]>([])
  const [baustellen, setBaustellen] = useState<ZentraleBaustelle[]>([])
  const [heutigeBescheide, setHeutigeBescheide] = useState<InnendienstRecord[]>([])
  // Wie in ZentraleShell.tsx: bei Ladefehler darf "Keine aktuell dringenden
  // Warnungen" nicht fälschlich Entwarnung geben.
  const [criticalSourcesError, setCriticalSourcesError] = useState(false)
  const [incidents, setIncidents] = useState<SimpleIncident[]>([])
  const [incidentSupports, setIncidentSupports] = useState<IncidentSupport[]>([])
  const [incidentContextSummary, setIncidentContextSummary] = useState<Record<string, { safety: number; attention: number }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [checkNote, setCheckNote] = useState('')
  const [showMangelForm, setShowMangelForm] = useState(false)
  const [showAuftragForm, setShowAuftragForm] = useState(false)
  const [editingAuftrag, setEditingAuftrag] = useState<ZentraleEntry | null>(null)
  const [auftrag, setAuftrag] = useState<AuftragFormState>(EMPTY_AUFTRAG)
  const [auftragError, setAuftragError] = useState('')
  const [auftragLocating, setAuftragLocating] = useState(false)
  const [auftragLocateError, setAuftragLocateError] = useState('')
  const [notice, setNotice] = useState('')
  const [showBaustelleForm, setShowBaustelleForm] = useState(false)
  const [baustelleReport, setBaustelleReport] = useState<BaustelleReportState>(EMPTY_BAUSTELLE_REPORT)
  const [baustelleSaving, setBaustelleSaving] = useState(false)
  const [baustelleError, setBaustelleError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const today = operationalToday()
    const [dutyResult, functionResult, vehicleResult, checkResult, entryResult, incidentResult, supportResult, avBvResult, baustelleResult, bescheidResult] = await Promise.all([
      supabase.from('duty_assignments').select('*, profiles(id,name,dienstnummer)').eq('duty_date', today),
      supabase.from('duty_functions').select('*'),
      supabase.from('fleet_vehicles').select('*').eq('active', true),
      supabase.from('vehicle_checks').select('*').eq('duty_date', today),
      supabase.from('zentrale_entries').select('*').order('priority').order('updated_at', { ascending: false }),
      supabase.from('incident_reports').select('id,reported_at,reason_code,location,location_lat,location_lng,summary,disposition,status,note,caller_name,caller_phone,involved_person,involved_birth_date,assigned_vehicle_id,taken_over_by,taken_over_at,taken_over_vehicle_id,completed_by,completed_at,assigned_vehicle:fleet_vehicles(id,name,call_sign),taken_over_by_profile:profiles!incident_reports_taken_over_by_fkey(id,name)').gte('reported_at', startOfOperationalDayIso()).order('reported_at', { ascending: false }),
      supabase.from('incident_supports').select('*, vehicle:fleet_vehicles(id,name,call_sign,license_plate)').gte('started_at', startOfOperationalDayIso()).order('started_at'),
      // Schutzmaßnahmen werden separat geladen; Fahndungen sind für den aktuellen Ausbaustand bewusst aus dem Außendienst-Kontext herausgenommen.
      supabase.from('schutzfaelle').select(SCHUTZ_SELECT).eq('status', 'aktiv').gt('ende', new Date().toISOString()).order('ende'),
      // Für "Baustelle in der Nähe" auf der Einsatzliste - erledigte Baustellen wie in der Zentrale ausgeblendet.
      supabase.from('zentrale_baustellen').select('*').neq('status', 'erledigt').order('created_at', { ascending: false }),
      supabase.from('innendienst_records').select('*, person:operational_persons(id,vorname,nachname,birth_date)').in('kind', ['bescheid_strassenmusik', 'bescheid_strassenkunst']).eq('issued_date', today).order('created_at'),
    ])
    if (dutyResult.error || entryResult.error) setError('Einige Informationen konnten nicht geladen werden.')
    else setError('')
    setAssignments((dutyResult.data ?? []) as unknown as DutyAssignment[])
    setFunctions((functionResult.data ?? []) as DutyFunctionConfig[])
    setVehicles((vehicleResult.data ?? []) as FleetVehicle[])
    setChecks((checkResult.data ?? []) as VehicleCheck[])
    setEntries((entryResult.data ?? []) as ZentraleEntry[])
    setIncidents(incidentResult.data ?? [])
    setIncidentSupports((supportResult.data ?? []) as IncidentSupport[])
    setAvBv(avBvResult.error ? [] : (avBvResult.data ?? []) as unknown as Schutzfall[])
    setBaustellen(baustelleResult.error ? [] : (baustelleResult.data ?? []) as ZentraleBaustelle[])
    setHeutigeBescheide(bescheidResult.error ? [] : (bescheidResult.data ?? []) as unknown as InnendienstRecord[])
    setCriticalSourcesError(Boolean(avBvResult.error))
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    let cancelled = false
    const active = incidents.filter(item => item.status === 'offen')
    if (active.length === 0) {
      setIncidentContextSummary({})
      return () => { cancelled = true }
    }
    void Promise.all(active.map(async item => {
      const { data, error } = await supabase.rpc('incident_context', { p_incident_id: item.id })
      if (error) return [item.id, { safety: 0, attention: 0 }] as const
      const rows = data ?? []
      return [item.id, {
        safety: rows.filter(row => row.severity === 'sicherheit').length,
        attention: rows.filter(row => row.severity === 'achtung').length,
      }] as const
    })).then(entries => {
      if (!cancelled) setIncidentContextSummary(Object.fromEntries(entries))
    })
    return () => { cancelled = true }
  }, [incidents])

  const ownAssignment = assignments.find(item => item.user_id === profile?.id)
  const ownFunction = functions.find(item => item.code === ownAssignment?.function)
  const ownVehicle = vehicles.find(item => item.id === ownAssignment?.vehicle_id)
  const availableVehicles = useMemo(() => vehicles.filter(item => item.operational_status === 'verfuegbar' || item.id === ownAssignment?.vehicle_id), [vehicles, ownAssignment?.vehicle_id])
  const ownCheck = checks.find(item => item.vehicle_id === ownAssignment?.vehicle_id && item.shift === ownAssignment?.shift)
  const patrolMates = useMemo(() => ownAssignment ? assignments.filter(item => item.user_id !== profile?.id && item.function === ownAssignment.function && item.shift === ownAssignment.shift) : [], [assignments, ownAssignment, profile?.id])
  const patrolVehicles = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; call_sign: string | null; license_plate: string | null }>()
    for (const item of assignments) if (item.vehicle_id && item.fleet_vehicles && !seen.has(item.vehicle_id)) seen.set(item.vehicle_id, item.fleet_vehicles)
    return [...seen.values()]
  }, [assignments])
  async function setDutyVehicle(vehicleId: string) {
    if (!ownAssignment) return
    const result = await supabase.from('duty_assignments').update({ vehicle_id: vehicleId || null }).eq('id', ownAssignment.id)
    if (result.error) { setError('Das Fahrzeug konnte nicht geändert werden.'); return }
    await load()
  }

  async function takeOverIncident(id: string) {
    const result = await supabase.rpc('take_over_incident', { p_id: id })
    if (result.error) { setError('Die Meldung konnte nicht übernommen werden.'); return }
    await load()
  }
  async function releaseIncidentTakeover(id: string) {
    const result = await supabase.rpc('release_incident_takeover', { p_id: id })
    if (result.error) { setError('Die Übernahme konnte nicht zurückgenommen werden.'); return }
    await load()
  }
  async function supportIncident(id: string) {
    const result = await supabase.rpc('support_incident', { p_id: id })
    if (result.error) { setError('Die Unterstützung konnte nicht eingetragen werden.'); return }
    await load()
  }
  async function stopSupportingIncident(id: string) {
    const result = await supabase.rpc('stop_supporting_incident', { p_id: id })
    if (result.error) { setError('Die Unterstützung konnte nicht beendet werden.'); return }
    await load()
  }
  async function completeIncident(id: string) {
    const result = await supabase.rpc('complete_incident', { p_id: id })
    if (result.error) { setError('Der Einsatz konnte nicht erledigt werden.'); return }
    await load()
  }
  async function reopenIncident(id: string) {
    const result = await supabase.rpc('reopen_incident', { p_id: id })
    if (result.error) { setError('Der Einsatz konnte nicht wieder geöffnet werden.'); return }
    await load()
  }
  async function bescheidZurueckziehen(id: string) {
    if (!window.confirm('Verstoß gegen die Auflagen festgestellt und diesen Bescheid zurückziehen?')) return
    setSaving(true)
    const result = await supabase.rpc('verstoss_gegen_bescheid_feststellen', { p_bescheid_id: id })
    setSaving(false)
    if (result.error) { setError('Der Verstoß konnte nicht dokumentiert werden.'); return }
    setNotice('Verstoß dokumentiert. Der Bescheid ist zurückgezogen.')
    await load()
  }

  const criticalEntries = useMemo(() => entries.filter(item => item.status !== 'erledigt' && item.priority === 'kritisch'), [entries])
  const criticalItems = useMemo(() => [
    ...criticalEntries.map(item => ({ id: item.id, title: item.title, description: item.description })),
  ], [criticalEntries])
  const openIncidents = useMemo(() => {
    const relevant = ownAssignment?.function === 'jd'
      ? incidents.filter(item => item.disposition === 'jd' || item.disposition === 'offen')
      : ownAssignment?.function === 'vd'
        ? incidents.filter(item => item.disposition === 'vd' || item.disposition === 'offen')
        : incidents
    return relevant.filter(item => item.status === 'offen')
  }, [incidents, ownAssignment?.function])
  const ownIncidents = useMemo(() => openIncidents.filter(item => {
    const primaryVehicleId = item.taken_over_vehicle_id || item.assigned_vehicle_id
    return Boolean((ownVehicle?.id && primaryVehicleId === ownVehicle.id) || item.taken_over_by === profile?.id)
  }), [openIncidents, ownVehicle, profile?.id])
  const supportedIncidentIds = useMemo(() => new Set(incidentSupports
    .filter(item => item.ended_at === null && item.vehicle_id === ownVehicle?.id)
    .map(item => item.incident_id)), [incidentSupports, ownVehicle])
  const supportedIncidents = useMemo(() => openIncidents.filter(item =>
    supportedIncidentIds.has(item.id) && !ownIncidents.some(own => own.id === item.id),
  ), [openIncidents, ownIncidents, supportedIncidentIds])
  const availableIncidents = useMemo(() => openIncidents.filter(item =>
    !item.assigned_vehicle_id && !item.taken_over_vehicle_id && !item.taken_over_by && !supportedIncidentIds.has(item.id),
  ), [openIncidents, supportedIncidentIds])
  const completedIncidents = useMemo(() => incidents.filter(item => {
    const primaryVehicleId = item.taken_over_vehicle_id || item.assigned_vehicle_id
    return item.status === 'erledigt' && Boolean((ownVehicle?.id && primaryVehicleId === ownVehicle.id) || item.completed_by === profile?.id)
  }), [incidents, ownVehicle, profile?.id])
  const ownFunctionOrders = useCallback((item: ZentraleEntry) => item.category === 'kontrollauftrag' && (!ownAssignment || item.target_function == null || item.target_function === 'beide' || item.target_function === ownAssignment.function), [ownAssignment])
  const openOrders = useMemo(() => {
    const priority = { kritisch: 0, hoch: 1, normal: 2 } as const
    return entries
      .filter(item => ownFunctionOrders(item) && item.status !== 'erledigt')
      .sort((a, b) => priority[a.priority] - priority[b.priority]
        || (a.valid_until ? new Date(a.valid_until).getTime() : Number.MAX_SAFE_INTEGER) - (b.valid_until ? new Date(b.valid_until).getTime() : Number.MAX_SAFE_INTEGER))
  }, [entries, ownFunctionOrders])
  const kontrollauftraege = useMemo(() => entries.filter(ownFunctionOrders), [entries, ownFunctionOrders])

  async function saveVehicleCheck(status: VehicleCheckStatus, note: string) {
    if (!profile?.id || !ownAssignment?.vehicle_id) return
    setSaving(true)
    const { error: checkError } = await supabase.from('vehicle_checks').upsert(
      { vehicle_id: ownAssignment.vehicle_id, duty_date: operationalToday(), shift: ownAssignment.shift, status, note: note.trim() || null, checked_by: profile.id },
      { onConflict: 'vehicle_id,duty_date,shift' },
    )
    setSaving(false)
    if (checkError) { setError('Die Kontrolle konnte nicht gespeichert werden.'); return }
    setShowMangelForm(false); setCheckNote(''); await load()
  }

  function openNewAuftrag() { setEditingAuftrag(null); setAuftrag(EMPTY_AUFTRAG); setAuftragError(''); setAuftragLocateError(''); setShowAuftragForm(true) }
  function openEditAuftrag(item: ZentraleEntry) {
    const kilometerLocation = parseKilometerLocation(item.location)
    const { street, houseNumber } = kilometerLocation
      ? { street: kilometerLocation.roadName, houseNumber: '' }
      : locationParts(item.location)
    setEditingAuftrag(item)
    setAuftrag({
      title: item.title, description: item.description ?? '',
      locationMode: kilometerLocation ? 'kilometer' : 'address',
      street, houseNumber,
      houseNumberUnknown: Boolean(!kilometerLocation && street && !houseNumber),
      roadQuery: kilometerLocation ? `${kilometerLocation.roadName} (${kilometerLocation.roadNumber})` : '',
      roadNumber: kilometerLocation?.roadNumber ?? '',
      roadName: kilometerLocation?.roadName ?? '',
      kilometer: kilometerLocation?.kilometer ?? '',
      kilometerFrom: null, kilometerTo: null,
      location: item.location ?? '', lat: item.location_lat, lng: item.location_lng, coordsPrecise: item.location_lat !== null,
      zeitfenster: item.zeitfenster ?? '', validFrom: item.valid_from?.slice(0, 10) ?? '', validUntil: item.valid_until?.slice(0, 10) ?? '',
      targetFunction: item.target_function ?? 'beide',
    })
    setAuftragError(''); setAuftragLocateError(''); setShowAuftragForm(true)
  }
  async function locateAuftrag(queryOverride?: string) {
    const queried = (queryOverride ?? auftrag.location).trim()
    if (!queried) return
    setAuftragLocating(true); setAuftragLocateError('')
    const result = await geocodeLocation(queried)
    setAuftragLocating(false)
    if (!result) { setAuftragLocateError('Ort konnte nicht gefunden werden.'); return }
    setAuftrag(current => current.location.trim() === queried ? { ...current, lat: result.lat, lng: result.lng, coordsPrecise: true } : current)
  }
  async function saveAuftrag() {
    if (!auftrag.title.trim()) { setAuftragError('Bitte eine Bezeichnung eingeben.'); return }
    if (auftrag.locationMode === 'kilometer' && (!auftrag.roadNumber || !auftrag.kilometer || auftrag.lat === null || auftrag.lng === null || !auftrag.coordsPrecise)) {
      setAuftragError('Bitte Landesstraße und Kilometer auswählen und den amtlichen Kartenpunkt ermitteln.')
      return
    }
    setSaving(true)
    const payload = { category: 'kontrollauftrag' as const, title: auftrag.title.trim(), description: auftrag.description.trim() || null, location: auftrag.location.trim() || null, location_lat: auftrag.lat, location_lng: auftrag.lng, zeitfenster: auftrag.zeitfenster.trim() || null, valid_from: auftrag.validFrom || null, valid_until: auftrag.validUntil || null, target_function: auftrag.targetFunction }
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
  // To-do-Charakter: mit einem Klick erledigt/wieder offen - die dabei
  // gespeicherte Uhrzeit ist keine Nachweis-Uhrzeit, nur eine Gedankenstütze
  // für die spätere Protokollierung im PAD. Ohne Genehmiger-Rolle lässt die
  // Datenbank ausschließlich diese beiden Felder ändern (siehe Migration).
  async function toggleKontrollauftragErledigt(item: ZentraleEntry) {
    const nowErledigt = item.status !== 'erledigt'
    const result = await supabase.from('zentrale_entries').update({ status: nowErledigt ? 'erledigt' : 'offen', erledigt_at: nowErledigt ? new Date().toISOString() : null }).eq('id', item.id)
    if (result.error) { setError('Der Status konnte nicht geändert werden.'); return }
    await load()
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

  if (!hasAreaAccess('zentrale') && !isStrictAdmin && !eigeneBereicheHeute.has('aussendienst')) return <Navigate to="/" replace />

  const ctx: AussendienstContext = {
    loading, ownAssignment, ownFunction, ownVehicle, availableVehicles, setDutyVehicle, ownCheck, patrolMates,
    criticalItems, criticalSourcesError, openIncidents, ownIncidents, supportedIncidents, availableIncidents, completedIncidents, openOrders, kontrollauftraege,
    incidents, entries, avBv, baustellen, heutigeBescheide, isGenehmiger,
    saving, checkNote, setCheckNote, showMangelForm, setShowMangelForm, saveVehicleCheck,
    openNewAuftrag, openEditAuftrag, toggleKontrollauftragErledigt, openBaustelleReport,
    patrolVehicles, takeOverIncident, releaseIncidentTakeover,
    incidentSupports, supportIncident, stopSupportingIncident, completeIncident, reopenIncident, bescheidZurueckziehen, incidentContextSummary,
  }

  return <div>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Außendienst / Streife</h1><p className="text-sm text-gray-500 mt-1">Tagesaktuelle Aufträge und Hilfsmittel – als Ergänzung zum Aktenprogramm.</p></div>
    {error ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : null}

    {!loading && !ownAssignment ? <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 mb-6"><div className="flex items-start gap-3"><AlertTriangle className="w-6 h-6 text-amber-700 flex-shrink-0" /><div><h2 className="font-bold text-gray-900">Noch keine Funktion für heute gewählt</h2><p className="text-sm text-gray-600 mt-1">Bitte zuerst auf der Portal-Startseite die heutige Funktion (z. B. JD oder VD) auswählen, um Streife, Fahrzeug und passende Aufträge zu sehen.</p><Link to="/" className="inline-block mt-3 text-sm font-semibold text-blue-700">Funktion jetzt wählen →</Link></div></div></div> : null}

    {!loading ? <Outlet context={ctx} /> : null}

    {showAuftragForm ? <AuftragModal auftrag={auftrag} setAuftrag={setAuftrag} editing={editingAuftrag} saving={saving} error={auftragError} locating={auftragLocating} locateError={auftragLocateError} locate={locateAuftrag} close={() => setShowAuftragForm(false)} save={saveAuftrag} remove={deleteAuftrag} /> : null}
    {showBaustelleForm ? <BaustelleReportModal report={baustelleReport} setReport={setBaustelleReport} saving={baustelleSaving} error={baustelleError} close={() => setShowBaustelleForm(false)} save={saveBaustelleReport} /> : null}
  </div>
}
