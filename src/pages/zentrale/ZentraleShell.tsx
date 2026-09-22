import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Link, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import { geocodeLocation } from '../../lib/geocode'
import { parseKilometerLocation } from '../../lib/roadKilometer'
import type { DutyAssignment, DutyShift, IncidentReport, OperationalPerson, OperationalPersonNote, StrassenzustandBerichtzeile, ZentraleAvBv, ZentraleEntry, ZentraleEntryCategory } from '../../lib/types'
import { EntryModal } from '../../components/ZentraleEntryEditor'
import { EMPTY_ENTRY_FORM, entryToForm, type EntryFormState } from '../../lib/zentraleEntries'
import { personDisplayName, usePersons } from '../../lib/register'
import { aktiveSperren, strassenName } from '../../lib/strassenzustand'
import { useOwnOperativBereicheToday } from '../../lib/dutyAccess'
import { IncidentModal } from './zentraleShared'
import { DISPOSITION_LABEL, EMPTY_INCIDENT_FORM, formatTime, locationParts, operationalToday, startOfOperationalDayIso, type IncidentFormState } from '../../lib/zentraleShared'
import { loadErrorMessage, withTimeout } from '../../lib/loadTimeout'

function normalizeText(value: string | null | undefined) { return (value ?? '').toLocaleLowerCase('de-AT').replace(/straße/g, 'strasse').replace(/str\./g, 'strasse').replace(/[^a-z0-9äöüß]+/g, ' ').trim() }
function normalizePhone(value: string | null | undefined) { return (value ?? '').replace(/\D/g, '') }
function addressesMatch(a: string, b: string): boolean {
  const wordsA = normalizeText(a).split(' ').filter(Boolean)
  const wordsB = normalizeText(b).split(' ').filter(Boolean)
  if (wordsA.length === 0 || wordsB.length === 0) return false
  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA]
  return shorter.every(word => longer.includes(word))
}
const CATEGORY_LABEL: Record<ZentraleEntryCategory, string> = { lage: 'Operative Lage', kontrollauftrag: 'Kontrollauftrag', brief: 'RSa/RSb', uebergabe: 'Schichtübergabe' }

export interface ZentraleContext {
  canManage: boolean
  canOperateZentrale: boolean
  loading: boolean
  entries: ZentraleEntry[]
  lageEntries: ZentraleEntry[]
  lageByIncidentId: Record<string, ZentraleEntry>
  incidentsById: Record<string, Pick<IncidentReport, 'reported_at' | 'location' | 'summary'>>
  visibleIncidents: IncidentReport[]
  openIncidents: IncidentReport[]
  uebergabeIncidents: IncidentReport[]
  openIncidentMarkers: { lat: number; lng: number; popup: string }[]
  sperrenLines: { points: readonly [number, number][]; popup?: string; color?: string; dashed?: boolean }[]
  criticalEntries: ZentraleEntry[]
  criticalAvBv: ZentraleAvBv[]
  criticalStrassensperren: StrassenzustandBerichtzeile[]
  criticalSourcesError: boolean
  openIncident: () => void
  openEditIncident: (item: IncidentReport) => void
  openLageForIncident: (item: IncidentReport) => void
  openEditEntry: (item: ZentraleEntry) => void
  completeIncident: (item: IncidentReport) => Promise<void>
  deleteIncident: (item: IncidentReport) => Promise<void>
  patrolVehicles: { id: string; name: string; call_sign: string | null; license_plate: string | null; function: 'jd' | 'vd' }[]
  setIncidentHandling: (item: IncidentReport, mode: 'offen' | 'zentrale' | 'bp' | 'streife', vehicleId?: string) => Promise<void>
  persons: OperationalPerson[]
  onPersonCreated: (person: OperationalPerson) => void
  createdBy: string | null
}

export default function ZentraleShell() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const { bereiche: eigeneBereicheHeute } = useOwnOperativBereicheToday(profile?.id)
  const navigate = useNavigate()
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManage = isStrictAdmin || isGenehmiger || roles.some(role => ['sachbearbeiter', 'admin'].includes(role))
  const [entries, setEntries] = useState<ZentraleEntry[]>([])
  const [assignments, setAssignments] = useState<DutyAssignment[]>([])
  const [incidents, setIncidents] = useState<IncidentReport[]>([])
  const [openIncidentsAllDays, setOpenIncidentsAllDays] = useState<IncidentReport[]>([])
  const [personNotes, setPersonNotes] = useState<OperationalPersonNote[]>([])
  const [avBvOpen, setAvBvOpen] = useState<ZentraleAvBv[]>([])
  const [strassenzustandZeilen, setStrassenzustandZeilen] = useState<StrassenzustandBerichtzeile[]>([])
  const [criticalSourcesError, setCriticalSourcesError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [editing, setEditing] = useState<ZentraleEntry | null>(null)
  const [entry, setEntry] = useState<EntryFormState>(EMPTY_ENTRY_FORM)
  const [dutyShift, setDutyShift] = useState<DutyShift>('tag')
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [editingIncident, setEditingIncident] = useState<IncidentReport | null>(null)
  const [incident, setIncident] = useState<IncidentFormState>(EMPTY_INCIDENT_FORM)
  const { persons, setPersons } = usePersons()
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState('')
  const [priorIncidents, setPriorIncidents] = useState<IncidentReport[]>([])
  const priorIncidentsRequestRef = useRef(0)
  const [editingLinkedIncident, setEditingLinkedIncident] = useState<IncidentReport | null>(null)

  const ownAssignment = assignments.find(item => item.user_id === profile?.id && item.duty_date === operationalToday())
  const canOperateZentrale = canManage || ownAssignment?.function === 'zentrale' || ownAssignment?.function === 'innendienst'

  const load = useCallback(async () => {
    setLoading(true)
    const today = operationalToday()
    const [entryResult, dutyResult, incidentResult, openIncidentResult, personResult, avBvResult, strassenzustandResult] = await Promise.all([
      supabase.from('zentrale_entries').select('*').neq('category', 'kontrollauftrag').order('priority').order('updated_at', { ascending: false }),
      supabase.from('duty_assignments').select('*, profiles(id,name,dienstnummer), fleet_vehicles(id,name,call_sign,license_plate)').eq('duty_date', today).order('function'),
      supabase.from('incident_reports').select('*').gte('reported_at', startOfOperationalDayIso()).order('reported_at', { ascending: false }),
      supabase.from('incident_reports').select('*').eq('status', 'offen').order('reported_at', { ascending: true }),
      supabase.from('operational_person_notes').select('*, person:operational_persons(id,vorname,nachname,birth_date,phone)').eq('active', true).order('updated_at', { ascending: false }),
      supabase.from('zentrale_av_bv').select('*, person:operational_persons(id,vorname,nachname,birth_date), object:operational_objects(id,address,label)').eq('status', 'offen'),
      supabase.from('strassenzustand_berichtzeilen').select('*, strassenzustand_strassen(name,start_lat,start_lng,end_lat,end_lng,path)').order('created_at', { ascending: false }),
    ])
    if (entryResult.error || dutyResult.error || incidentResult.error || openIncidentResult.error) setError('Die Informationen der Zentrale konnten nicht vollständig geladen werden.')
    else setError('')
    setEntries((entryResult.data ?? []) as ZentraleEntry[])
    setAssignments((dutyResult.data ?? []) as unknown as DutyAssignment[])
    setIncidents((incidentResult.data ?? []) as IncidentReport[])
    setOpenIncidentsAllDays((openIncidentResult.data ?? []) as IncidentReport[])
    setPersonNotes(personResult.error ? [] : (personResult.data ?? []) as unknown as OperationalPersonNote[])
    setAvBvOpen(avBvResult.error ? [] : (avBvResult.data ?? []) as unknown as ZentraleAvBv[])
    setStrassenzustandZeilen(strassenzustandResult.error ? [] : (strassenzustandResult.data ?? []) as unknown as StrassenzustandBerichtzeile[])
    setCriticalSourcesError(Boolean(avBvResult.error || strassenzustandResult.error))
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (ownAssignment) setDutyShift(ownAssignment.shift) }, [ownAssignment])

  const patrolVehicles = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; call_sign: string | null; license_plate: string | null; function: 'jd' | 'vd' }>()
    for (const item of assignments) {
      if (!item.vehicle_id || !item.fleet_vehicles || (item.function !== 'jd' && item.function !== 'vd') || seen.has(item.vehicle_id)) continue
      seen.set(item.vehicle_id, { ...item.fleet_vehicles, function: item.function })
    }
    return [...seen.values()]
  }, [assignments])
  const lageEntries = useMemo(() => entries.filter(item => item.category === 'lage'), [entries])
  const criticalEntries = useMemo(() => entries.filter(item => item.status !== 'erledigt' && item.priority === 'kritisch'), [entries])
  const uebergabeIncidents = openIncidentsAllDays
  const visibleIncidents = useMemo(() => {
    if (ownAssignment?.function === 'jd') return incidents.filter(item => item.disposition === 'jd')
    if (ownAssignment?.function === 'vd') return incidents.filter(item => item.disposition === 'vd')
    return incidents
  }, [incidents, ownAssignment?.function])
  const openIncidents = useMemo(() => {
    if (ownAssignment?.function === 'jd') return openIncidentsAllDays.filter(item => item.disposition === 'jd')
    if (ownAssignment?.function === 'vd') return openIncidentsAllDays.filter(item => item.disposition === 'vd')
    return openIncidentsAllDays
  }, [openIncidentsAllDays, ownAssignment?.function])
  const lageIncidentOptions = useMemo(() => {
    const byId = new Map(incidents.map(item => [item.id, item]))
    for (const item of openIncidentsAllDays) if (!byId.has(item.id)) byId.set(item.id, item)
    if (editingLinkedIncident && !byId.has(editingLinkedIncident.id)) byId.set(editingLinkedIncident.id, editingLinkedIncident)
    return [...byId.values()]
  }, [incidents, openIncidentsAllDays, editingLinkedIncident])
  const incidentsById = useMemo(() => Object.fromEntries(lageIncidentOptions.map(item => [item.id, item])), [lageIncidentOptions])
  const lageByIncidentId = useMemo(() => {
    const map: Record<string, ZentraleEntry> = {}
    for (const item of entries) if (item.category === 'lage' && item.incident_id) map[item.incident_id] = item
    return map
  }, [entries])
  const openIncidentMarkers = useMemo(() => openIncidentsAllDays
    .filter(item => item.location_lat !== null && item.location_lng !== null)
    .map(item => ({ lat: item.location_lat as number, lng: item.location_lng as number, popup: `${formatTime(item.reported_at)} – ${item.location || item.summary.slice(0, 40)}` })), [openIncidentsAllDays])
  const involvedOrCallerPersonIds = useMemo(() => [incident.callerPersonId, incident.involvedPersonId].filter((value): value is string => !!value), [incident.callerPersonId, incident.involvedPersonId])
  const contextEntries = useMemo(() => {
    const place = incident.location.trim(), phone = normalizePhone(incident.callerPhone)
    const callerPerson = persons.find(item => item.id === incident.callerPersonId)
    const name = normalizeText(callerPerson ? personDisplayName(callerPerson) : '')
    if (!place && !phone && name.length < 3) return []
    return entries.filter(item => item.status !== 'erledigt' && ((place.length >= 4 && addressesMatch(place, item.location ?? '')) || (phone.length >= 5 && normalizePhone(item.reference).includes(phone)) || (name.length >= 3 && normalizeText(`${item.title} ${item.responsible ?? ''}`).includes(name))))
  }, [entries, incident.callerPersonId, incident.callerPhone, incident.location, persons])
  const contextPersonNotes = useMemo(() => {
    const phone = normalizePhone(incident.callerPhone), place = incident.location.trim()
    return personNotes.filter(item =>
      (item.person_id && involvedOrCallerPersonIds.includes(item.person_id))
      || (phone.length >= 5 && normalizePhone(item.person?.phone) === phone)
      || (place.length >= 4 && addressesMatch(place, item.location ?? '')))
  }, [incident.callerPhone, incident.location, involvedOrCallerPersonIds, personNotes])
  const contextAvBv = useMemo(() => {
    const place = incident.location.trim()
    return avBvOpen.filter(item => (item.person_id && involvedOrCallerPersonIds.includes(item.person_id))
      || (place.length >= 4 && addressesMatch(place, item.object?.address ?? item.gebiet ?? '')))
  }, [avBvOpen, incident.location, involvedOrCallerPersonIds])
  const criticalAvBv = useMemo(() => avBvOpen.filter(item => item.priority === 'kritisch'), [avBvOpen])
  const criticalStrassensperren = useMemo(() => aktiveSperren(strassenzustandZeilen), [strassenzustandZeilen])
  const sperrenLines = useMemo(() => criticalStrassensperren
    .filter(zeile => zeile.zustand === 'gesperrt' && zeile.strassenzustand_strassen?.start_lat != null && zeile.strassenzustand_strassen.start_lng != null && zeile.strassenzustand_strassen.end_lat != null && zeile.strassenzustand_strassen.end_lng != null)
    .map(zeile => {
      const strasse = zeile.strassenzustand_strassen!
      return {
        points: strasse.path && strasse.path.length >= 2 ? strasse.path : [[strasse.start_lat as number, strasse.start_lng as number], [strasse.end_lat as number, strasse.end_lng as number]] as readonly [number, number][],
        popup: `${strassenName(zeile)} · Gesperrt`,
        color: '#dc2626',
      }
    }), [criticalStrassensperren])
  useEffect(() => {
    const requestId = ++priorIncidentsRequestRef.current
    if (!showIncidentForm) { setPriorIncidents([]); return }
    const street = incident.street.trim()
    if (street.length < 3) { setPriorIncidents([]); return }
    const escaped = street.replace(/[\\%_]/g, char => `\\${char}`)
    const targetAddress = incident.location.trim()
    const timer = setTimeout(() => {
      void supabase.from('incident_reports').select('*').ilike('location', `%${escaped}%`).order('reported_at', { ascending: false }).limit(20).then(result => {
        if (priorIncidentsRequestRef.current !== requestId) return
        const candidates = result.error ? [] : (result.data ?? []) as IncidentReport[]
        setPriorIncidents(candidates.filter(item => addressesMatch(targetAddress, item.location ?? '')).slice(0, 5))
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [incident.street, incident.location, showIncidentForm])

  if (!hasAreaAccess('zentrale') && !isStrictAdmin && !eigeneBereicheHeute.has('zentrale')) return <Navigate to="/" replace />

  function openLageForIncident(incidentItem: IncidentReport) {
    const existing = lageByIncidentId[incidentItem.id]
    if (existing) { navigate('/zentrale/lage'); openEditEntry(existing); return }
    setEditing(null)
    setEntry({ ...EMPTY_ENTRY_FORM, incidentId: incidentItem.id, location: incidentItem.location ?? '' })
    setShowEntryForm(true)
    setError('')
    setEditingLinkedIncident(incidentItem)
  }
  function openEditEntry(item: ZentraleEntry) {
    setEditing(item); setEntry(entryToForm(item)); setShowEntryForm(true); setError('')
    setEditingLinkedIncident(null)
    if (item.category === 'lage' && item.incident_id && !incidents.some(row => row.id === item.incident_id) && !openIncidentsAllDays.some(row => row.id === item.incident_id)) {
      void supabase.from('incident_reports').select('*').eq('id', item.incident_id).maybeSingle().then(({ data }) => { if (data) setEditingLinkedIncident(data as IncidentReport) })
    }
  }

  async function saveEntry() {
    if (!entry.title.trim()) { setError('Bitte eine Bezeichnung eingeben.'); return }
    const category: ZentraleEntryCategory = editing?.category ?? 'lage'
    if (category === 'lage' && !entry.incidentId) { setError('Bitte die auslösende Einsatzmeldung wählen.'); return }
    setSaving(true)
    try {
      const payload = { category, title: entry.title.trim(), description: entry.description.trim() || null, priority: entry.priority, status: entry.status, valid_from: entry.validFrom || null, valid_until: entry.validUntil || null, location: entry.location.trim() || null, responsible: entry.responsible.trim() || null, reference: entry.reference.trim() || null, restricted: entry.restricted, incident_id: category === 'lage' ? entry.incidentId : null }
      const response = editing ? await withTimeout(supabase.from('zentrale_entries').update(payload).eq('id', editing.id)) : await withTimeout(supabase.from('zentrale_entries').insert({ ...payload, created_by: profile?.id ?? null }))
      if (response.error) { setError('Eintrag konnte nicht gespeichert werden.'); return }
      logAudit(editing ? 'Zentraleintrag bearbeitet' : 'Zentraleintrag angelegt', `${CATEGORY_LABEL[category]} · ${entry.title.trim()}`); setShowEntryForm(false); setNotice('Eintrag wurde gespeichert.'); await load()
    } catch (err) {
      setError(loadErrorMessage(err, 'Eintrag konnte nicht gespeichert werden.'))
    } finally {
      setSaving(false)
    }
  }
  async function deleteEntry() { if (!editing || !window.confirm(`Eintrag „${editing.title}“ endgültig löschen?`)) return; const result = await supabase.from('zentrale_entries').delete().eq('id', editing.id); if (result.error) { setError('Eintrag konnte nicht gelöscht werden.'); return } logAudit('Zentraleintrag endgültig gelöscht', editing.title); setShowEntryForm(false); setNotice('Eintrag wurde endgültig gelöscht.'); await load() }

  function openIncident() {
    const now = new Date()
    setEditingIncident(null)
    setIncident({ ...EMPTY_INCIDENT_FORM, disposition: 'offen', assignedVehicleId: null, reportedTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` })
    setLocateError(''); setShowIncidentForm(true); setError('')
  }
  function openEditIncident(item: IncidentReport) {
    const reportedAt = new Date(item.reported_at)
    const kilometerLocation = parseKilometerLocation(item.location)
    const parsedLocation = locationParts(item.location)
    const { street, houseNumber } = kilometerLocation
      ? { street: kilometerLocation.roadName, houseNumber: '' }
      : { street: item.location_street ?? parsedLocation.street, houseNumber: item.location_house_number ?? parsedLocation.houseNumber }
    setEditingIncident(item)
    setIncident({
      callerPhone: item.caller_phone ?? '',
      callerPersonId: item.caller_person_id,
      callerOrg: item.caller_person_id ? '' : (item.caller_name ?? ''),
      assignedVehicleId: item.assigned_vehicle_id,
      locationMode: kilometerLocation ? 'kilometer' : 'address',
      street,
      houseNumber,
      houseNumberUnknown: Boolean(!kilometerLocation && street && !houseNumber),
      roadQuery: kilometerLocation ? `${kilometerLocation.roadName} (${kilometerLocation.roadNumber})` : '',
      roadNumber: kilometerLocation?.roadNumber ?? '',
      roadName: kilometerLocation?.roadName ?? '',
      kilometer: kilometerLocation?.kilometer ?? '',
      kilometerFrom: null,
      kilometerTo: null,
      location: item.location ?? '',
      reasonCode: item.reason_code ?? '',
      summary: item.summary,
      involvedPersonId: item.involved_person_id,
      disposition: item.disposition,
      note: item.note ?? '',
      lat: item.location_lat,
      lng: item.location_lng,
      coordsPrecise: item.location_lat !== null && item.location_lng !== null,
      reportedTime: `${String(reportedAt.getHours()).padStart(2, '0')}:${String(reportedAt.getMinutes()).padStart(2, '0')}`,
    })
    setLocateError(''); setShowIncidentForm(true); setError('')
  }
  async function locateIncident(queryOverride?: string) {
    const queried = (queryOverride ?? incident.location).trim()
    if (!queried) return
    setLocating(true); setLocateError('')
    const result = await geocodeLocation(queried)
    setLocating(false)
    if (!result) { setLocateError('Ort konnte nicht gefunden werden.'); return }
    setIncident(current => current.location.trim() === queried ? { ...current, lat: result.lat, lng: result.lng, coordsPrecise: true } : current)
  }
  async function saveIncident() {
    if (!profile?.id) return
    if (!incident.location.trim()) { setError('Bitte einen Einsatzort erfassen.'); return }
    if (!incident.summary.trim()) { setError('Bitte einen kurzen Sachverhalt eingeben.'); return }
    if (incident.locationMode === 'kilometer' && (!incident.roadNumber || !incident.kilometer || incident.lat === null || incident.lng === null || !incident.coordsPrecise)) {
      setError('Bitte Landesstraße und Kilometer auswählen und den amtlichen Kartenpunkt ermitteln.')
      return
    }
    const callerPerson = persons.find(item => item.id === incident.callerPersonId) ?? null
    const involvedPerson = persons.find(item => item.id === incident.involvedPersonId) ?? null
    const reportedAt = editingIncident ? new Date(editingIncident.reported_at) : new Date()
    if (incident.reportedTime) {
      const [hours, minutes] = incident.reportedTime.split(':').map(Number)
      if (!Number.isNaN(hours) && !Number.isNaN(minutes)) reportedAt.setHours(hours, minutes, 0, 0)
    }
    const status: IncidentReport['status'] = incident.disposition === 'bp'
      ? 'weitergegeben'
      : editingIncident?.status === 'erledigt' ? 'erledigt' : 'offen'
    const payload = {
      caller_phone: incident.callerPhone.trim() || null,
      caller_person_id: incident.callerOrg.trim() ? null : incident.callerPersonId,
      caller_name: incident.callerOrg.trim() ? incident.callerOrg.trim() : (callerPerson ? personDisplayName(callerPerson) : null),
      reason_code: incident.reasonCode || null,
      location: incident.location.trim() || null,
      location_street: incident.locationMode === 'address' ? (incident.street.trim() || null) : (incident.roadName.trim() || null),
      location_house_number: incident.locationMode === 'address' && !incident.houseNumberUnknown ? (incident.houseNumber.trim() || null) : null,
      location_lat: incident.lat, location_lng: incident.lng, summary: incident.summary.trim(),
      involved_person_id: incident.involvedPersonId, involved_person: involvedPerson ? personDisplayName(involvedPerson) : null, involved_birth_date: involvedPerson?.birth_date ?? null,
      disposition: incident.disposition, assigned_vehicle_id: incident.assignedVehicleId, note: incident.note.trim() || null, status,
      reported_at: reportedAt.toISOString(),
    }
    setSaving(true)
    try {
      const result = editingIncident
        ? await withTimeout(supabase.from('incident_reports').update(payload).eq('id', editingIncident.id))
        : await withTimeout(supabase.from('incident_reports').insert({ ...payload, created_by: profile.id }))
      if (result.error) { setError('Die Meldung konnte nicht gespeichert werden. Bitte heutige Funktion „Zentrale“ wählen.'); return }
      logAudit(editingIncident ? 'Einsatzmeldung bearbeitet' : 'Einsatzmeldung angelegt', `${DISPOSITION_LABEL[incident.disposition]} · ${incident.location.trim() || 'ohne Ortsangabe'}`)
      setEditingIncident(null); setShowIncidentForm(false); navigate('/zentrale/einsaetze'); setNotice(editingIncident ? 'Meldung wurde aktualisiert.' : 'Meldung wurde gespeichert.'); await load()
    } catch (err) {
      setError(loadErrorMessage(err, 'Die Meldung konnte nicht gespeichert werden.'))
    } finally {
      setSaving(false)
    }
  }
  async function setIncidentHandling(item: IncidentReport, mode: 'offen' | 'zentrale' | 'bp' | 'streife', vehicleId?: string) {
    if (item.taken_over_at && mode !== 'offen') {
      setError('Der Einsatz wurde bereits von einer Streife übernommen. Die Bearbeitung kann nicht stillschweigend überschrieben werden.')
      return
    }

    let disposition: IncidentReport['disposition'] = 'offen'
    let status: IncidentReport['status'] = 'offen'
    let assignedVehicleId: string | null = null

    if (mode === 'zentrale') disposition = 'zentrale'
    if (mode === 'bp') { disposition = 'bp'; status = 'weitergegeben' }
    if (mode === 'streife') {
      const patrol = patrolVehicles.find(vehicle => vehicle.id === vehicleId)
      if (!patrol) { setError('Bitte eine aktuell im Dienst befindliche Streife auswählen.'); return }
      disposition = patrol.function
      assignedVehicleId = patrol.id
    }

    const result = await supabase.from('incident_reports').update({
      disposition,
      status,
      assigned_vehicle_id: assignedVehicleId,
      ...(mode === 'offen' ? { taken_over_by: null, taken_over_at: null, taken_over_vehicle_id: null } : {}),
    }).eq('id', item.id)
    if (result.error) { setError('Die Bearbeitung konnte nicht geändert werden.'); return }

    const label = mode === 'zentrale' ? 'Zentrale'
      : mode === 'bp' ? 'Bundespolizei'
      : mode === 'streife' ? (patrolVehicles.find(vehicle => vehicle.id === vehicleId)?.call_sign || patrolVehicles.find(vehicle => vehicle.id === vehicleId)?.name || 'Streife')
      : 'offen'
    logAudit('Einsatzbearbeitung geändert', `${item.location ?? item.summary.slice(0, 60)} · ${label}`)
    setNotice(mode === 'bp' ? 'Meldung wurde an die Bundespolizei abgetreten.' : `Bearbeitung: ${label}.`)
    await load()
  }

  async function completeIncident(item: IncidentReport) { const result = await supabase.from('incident_reports').update({ status: 'erledigt' }).eq('id', item.id); if (result.error) { setError('Die Meldung konnte nicht abgeschlossen werden.'); return } setNotice('Meldung wurde als erledigt markiert.'); await load() }
  async function deleteIncident(item: IncidentReport) { if (!window.confirm('Diese Einsatzmeldung endgültig löschen?')) return; const result = await supabase.from('incident_reports').delete().eq('id', item.id); if (result.error) { setError('Die Einsatzmeldung konnte nicht gelöscht werden.'); return } logAudit('Einsatzmeldung endgültig gelöscht', item.location ?? item.summary.slice(0, 80)); await load() }

  const ctx: ZentraleContext = {
    canManage, canOperateZentrale, loading, entries, lageEntries, lageByIncidentId, incidentsById,
    visibleIncidents, openIncidents, uebergabeIncidents, patrolVehicles, setIncidentHandling, openIncidentMarkers, sperrenLines,
    criticalEntries, criticalAvBv, criticalStrassensperren, criticalSourcesError,
    openIncident, openEditIncident, openLageForIncident, openEditEntry, completeIncident, deleteIncident,
    persons, onPersonCreated: person => setPersons(current => [...current, person]), createdBy: profile?.id ?? null,
  }

  return <div>
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Zentrale</h1><p className="text-sm text-gray-500 mt-1">Relevante Informationen auf einen Blick – ergänzend zum Aktenprogramm.</p></div>{canOperateZentrale ? <div className="flex flex-col gap-2 w-full sm:w-auto"><button type="button" onClick={openIncident} className="inline-flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Neue Meldung</button><Link to="/zentrale/strassenzustand?neu=1" className="inline-flex items-center justify-center gap-2 border border-blue-300 text-blue-800 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-blue-50">Straßenzustandsbericht</Link></div> : null}</div>
    {error && !showEntryForm && !showIncidentForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : <Outlet context={ctx} />}
    {showIncidentForm ? <IncidentModal editing={Boolean(editingIncident)} incident={incident} setIncident={setIncident} persons={persons} onPersonCreated={person => setPersons(current => [...current, person])} createdBy={profile?.id ?? null} contextEntries={contextEntries} contextPersonNotes={contextPersonNotes} contextAvBv={contextAvBv} priorIncidents={priorIncidents} saving={saving} error={error} locating={locating} locateError={locateError} locate={locateIncident} close={() => { setEditingIncident(null); setShowIncidentForm(false) }} save={saveIncident} /> : null}
    {showEntryForm ? <EntryModal entry={entry} setEntry={setEntry} editing={editing} category="lage" incidents={lageIncidentOptions} saving={saving} error={error} close={() => setShowEntryForm(false)} save={saveEntry} remove={deleteEntry} /> : null}
  </div>
}
