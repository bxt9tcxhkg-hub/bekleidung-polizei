import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import { geocodeLocation, routeAlongRoad } from '../../lib/geocode'
import type { DutyAssignment, DutyFunctionConfig, DutyShift, IncidentReport, OperationalPersonNote, ZentraleAvBv, ZentraleBaustelle, ZentraleEntry, ZentraleEntryCategory, ZentraleFahndung } from '../../lib/types'
import { EntryModal } from '../../components/ZentraleEntryEditor'
import { EMPTY_ENTRY_FORM, entryToForm, type EntryFormState } from '../../lib/zentraleEntries'
import { personDisplayName, usePersons } from '../../lib/register'
import { BaustelleModal, IncidentModal } from './zentraleShared'
import { DISPOSITION_LABEL, EMPTY_BAUSTELLE_FORM, EMPTY_INCIDENT_FORM, formatTime, type BaustelleFormState, type IncidentFormState } from '../../lib/zentraleShared'

// Zentrale ist in eigenständige Sidebar-Seiten aufgeteilt (Übersicht, Einsätze,
// Operative Lage - kein Tab-Streifen mehr, Vorlage ist Bekleidung). Diese
// Hülle bündelt weiterhin die gemeinsamen Daten/Handler (ein Laden für alle
// drei Seiten, wie zuvor), rendert Kopfzeile + Meldungen + alle Modals, und
// reicht den Rest über den Outlet-Context an die jeweilige Unterseite durch.

function todayLocal() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function normalizeText(value: string | null | undefined) { return (value ?? '').toLocaleLowerCase('de-AT').replace(/straße/g, 'strasse').replace(/str\./g, 'strasse').replace(/[^a-z0-9äöüß]+/g, ' ').trim() }
function normalizePhone(value: string | null | undefined) { return (value ?? '').replace(/\D/g, '') }
// Adressabgleich für Kontexthinweise: reiner Teilstringvergleich hätte einen
// Präfix-Konflikt ("Rohrbach 1" würde fälschlich auch zu "Rohrbach 10"
// passen) - sicherheitsrelevant, weil so ein AV/BV oder Personenhinweis der
// falschen Adresse zugeordnet werden könnte. Stattdessen Wortvergleich: jedes
// Wort der kürzeren Adresse muss als exaktes Wort in der längeren vorkommen -
// eine Adresse ohne Hausnummer (nur Straße) matcht weiterhin jede Hausnummer
// auf dieser Straße (bewusster Straßen-Fallback).
function addressesMatch(a: string, b: string): boolean {
  const wordsA = normalizeText(a).split(' ').filter(Boolean)
  const wordsB = normalizeText(b).split(' ').filter(Boolean)
  if (wordsA.length === 0 || wordsB.length === 0) return false
  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA]
  return shorter.every(word => longer.includes(word))
}
// Für die Prüfprotokoll-Meldung beim Speichern eines Eintrags.
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
  uebergabeIncidents: IncidentReport[]
  openIncidentMarkers: { lat: number; lng: number; popup: string }[]
  baustellen: ZentraleBaustelle[]
  baustellenLines: { points: readonly [number, number][]; popup?: string; color?: string; dashed?: boolean }[]
  assignments: DutyAssignment[]
  dutyFunctions: DutyFunctionConfig[]
  shiftAssignments: DutyAssignment[]
  dutyShift: DutyShift
  setDutyShift: (value: DutyShift) => void
  criticalEntries: ZentraleEntry[]
  criticalAvBv: ZentraleAvBv[]
  criticalFahndungen: ZentraleFahndung[]
  criticalSourcesError: boolean
  openIncident: () => void
  openLageForIncident: (item: IncidentReport) => void
  openEditEntry: (item: ZentraleEntry) => void
  completeIncident: (item: IncidentReport) => Promise<void>
  deleteIncident: (item: IncidentReport) => Promise<void>
  openNewBaustelle: () => void
  openEditBaustelle: (item: ZentraleBaustelle) => void
  confirmBaustelle: (item: ZentraleBaustelle) => Promise<void>
  closeBaustelle: (item: ZentraleBaustelle) => Promise<void>
  deleteBaustelle: (item: ZentraleBaustelle) => Promise<void>
}

export default function ZentraleShell() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const navigate = useNavigate()
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManage = isStrictAdmin || isGenehmiger || (operativeModeActive && roles.some(role => ['sachbearbeiter', 'admin'].includes(role)))
  const [entries, setEntries] = useState<ZentraleEntry[]>([])
  const [assignments, setAssignments] = useState<DutyAssignment[]>([])
  const [dutyFunctions, setDutyFunctions] = useState<DutyFunctionConfig[]>([])
  const [incidents, setIncidents] = useState<IncidentReport[]>([])
  const [openIncidentsAllDays, setOpenIncidentsAllDays] = useState<IncidentReport[]>([])
  const [personNotes, setPersonNotes] = useState<OperationalPersonNote[]>([])
  const [avBvOpen, setAvBvOpen] = useState<ZentraleAvBv[]>([])
  const [fahndungenOpen, setFahndungenOpen] = useState<ZentraleFahndung[]>([])
  // Wenn eine dieser beiden Quellen nicht geladen werden konnte, darf "Sofort
  // wichtig" NICHT stillschweigend Entwarnung geben - es könnten kritische
  // Verbote/Fahndungen existieren, die nur nicht geladen werden konnten.
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
  const [incident, setIncident] = useState<IncidentFormState>(EMPTY_INCIDENT_FORM)
  const { persons, setPersons } = usePersons()
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState('')
  const [priorIncidents, setPriorIncidents] = useState<IncidentReport[]>([])
  const priorIncidentsRequestRef = useRef(0)
  // Falls eine bestehende Lage an eine Einsatzmeldung gekoppelt ist, die weder
  // heute gemeldet noch mehr offen ist (z. B. Tage später bearbeitet), fehlt
  // sie in incidents/openIncidentsAllDays - dann gezielt nachladen, damit die
  // Auswahl und die Anzeige "Aus Einsatz: ..." sie trotzdem zeigen.
  const [editingLinkedIncident, setEditingLinkedIncident] = useState<IncidentReport | null>(null)
  // Baustellen-Markierungen auf der Karte - unabhängig vom Straßenzustandsbericht.
  // Jeder mit Zentrale-Zugriff kann eine Wahrnehmung melden; ohne canManage
  // entsteht sie als "gemeldet" (unbestätigt), bis Sachbearbeiter/Genehmiger
  // sie prüfen (siehe RLS: nur can_manage_zentrale() darf direkt "offen" anlegen).
  const [baustellen, setBaustellen] = useState<ZentraleBaustelle[]>([])
  const [showBaustelleForm, setShowBaustelleForm] = useState(false)
  const [editingBaustelle, setEditingBaustelle] = useState<ZentraleBaustelle | null>(null)
  const [baustelleForm, setBaustelleForm] = useState<BaustelleFormState>(EMPTY_BAUSTELLE_FORM)
  const [baustelleSaving, setBaustelleSaving] = useState(false)
  const [baustelleError, setBaustelleError] = useState('')
  const [baustelleLocating, setBaustelleLocating] = useState<'start' | 'end' | null>(null)
  const [baustelleRouting, setBaustelleRouting] = useState(false)
  const baustelleRouteRequestRef = useRef(0)

  const ownAssignment = assignments.find(item => item.user_id === profile?.id && item.duty_date === todayLocal())
  const canOperateZentrale = canManage || ownAssignment?.function === 'zentrale'

  const load = useCallback(async () => {
    setLoading(true)
    const today = todayLocal()
    // Kontrollaufträge betreffen nur die Streifen (JD/VD) und werden hier
    // bewusst nicht geladen – weder für die Seiten noch für "Sofort wichtig".
    const [entryResult, dutyResult, functionResult, incidentResult, openIncidentResult, personResult, avBvResult, fahndungResult, baustelleResult] = await Promise.all([
      supabase.from('zentrale_entries').select('*').neq('category', 'kontrollauftrag').order('priority').order('updated_at', { ascending: false }),
      supabase.from('duty_assignments').select('*, profiles(id,name,dienstnummer), fleet_vehicles(id,name,call_sign,license_plate)').eq('duty_date', today).order('function'),
      supabase.from('duty_functions').select('*').eq('active', true).order('sort_order').order('label'),
      supabase.from('incident_reports').select('*').gte('reported_at', `${today}T00:00:00`).order('reported_at', { ascending: false }),
      // Für die Übersichtskarte unabhängig vom Tagesfilter: Einsätze bleiben
      // teils über Mitternacht hinaus offen und müssen dort weiter auftauchen.
      supabase.from('incident_reports').select('*').eq('status', 'offen'),
      supabase.from('operational_person_notes').select('*, person:operational_persons(id,vorname,nachname,birth_date,phone)').eq('active', true).order('updated_at', { ascending: false }),
      // Offene AV/BV & EV sowie Fahndungen kommen jetzt aus eigenen Tabellen
      // (siehe ZentraleAvBv/ZentraleFahndungen) statt aus zentrale_entries -
      // hier für "Sofort wichtig" und den Kontextabgleich beim Erfassen einer
      // Einsatzmeldung geladen.
      supabase.from('zentrale_av_bv').select('*, person:operational_persons(id,vorname,nachname,birth_date), object:operational_objects(id,address,label)').eq('status', 'offen'),
      supabase.from('zentrale_fahndungen').select('*, person:operational_persons(id,vorname,nachname,birth_date), object:operational_objects(id,address,label)').eq('status', 'offen'),
      // Erledigte Baustellen werden nicht mehr auf der Karte/Liste gezeigt (wie erledigte Einsätze).
      supabase.from('zentrale_baustellen').select('*').neq('status', 'erledigt').order('created_at', { ascending: false }),
    ])
    if (entryResult.error || dutyResult.error || incidentResult.error || openIncidentResult.error) setError('Die Informationen der Zentrale konnten nicht vollständig geladen werden.')
    else setError('')
    setEntries((entryResult.data ?? []) as ZentraleEntry[])
    setAssignments((dutyResult.data ?? []) as unknown as DutyAssignment[])
    setDutyFunctions((functionResult.data ?? []) as DutyFunctionConfig[])
    setIncidents((incidentResult.data ?? []) as IncidentReport[])
    setOpenIncidentsAllDays((openIncidentResult.data ?? []) as IncidentReport[])
    setPersonNotes(personResult.error ? [] : (personResult.data ?? []) as unknown as OperationalPersonNote[])
    setAvBvOpen(avBvResult.error ? [] : (avBvResult.data ?? []) as unknown as ZentraleAvBv[])
    setFahndungenOpen(fahndungResult.error ? [] : (fahndungResult.data ?? []) as unknown as ZentraleFahndung[])
    setCriticalSourcesError(Boolean(avBvResult.error || fahndungResult.error))
    setBaustellen(baustelleResult.error ? [] : (baustelleResult.data ?? []) as ZentraleBaustelle[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (ownAssignment) setDutyShift(ownAssignment.shift) }, [ownAssignment])
  // Sobald Start und Ende feststehen, die Luftlinie im Formular durch den
  // tatsächlichen Straßenverlauf ersetzen (Routing-Dienst, best effort - bei
  // Fehlschlag bleibt es bei der Luftlinie). Generation-Zähler verhindert,
  // dass eine spät eintreffende Antwort eine inzwischen geänderte Auswahl überschreibt.
  useEffect(() => {
    const { startLat, startLng, endLat, endLng } = baustelleForm
    if (startLat === null || startLng === null || endLat === null || endLng === null) return
    const requestId = ++baustelleRouteRequestRef.current
    setBaustelleRouting(true)
    void routeAlongRoad({ lat: startLat, lng: startLng }, { lat: endLat, lng: endLng }).then(path => {
      if (baustelleRouteRequestRef.current !== requestId) return
      setBaustelleRouting(false)
      setBaustelleForm(current => current.startLat === startLat && current.startLng === startLng && current.endLat === endLat && current.endLng === endLng ? { ...current, path } : current)
    })
  }, [baustelleForm.startLat, baustelleForm.startLng, baustelleForm.endLat, baustelleForm.endLng])

  const lageEntries = useMemo(() => entries.filter(item => item.category === 'lage'), [entries])
  const criticalEntries = useMemo(() => entries.filter(item => item.status !== 'erledigt' && item.priority === 'kritisch'), [entries])
  // Schichtübergabe: kein eigener Eintrag, sondern die am Schichtende noch
  // offenen Einsatzmeldungen - das ist genau das, was an die nächste
  // Diensthabende Person weitergegeben werden muss. openIncidentsAllDays
  // (statt incidents, das auf heute gefiltert ist) verwenden, weil ein
  // offener Einsatz über Mitternacht hinaus sonst aus der Übergabe fällt.
  const uebergabeIncidents = openIncidentsAllDays
  const shiftAssignments = assignments.filter(item => item.shift === dutyShift)
  const vdAvailable = shiftAssignments.some(item => item.function === 'vd')
  const visibleIncidents = useMemo(() => {
    if (ownAssignment?.function === 'jd') return incidents.filter(item => item.disposition === 'jd')
    if (ownAssignment?.function === 'vd') return incidents.filter(item => item.disposition === 'vd')
    if (ownAssignment?.function === 'innendienst') return incidents.filter(item => item.disposition === 'keine_anfahrt')
    return incidents
  }, [incidents, ownAssignment?.function])
  // Für die Lage-Auswahl/-Anzeige: heutige UND über Mitternacht hinaus offene
  // Einsätze (sonst wählbar/sichtbar nur bis Mitternacht), plus - falls beim
  // Bearbeiten benötigt - eine gezielt nachgeladene, bereits geschlossene
  // Einsatzmeldung aus einem früheren Tag.
  const lageIncidentOptions = useMemo(() => {
    const byId = new Map(incidents.map(item => [item.id, item]))
    for (const item of openIncidentsAllDays) if (!byId.has(item.id)) byId.set(item.id, item)
    if (editingLinkedIncident && !byId.has(editingLinkedIncident.id)) byId.set(editingLinkedIncident.id, editingLinkedIncident)
    return [...byId.values()]
  }, [incidents, openIncidentsAllDays, editingLinkedIncident])
  const incidentsById = useMemo(() => Object.fromEntries(lageIncidentOptions.map(item => [item.id, item])), [lageIncidentOptions])
  // Eine Operative Lage hat immer genau einen auslösenden Einsatz - diese
  // Zuordnung entscheidet, ob ein Einsatz bereits eine Lage hat (dann öffnet
  // der Kartenbutton diese zum Bearbeiten) oder noch keine (dann legt er sie an).
  const lageByIncidentId = useMemo(() => {
    const map: Record<string, ZentraleEntry> = {}
    for (const item of entries) if (item.category === 'lage' && item.incident_id) map[item.incident_id] = item
    return map
  }, [entries])
  const openIncidentMarkers = useMemo(() => openIncidentsAllDays
    .filter(item => item.location_lat !== null && item.location_lng !== null)
    .map(item => ({ lat: item.location_lat as number, lng: item.location_lng as number, popup: `${formatTime(item.reported_at)} – ${item.location || item.summary.slice(0, 40)}` })), [openIncidentsAllDays])
  // Unbestätigte Meldungen ("gemeldet") gestrichelt/grau, bestätigte ("offen") durchgezogen/orange.
  const baustellenLines = useMemo(() => baustellen.map(item => ({
    // path folgt dem tatsächlichen Straßenverlauf (siehe routeAlongRoad) - ohne
    // berechnete Route (Dienst nicht erreichbar) ersatzweise die Luftlinie.
    points: item.path && item.path.length >= 2 ? item.path : [[item.start_lat, item.start_lng], [item.end_lat, item.end_lng]] as readonly [number, number][],
    popup: `${item.titel}${item.status === 'gemeldet' ? ' (ungeprüft)' : ''}`,
    color: item.status === 'gemeldet' ? '#9ca3af' : '#f97316',
    dashed: item.status === 'gemeldet',
  })), [baustellen])
  // Melder/beteiligte Person sind jetzt echte Verknüpfungen zum
  // Personen-Register (person_id-Gleichheit) statt Namens-/Geburtsdatum-
  // Textabgleich - eindeutig statt fehleranfällig. Der Adressabgleich bleibt
  // text-basiert (Objekte-Register ist hier noch nicht durchgängig verknüpft).
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
      // Adressabgleich zusätzlich: beim Anlegen einer Meldung ist oft nur der
      // Einsatzort bekannt, noch keine verknüpfte Person - z. B. "an dieser
      // Adresse wohnt eine gefährliche Person".
      || (place.length >= 4 && addressesMatch(place, item.location ?? '')))
  }, [incident.callerPhone, incident.location, involvedOrCallerPersonIds, personNotes])
  // AV/BV & EV und Fahndungen kommen jetzt aus eigenen Tabellen - derselbe
  // Verknüpfungs-/Adressabgleich wie bei Personenhinweisen, damit ein
  // Zentralist beim Erfassen einer Einsatzmeldung weiterhin sofort sieht, ob
  // zur Adresse oder Person bereits ein Verbot oder eine Fahndung vorliegt.
  const contextAvBv = useMemo(() => {
    const place = incident.location.trim()
    return avBvOpen.filter(item => (item.person_id && involvedOrCallerPersonIds.includes(item.person_id))
      || (place.length >= 4 && addressesMatch(place, item.object?.address ?? item.gebiet ?? '')))
  }, [avBvOpen, incident.location, involvedOrCallerPersonIds])
  const contextFahndungen = useMemo(() => {
    const place = incident.location.trim()
    return fahndungenOpen.filter(item => (item.person_id && involvedOrCallerPersonIds.includes(item.person_id))
      || (place.length >= 4 && addressesMatch(place, item.object?.address ?? '')))
  }, [fahndungenOpen, incident.location, involvedOrCallerPersonIds])
  const criticalAvBv = useMemo(() => avBvOpen.filter(item => item.priority === 'kritisch'), [avBvOpen])
  const criticalFahndungen = useMemo(() => fahndungenOpen.filter(item => item.priority === 'kritisch'), [fahndungenOpen])
  // Frühere Meldungen an derselben Adresse ("gab es dort schon mal was?") -
  // gezielte Datenbankabfrage statt Client-Filter, weil incident_reports über
  // die Zeit groß wird (anders als die überschaubaren zentrale_entries).
  useEffect(() => {
    // Generation IMMER erhöhen, auch bei frühem Abbruch - sonst könnte eine
    // noch laufende ältere Anfrage die Liste für die inzwischen geänderte
    // Straße/Adresse nachträglich wieder überschreiben.
    const requestId = ++priorIncidentsRequestRef.current
    if (!showIncidentForm) { setPriorIncidents([]); return }
    const street = incident.street.trim()
    if (street.length < 3) { setPriorIncidents([]); return }
    const escaped = street.replace(/[\\%_]/g, char => `\\${char}`)
    const targetAddress = incident.location.trim()
    const timer = setTimeout(() => {
      // Serverseitig nur grob auf die Straße vorgefiltert (ILIKE kann den
      // Präfix-Konflikt "Rohrbach 1" vs. "Rohrbach 10" nicht sauber
      // ausschließen) - hier per addressesMatch exakt auf die eingegebene
      // Adresse (inkl. Hausnummer, falls bekannt) verfeinert.
      void supabase.from('incident_reports').select('*').ilike('location', `%${escaped}%`).order('reported_at', { ascending: false }).limit(20).then(result => {
        if (priorIncidentsRequestRef.current !== requestId) return
        const candidates = result.error ? [] : (result.data ?? []) as IncidentReport[]
        setPriorIncidents(candidates.filter(item => addressesMatch(targetAddress, item.location ?? '')).slice(0, 5))
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [incident.street, incident.location, showIncidentForm])

  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  // Einzige Möglichkeit, eine Operative Lage anzulegen: ausgehend von einem
  // konkreten Einsatz (siehe IncidentCards) - nie unabhängig davon, sonst
  // wirkt es fälschlich so, als wäre die Lage ein eigenständiger Bereich.
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
    // Eine Operative Lage ist kein eigenständiger Bereich - sie ergibt sich
    // immer aus einer Einsatzmeldung (DB erzwingt das zusätzlich per CHECK).
    if (category === 'lage' && !entry.incidentId) { setError('Bitte die auslösende Einsatzmeldung wählen.'); return }
    setSaving(true)
    const payload = { category, title: entry.title.trim(), description: entry.description.trim() || null, priority: entry.priority, status: entry.status, valid_from: entry.validFrom || null, valid_until: entry.validUntil || null, location: entry.location.trim() || null, responsible: entry.responsible.trim() || null, reference: entry.reference.trim() || null, restricted: entry.restricted, incident_id: category === 'lage' ? entry.incidentId : null }
    const response = editing ? await supabase.from('zentrale_entries').update(payload).eq('id', editing.id) : await supabase.from('zentrale_entries').insert({ ...payload, created_by: profile?.id ?? null })
    setSaving(false)
    if (response.error) { setError('Eintrag konnte nicht gespeichert werden.'); return }
    logAudit(editing ? 'Zentraleintrag bearbeitet' : 'Zentraleintrag angelegt', `${CATEGORY_LABEL[category]} · ${entry.title.trim()}`); setShowEntryForm(false); setNotice('Eintrag wurde gespeichert.'); await load()
  }
  async function deleteEntry() { if (!editing || !window.confirm(`Eintrag „${editing.title}“ endgültig löschen?`)) return; const result = await supabase.from('zentrale_entries').delete().eq('id', editing.id); if (result.error) { setError('Eintrag konnte nicht gelöscht werden.'); return } logAudit('Zentraleintrag endgültig gelöscht', editing.title); setShowEntryForm(false); setNotice('Eintrag wurde endgültig gelöscht.'); await load() }

  function openIncident() { setIncident({ ...EMPTY_INCIDENT_FORM, disposition: vdAvailable ? 'vd' : 'jd' }); setLocateError(''); setShowIncidentForm(true); setError('') }
  async function locateIncident() {
    const queried = incident.location.trim()
    if (!queried) return
    setLocating(true); setLocateError('')
    const result = await geocodeLocation(queried)
    setLocating(false)
    if (!result) { setLocateError('Ort konnte nicht gefunden werden.'); return }
    // Falls der Ort während der Anfrage geändert wurde, gehört das Ergebnis nicht mehr dazu.
    setIncident(current => current.location.trim() === queried ? { ...current, lat: result.lat, lng: result.lng, coordsPrecise: true } : current)
  }
  async function saveIncident() {
    if (!profile?.id || !incident.summary.trim()) { setError('Bitte einen kurzen Sachverhalt eingeben.'); return }
    // Melder/beteiligte Person sind über das Personen-Register verknüpft;
    // Name/Geburtsdatum stecken abwärtskompatibel für bestehende Anzeigen
    // (z. B. IncidentCards) zusätzlich als Freitext auf der Meldung, aus der
    // verknüpften Person abgeleitet statt separat einzugeben.
    const callerPerson = persons.find(item => item.id === incident.callerPersonId) ?? null
    const involvedPerson = persons.find(item => item.id === incident.involvedPersonId) ?? null
    setSaving(true); const result = await supabase.from('incident_reports').insert({
      caller_phone: incident.callerPhone.trim() || null, caller_person_id: incident.callerPersonId, caller_name: callerPerson ? personDisplayName(callerPerson) : null,
      location: incident.location.trim() || null, location_lat: incident.lat, location_lng: incident.lng, summary: incident.summary.trim(),
      involved_person_id: incident.involvedPersonId, involved_person: involvedPerson ? personDisplayName(involvedPerson) : null, involved_birth_date: involvedPerson?.birth_date ?? null,
      disposition: incident.disposition, note: incident.note.trim() || null, status: incident.disposition === 'bp' ? 'weitergegeben' : 'offen', created_by: profile.id,
    }); setSaving(false)
    if (result.error) { setError('Die Meldung konnte nicht gespeichert werden. Bitte heutige Funktion „Zentrale“ wählen.'); return }
    logAudit('Einsatzmeldung angelegt', `${DISPOSITION_LABEL[incident.disposition]} · ${incident.location.trim() || 'ohne Ortsangabe'}`); setShowIncidentForm(false); navigate('/zentrale/einsaetze'); setNotice('Meldung wurde gespeichert.'); await load()
  }
  async function completeIncident(item: IncidentReport) { const result = await supabase.from('incident_reports').update({ status: 'erledigt' }).eq('id', item.id); if (result.error) { setError('Die Meldung konnte nicht abgeschlossen werden.'); return } setNotice('Meldung wurde als erledigt markiert.'); await load() }
  async function deleteIncident(item: IncidentReport) { if (!window.confirm('Diese Einsatzmeldung endgültig löschen?')) return; const result = await supabase.from('incident_reports').delete().eq('id', item.id); if (result.error) { setError('Die Einsatzmeldung konnte nicht gelöscht werden.'); return } logAudit('Einsatzmeldung endgültig gelöscht', item.location ?? item.summary.slice(0, 80)); await load() }

  function openNewBaustelle() { setEditingBaustelle(null); setBaustelleForm(EMPTY_BAUSTELLE_FORM); setBaustelleError(''); setShowBaustelleForm(true) }
  function openEditBaustelle(item: ZentraleBaustelle) {
    setEditingBaustelle(item)
    setBaustelleForm({ titel: item.titel, startAddress: '', endAddress: '', note: item.note ?? '', gueltigBis: item.gueltig_bis ?? '', startLat: item.start_lat, startLng: item.start_lng, endLat: item.end_lat, endLng: item.end_lng, path: item.path, drawMode: false })
    setBaustelleError(''); setShowBaustelleForm(true)
  }
  async function locateBaustelleStart() {
    const queried = baustelleForm.startAddress.trim()
    if (!queried) return
    setBaustelleLocating('start'); setBaustelleError('')
    const result = await geocodeLocation(queried)
    setBaustelleLocating(null)
    if (!result) { setBaustelleError('Startpunkt konnte nicht gefunden werden.'); return }
    setBaustelleForm(current => current.startAddress.trim() === queried ? { ...current, startLat: result.lat, startLng: result.lng } : current)
  }
  async function locateBaustelleEnd() {
    const queried = baustelleForm.endAddress.trim()
    if (!queried) return
    setBaustelleLocating('end'); setBaustelleError('')
    const result = await geocodeLocation(queried)
    setBaustelleLocating(null)
    if (!result) { setBaustelleError('Endpunkt konnte nicht gefunden werden.'); return }
    setBaustelleForm(current => current.endAddress.trim() === queried ? { ...current, endLat: result.lat, endLng: result.lng } : current)
  }
  // Erster Klick setzt (bzw. setzt neu, falls bereits beide Punkte vorhanden) den Startpunkt, der zweite den Endpunkt.
  function handleBaustelleMapClick(lat: number, lng: number) {
    setBaustelleForm(current => {
      if (!current.drawMode) return current
      if (current.startLat === null || current.startLng === null || (current.endLat !== null && current.endLng !== null)) return { ...current, startLat: lat, startLng: lng, endLat: null, endLng: null }
      return { ...current, endLat: lat, endLng: lng }
    })
  }
  async function saveBaustelle() {
    if (!profile?.id) return
    if (!baustelleForm.titel.trim()) { setBaustelleError('Bitte eine Bezeichnung eingeben.'); return }
    if (baustelleForm.startLat === null || baustelleForm.startLng === null || baustelleForm.endLat === null || baustelleForm.endLng === null) { setBaustelleError('Bitte Start- und Endpunkt festlegen (Adresse suchen oder auf der Karte klicken).'); return }
    setBaustelleSaving(true)
    const payload = { titel: baustelleForm.titel.trim(), start_lat: baustelleForm.startLat, start_lng: baustelleForm.startLng, end_lat: baustelleForm.endLat, end_lng: baustelleForm.endLng, path: baustelleForm.path, note: baustelleForm.note.trim() || null, gueltig_bis: baustelleForm.gueltigBis || null }
    // Ohne Verwaltungsrecht entsteht die Meldung immer als "gemeldet" (ungeprüft) -
    // die Bestätigung erfolgt separat durch Sachbearbeiter/Genehmiger (RLS erzwingt das zusätzlich).
    const response = editingBaustelle ? await supabase.from('zentrale_baustellen').update(payload).eq('id', editingBaustelle.id) : await supabase.from('zentrale_baustellen').insert({ ...payload, created_by: profile.id, status: canManage ? 'offen' : 'gemeldet' })
    setBaustelleSaving(false)
    if (response.error) { setBaustelleError('Baustelle konnte nicht gespeichert werden.'); return }
    logAudit(editingBaustelle ? 'Baustelle bearbeitet' : 'Baustelle gemeldet', baustelleForm.titel.trim())
    setShowBaustelleForm(false); setNotice(editingBaustelle ? 'Baustelle wurde aktualisiert.' : (canManage ? 'Baustelle wurde angelegt.' : 'Baustelle wurde gemeldet und wartet auf Prüfung.')); await load()
  }
  async function confirmBaustelle(item: ZentraleBaustelle) {
    if (!profile?.id) return
    const result = await supabase.from('zentrale_baustellen').update({ status: 'offen', confirmed_by: profile.id, confirmed_at: new Date().toISOString() }).eq('id', item.id)
    if (result.error) { setError('Baustelle konnte nicht bestätigt werden.'); return }
    logAudit('Baustelle bestätigt', item.titel); setNotice('Baustelle wurde bestätigt.'); await load()
  }
  async function closeBaustelle(item: ZentraleBaustelle) {
    const result = await supabase.from('zentrale_baustellen').update({ status: 'erledigt' }).eq('id', item.id)
    if (result.error) { setError('Baustelle konnte nicht abgeschlossen werden.'); return }
    logAudit('Baustelle abgeschlossen', item.titel); setNotice('Baustelle wurde als erledigt markiert.'); await load()
  }
  async function deleteBaustelle(item: ZentraleBaustelle) {
    if (!window.confirm(`Baustelle „${item.titel}“ endgültig löschen?`)) return
    const result = await supabase.from('zentrale_baustellen').delete().eq('id', item.id)
    if (result.error) { setError('Baustelle konnte nicht gelöscht werden.'); return }
    logAudit('Baustelle endgültig gelöscht', item.titel); setNotice('Baustelle wurde gelöscht.'); await load()
  }

  const ctx: ZentraleContext = {
    canManage, canOperateZentrale, loading, entries, lageEntries, lageByIncidentId, incidentsById,
    visibleIncidents, uebergabeIncidents, openIncidentMarkers, baustellen, baustellenLines,
    assignments, dutyFunctions, shiftAssignments, dutyShift, setDutyShift,
    criticalEntries, criticalAvBv, criticalFahndungen, criticalSourcesError,
    openIncident, openLageForIncident, openEditEntry, completeIncident, deleteIncident,
    openNewBaustelle, openEditBaustelle, confirmBaustelle, closeBaustelle, deleteBaustelle,
  }

  return <div>
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Zentrale</h1><p className="text-sm text-gray-500 mt-1">Relevante Informationen auf einen Blick – ergänzend zum Aktenprogramm.</p></div>{canOperateZentrale ? <button type="button" onClick={openIncident} className="inline-flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Neue Meldung</button> : null}</div>
    {error && !showEntryForm && !showIncidentForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : <Outlet context={ctx} />}

    {showIncidentForm ? <IncidentModal incident={incident} setIncident={setIncident} vdAvailable={vdAvailable} persons={persons} onPersonCreated={person => setPersons(current => [...current, person])} createdBy={profile?.id ?? null} contextEntries={contextEntries} contextPersonNotes={contextPersonNotes} contextAvBv={contextAvBv} contextFahndungen={contextFahndungen} priorIncidents={priorIncidents} saving={saving} error={error} locating={locating} locateError={locateError} locate={locateIncident} close={() => setShowIncidentForm(false)} save={saveIncident} /> : null}
    {showEntryForm ? <EntryModal entry={entry} setEntry={setEntry} editing={editing} category="lage" incidents={lageIncidentOptions} saving={saving} error={error} close={() => setShowEntryForm(false)} save={saveEntry} remove={deleteEntry} /> : null}
    {showBaustelleForm ? <BaustelleModal form={baustelleForm} setForm={setBaustelleForm} editing={editingBaustelle} canManage={canManage} saving={baustelleSaving} error={baustelleError} locating={baustelleLocating} routing={baustelleRouting} locateStart={locateBaustelleStart} locateEnd={locateBaustelleEnd} onMapClick={handleBaustelleMapClick} close={() => setShowBaustelleForm(false)} save={saveBaustelle} /> : null}
  </div>
}
