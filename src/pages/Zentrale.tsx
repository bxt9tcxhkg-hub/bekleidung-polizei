import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { AlertTriangle, CheckCircle2, LayoutDashboard, MapPin, Pencil, Plus, Radio, Trash2, UsersRound } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import { geocodeLocation, routeAlongRoad, type StreetSuggestion } from '../lib/geocode'
import LeafletMap, { type MapLine, type MapMarker } from '../components/LeafletMap'
import StreetAutocomplete from '../components/StreetAutocomplete'
import type { AvBvArt, DutyAssignment, DutyFunctionConfig, DutyShift, FahndungArt, IncidentDisposition, IncidentReport, OperationalPersonNote, OperationalPersonNoteCategory, ZentraleAvBv, ZentraleBaustelle, ZentraleEntry, ZentraleEntryCategory, ZentraleFahndung } from '../lib/types'
import { Actions, Area, Empty, EntryList, EntryModal, ErrorMessage, Field, Modal, inputClass } from '../components/ZentraleEntryEditor'
import { EMPTY_ENTRY_FORM, entryToForm, type EntryFormState } from '../lib/zentraleEntries'
import { personDisplayName } from '../lib/register'
import ZentraleStrassenzustand from './zentrale/ZentraleStrassenzustand'

// Auf der Zentrale-Hauptseite bleiben nur die Bereiche, die den Zentralisten
// im Tagesgeschäft unmittelbar betreffen. AV/BV & EV, Personenhinweise,
// Fahndungen, RSa/RSb, Schlüssel, Kontakte, Alarmierung und Unterlagen sind
// eigenständige Seiten in der Sidebar (siehe ZentraleLayout). Kontrollaufträge
// betreffen nur die Streifen (JD/VD) und werden dort im Außendienst verwaltet.
// Schichtübergabe ist kein eigener, manuell zu pflegender Eintrag: sie ergibt
// sich aus den am Schichtende noch offenen Einsatzmeldungen und steht dafür
// ganz unten in der Übersicht, direkt vor dem Schichtwechsel relevant.
type TabId = 'uebersicht' | 'einsaetze' | 'lage' | 'strassenzustand'
const TABS: { id: TabId; label: string; icon: typeof Radio; description: string }[] = [
  { id: 'uebersicht', label: 'Übersicht', icon: LayoutDashboard, description: 'Besetzung, offene Meldungen und relevante Informationen' },
  { id: 'einsaetze', label: 'Einsätze', icon: Radio, description: 'Meldungen schnell erfassen und disponieren' },
  { id: 'lage', label: 'Operative Lage', icon: Radio, description: 'Ereignisse, Sperren, Gefahren- und Lagehinweise' },
  { id: 'strassenzustand', label: 'Straßenzustand', icon: MapPin, description: 'Bericht erfassen, prüfen und als PDF versenden' },
]
const DISPOSITION_LABEL: Record<IncidentDisposition, string> = { jd: 'JD fährt an', vd: 'VD fährt an', bp: 'An Bundespolizei (BP) weitergegeben', keine_anfahrt: 'Keine Anfahrt erforderlich' }
const PERSON_NOTE_LABEL: Record<OperationalPersonNoteCategory, string> = { infektionsschutz: 'Infektionsschutz', aggressiv: 'Aggressives Verhalten', waffenverbot: 'Waffenverbot', fluchtgefahr: 'Fluchtgefahr', suizidgefahr: 'Suizidgefahr', sonstiges: 'Sonstiger Sicherheitshinweis' }
const AV_BV_ART_LABEL: Record<AvBvArt, string> = { amtsverbot: 'Amtsverbot', betretungsverbot: 'Betretungsverbot', einreiseverbot: 'Einreiseverbot' }
const FAHNDUNG_ART_LABEL: Record<FahndungArt, string> = { person: 'Person', fahrzeug: 'Fahrzeug', objekt: 'Objekt', sonstiges: 'Sonstiges' }
// Wohin ein Klick auf einen "Sofort wichtig"-Eintrag führt, dessen Kategorie
// jetzt eine eigene Sidebar-Seite ist statt eines Tabs auf dieser Seite.
const CATEGORY_ROUTE: Partial<Record<ZentraleEntryCategory, string>> = { brief: '/zentrale/rsa-rsb' }
// Für die Prüfprotokoll-Meldung beim Speichern eines Eintrags.
const CATEGORY_LABEL: Record<ZentraleEntryCategory, string> = { lage: 'Operative Lage', kontrollauftrag: 'Kontrollauftrag', brief: 'RSa/RSb', uebergabe: 'Schichtübergabe' }

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
function formatTime(value: string) { return new Date(value).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) }
const EMPTY_BAUSTELLE_FORM = {
  titel: '', startAddress: '', endAddress: '', note: '', gueltigBis: '',
  startLat: null as number | null, startLng: null as number | null,
  endLat: null as number | null, endLng: null as number | null,
  // Entlang des Straßennetzes berechnete Route (siehe routeAlongRoad) - wird
  // automatisch neu berechnet, sobald Start/Ende feststehen. null = noch
  // nicht berechnet bzw. nicht verfügbar, dann zeigt die Vorschau die Luftlinie.
  path: null as [number, number][] | null,
  drawMode: false,
}
type BaustelleFormState = typeof EMPTY_BAUSTELLE_FORM
// Fügt Straße und Hausnummer zum gespeicherten Einsatzort zusammen - ohne HNr (oder als "unbekannt" markiert) bleibt es bei der Straße.
function composeIncidentLocation(street: string, houseNumber: string, houseNumberUnknown: boolean) {
  const trimmedStreet = street.trim()
  if (!trimmedStreet) return ''
  if (houseNumberUnknown || !houseNumber.trim()) return trimmedStreet
  return `${trimmedStreet} ${houseNumber.trim()}`
}

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
  // Kategorie für einen NEUEN Eintrag - unabhängig von activeTab. Bei editing zählt item.category.
  const [entryCategory, setEntryCategory] = useState<ZentraleEntryCategory>('lage')
  const [dutyShift, setDutyShift] = useState<DutyShift>('tag')
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [incident, setIncident] = useState({ callerPhone: '', callerName: '', street: '', houseNumber: '', houseNumberUnknown: false, location: '', summary: '', involvedPerson: '', involvedBirthDate: '', disposition: 'jd' as IncidentDisposition, note: '', lat: null as number | null, lng: null as number | null, coordsPrecise: false })
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
    // bewusst nicht geladen – weder für die Tabs noch für "Sofort wichtig".
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

  const currentTab = TABS.find(tab => tab.id === activeTab) ?? TABS[0]
  const visibleEntries = useMemo(() => entries.filter(item => item.category === activeTab), [activeTab, entries])
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
  const openIncidentMarkers = useMemo(() => openIncidentsAllDays
    .filter(item => item.location_lat !== null && item.location_lng !== null)
    .map(item => ({ lat: item.location_lat as number, lng: item.location_lng as number, popup: `${formatTime(item.reported_at)} – ${item.location || item.summary.slice(0, 40)}` })), [openIncidentsAllDays])
  // Unbestätigte Meldungen ("gemeldet") gestrichelt/grau, bestätigte ("offen") durchgezogen/orange.
  const baustellenLines: MapLine[] = useMemo(() => baustellen.map(item => ({
    // path folgt dem tatsächlichen Straßenverlauf (siehe routeAlongRoad) - ohne
    // berechnete Route (Dienst nicht erreichbar) ersatzweise die Luftlinie.
    points: item.path && item.path.length >= 2 ? item.path : [[item.start_lat, item.start_lng], [item.end_lat, item.end_lng]],
    popup: `${item.titel}${item.status === 'gemeldet' ? ' (ungeprüft)' : ''}`,
    color: item.status === 'gemeldet' ? '#9ca3af' : '#f97316',
    dashed: item.status === 'gemeldet',
  })), [baustellen])
  const contextEntries = useMemo(() => {
    const place = incident.location.trim(), phone = normalizePhone(incident.callerPhone), name = normalizeText(incident.callerName)
    if (!place && !phone && name.length < 3) return []
    return entries.filter(item => item.status !== 'erledigt' && ((place.length >= 4 && addressesMatch(place, item.location ?? '')) || (phone.length >= 5 && normalizePhone(item.reference).includes(phone)) || (name.length >= 3 && normalizeText(`${item.title} ${item.responsible ?? ''}`).includes(name))))
  }, [entries, incident.callerName, incident.callerPhone, incident.location])
  const contextPersonNotes = useMemo(() => {
    const names = [normalizeText(incident.callerName), normalizeText(incident.involvedPerson)].filter(value => value.length >= 3), phone = normalizePhone(incident.callerPhone), place = incident.location.trim()
    return personNotes.filter(item => {
      // Adressabgleich zusätzlich zu Name/Telefon: beim Anlegen einer Meldung
      // ist oft nur der Einsatzort bekannt, noch kein Personenname - z. B.
      // "an dieser Adresse wohnt eine gefährliche Person".
      return (phone.length >= 5 && normalizePhone(item.person?.phone) === phone)
        || (names.includes(normalizeText(personDisplayName(item.person))) && (!item.person?.birth_date || item.person.birth_date === incident.involvedBirthDate))
        || (place.length >= 4 && addressesMatch(place, item.location ?? ''))
    })
  }, [incident.callerName, incident.callerPhone, incident.involvedBirthDate, incident.involvedPerson, incident.location, personNotes])
  // AV/BV & EV und Fahndungen kommen jetzt aus eigenen Tabellen - derselbe
  // Name-/Adressabgleich wie bei Personenhinweisen, damit ein Zentralist beim
  // Erfassen einer Einsatzmeldung weiterhin sofort sieht, ob zur Adresse oder
  // Person bereits ein Verbot oder eine Fahndung vorliegt.
  const contextAvBv = useMemo(() => {
    const names = [normalizeText(incident.callerName), normalizeText(incident.involvedPerson)].filter(value => value.length >= 3), place = incident.location.trim()
    return avBvOpen.filter(item => (names.includes(normalizeText(personDisplayName(item.person))) && (!item.person?.birth_date || item.person.birth_date === incident.involvedBirthDate))
      || (place.length >= 4 && addressesMatch(place, item.object?.address ?? item.gebiet ?? '')))
  }, [avBvOpen, incident.callerName, incident.involvedBirthDate, incident.involvedPerson, incident.location])
  const contextFahndungen = useMemo(() => {
    const names = [normalizeText(incident.callerName), normalizeText(incident.involvedPerson)].filter(value => value.length >= 3), place = incident.location.trim()
    return fahndungenOpen.filter(item => (names.includes(normalizeText(personDisplayName(item.person))) && (!item.person?.birth_date || item.person.birth_date === incident.involvedBirthDate))
      || (place.length >= 4 && addressesMatch(place, item.object?.address ?? '')))
  }, [fahndungenOpen, incident.callerName, incident.involvedBirthDate, incident.involvedPerson, incident.location])
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

  function openNewEntry(category: ZentraleEntryCategory) {
    setEditing(null); setEntry(EMPTY_ENTRY_FORM); setEntryCategory(category); setShowEntryForm(true); setError(''); setEditingLinkedIncident(null)
  }
  function openEdit(item: ZentraleEntry) {
    setEditing(item); setEntry(entryToForm(item)); setEntryCategory(item.category); setShowEntryForm(true); setError('')
    setEditingLinkedIncident(null)
    if (item.category === 'lage' && item.incident_id && !incidents.some(row => row.id === item.incident_id) && !openIncidentsAllDays.some(row => row.id === item.incident_id)) {
      void supabase.from('incident_reports').select('*').eq('id', item.incident_id).maybeSingle().then(({ data }) => { if (data) setEditingLinkedIncident(data as IncidentReport) })
    }
  }

  async function saveEntry() {
    if (!entry.title.trim()) { setError('Bitte eine Bezeichnung eingeben.'); return }
    const category = editing?.category ?? entryCategory
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

  function openIncident() { setIncident({ callerPhone: '', callerName: '', street: '', houseNumber: '', houseNumberUnknown: false, location: '', summary: '', involvedPerson: '', involvedBirthDate: '', disposition: vdAvailable ? 'vd' : 'jd', note: '', lat: null, lng: null, coordsPrecise: false }); setLocateError(''); setShowIncidentForm(true); setError('') }
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
    setSaving(true); const result = await supabase.from('incident_reports').insert({ caller_phone: incident.callerPhone.trim() || null, caller_name: incident.callerName.trim() || null, location: incident.location.trim() || null, location_lat: incident.lat, location_lng: incident.lng, summary: incident.summary.trim(), involved_person: incident.involvedPerson.trim() || null, involved_birth_date: incident.involvedBirthDate || null, disposition: incident.disposition, note: incident.note.trim() || null, status: incident.disposition === 'bp' ? 'weitergegeben' : 'offen', created_by: profile.id }); setSaving(false)
    if (result.error) { setError('Die Meldung konnte nicht gespeichert werden. Bitte heutige Funktion „Zentrale“ wählen.'); return }
    logAudit('Einsatzmeldung angelegt', `${DISPOSITION_LABEL[incident.disposition]} · ${incident.location.trim() || 'ohne Ortsangabe'}`); setShowIncidentForm(false); setActiveTab('einsaetze'); setNotice('Meldung wurde gespeichert.'); await load()
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
      <SofortWichtig items={[
        ...criticalEntries.map(item => ({
          id: item.id, title: item.title, description: item.description,
          onOpen: () => {
            if (item.category === 'lage') { setActiveTab(item.category); openEdit(item) }
            // Übergabepunkte werden jetzt ausschließlich im Innendienst angelegt/bearbeitet.
            else if (item.category === 'uebergabe') { navigate('/innendienst') }
            else { const route = CATEGORY_ROUTE[item.category]; if (route) navigate(route) }
          },
        })),
        ...criticalAvBv.map(item => ({ id: item.id, title: `AV/BV & EV (${AV_BV_ART_LABEL[item.art]}) · ${(item.person ? personDisplayName(item.person) : (item.object?.address ?? item.gebiet ?? 'ohne Zuordnung'))}`, description: item.grund, onOpen: () => navigate('/zentrale/av-bv-ev') })),
        ...criticalFahndungen.map(item => ({ id: item.id, title: `Fahndung (${FAHNDUNG_ART_LABEL[item.art]}) · ${(item.person ? personDisplayName(item.person) : (item.object?.address ?? 'ohne Zuordnung'))}`, description: item.beschreibung, onOpen: () => navigate('/zentrale/fahndungen') })),
      ]} incomplete={criticalSourcesError} />
      <div className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Heute relevant</h2>
        <DutyPanel assignments={shiftAssignments} functions={dutyFunctions} dutyShift={dutyShift} setDutyShift={setDutyShift} />
        <section><div className="flex items-center justify-between mb-3"><h2 className="font-bold text-gray-900 flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-700" /> Aktive Einsätze & Baustellen – Gemeindegebiet Dornbirn</h2><button type="button" onClick={openNewBaustelle} className="text-sm font-semibold text-blue-700">+ Baustelle melden</button></div><LeafletMap height={280} markers={openIncidentMarkers} lines={baustellenLines} /></section>
        {baustellen.length > 0 ? <BaustellenList items={baustellen} canManage={canManage} onConfirm={confirmBaustelle} onEdit={openEditBaustelle} onClose={closeBaustelle} onDelete={deleteBaustelle} /> : null}
        <section><div className="flex items-center justify-between mb-3"><h2 className="font-bold text-gray-900">Heutige Meldungen</h2>{canOperateZentrale ? <button type="button" onClick={openIncident} className="text-sm font-semibold text-blue-700">Meldung erfassen</button> : null}</div>{incidentCards}</section>
      </div>
      <div><h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Informativ – bei Bedarf</h2><p className="text-sm text-gray-500">Weitere Bereiche (AV/BV & EV, Personenhinweise, Fahndungen, RSa/RSb, Schlüssel, Kontakte, Alarmierung, Unterlagen, Personen, Objekte …) über die Seitenleiste.</p></div>
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
        <h2 className="font-bold text-amber-900 flex items-center gap-2"><UsersRound className="w-4 h-4" /> Schichtübergabe</h2>
        <p className="text-sm text-amber-800 mt-1">Am Ende der Schicht an die Ablöse zu übergeben - ergibt sich automatisch aus den noch offenen Einsätzen, kein eigener Eintrag nötig.</p>
        {uebergabeIncidents.length === 0 ? <p className="text-sm text-amber-700 mt-3">Keine offenen Einsätze zu übergeben.</p> : <ul className="mt-3 space-y-1.5 text-sm text-amber-900">{uebergabeIncidents.map(item => <li key={item.id}>• {formatTime(item.reported_at)} – {item.location || item.summary.slice(0, 60)}</li>)}</ul>}
      </section>
    </div> : null}

    {!loading && activeTab === 'einsaetze' ? <section><div className="flex items-center justify-between gap-3 mb-3"><div><h2 className="font-bold text-gray-900">Einsätze</h2><p className="text-sm text-gray-500">Kurze interne Koordination, keine Aktenbearbeitung.</p></div>{canOperateZentrale ? <button type="button" onClick={openIncident} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Neue Meldung</button> : null}</div>{incidentCards}</section> : null}

    {!loading && activeTab === 'strassenzustand' ? <ZentraleStrassenzustand canManage={canManage} /> : null}

    {!loading && activeTab === 'lage' ? <EntryList title={currentTab.label} description={currentTab.description} entries={visibleEntries} canManage={canManage} openNew={() => openNewEntry(activeTab)} openEdit={openEdit} incidentsById={incidentsById} /> : null}

    {showIncidentForm ? <IncidentModal incident={incident} setIncident={setIncident} vdAvailable={vdAvailable} contextEntries={contextEntries} contextPersonNotes={contextPersonNotes} contextAvBv={contextAvBv} contextFahndungen={contextFahndungen} priorIncidents={priorIncidents} saving={saving} error={error} locating={locating} locateError={locateError} locate={locateIncident} close={() => setShowIncidentForm(false)} save={saveIncident} /> : null}
    {showEntryForm ? <EntryModal entry={entry} setEntry={setEntry} editing={editing} category={entryCategory} incidents={lageIncidentOptions} saving={saving} error={error} close={() => setShowEntryForm(false)} save={saveEntry} remove={deleteEntry} /> : null}
    {showBaustelleForm ? <BaustelleModal form={baustelleForm} setForm={setBaustelleForm} editing={editingBaustelle} canManage={canManage} saving={baustelleSaving} error={baustelleError} locating={baustelleLocating} routing={baustelleRouting} locateStart={locateBaustelleStart} locateEnd={locateBaustelleEnd} onMapClick={handleBaustelleMapClick} close={() => setShowBaustelleForm(false)} save={saveBaustelle} /> : null}
  </div>
}

function DutyPanel({ assignments, functions, dutyShift, setDutyShift }: { assignments: DutyAssignment[]; functions: DutyFunctionConfig[]; dutyShift: DutyShift; setDutyShift: (value: DutyShift) => void }) {
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><UsersRound className="w-5 h-5 text-blue-700" /><h2 className="font-bold text-gray-900">Heutige Besetzung</h2></div><p className="text-sm text-gray-500 mt-1">Die eigene Funktion wird direkt im Portal ausgewählt.</p></div><select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={dutyShift} onChange={event => setDutyShift(event.target.value as DutyShift)}><option value="tag">Tagdienst</option><option value="nacht">Nachtdienst</option></select></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">{functions.map(fn => { const assigned = assignments.filter(item => item.function === fn.code); const vehicleNames = [...new Set(assigned.map(item => item.fleet_vehicles?.call_sign || item.fleet_vehicles?.name).filter(Boolean))]; return <div key={fn.code} className="rounded-xl bg-gray-50 border border-gray-200 p-3"><p className="text-xs font-semibold text-gray-500">{fn.label}</p><p className="font-bold text-gray-900 mt-1">{assigned.length}{fn.standard_staffing !== null ? ` / ${fn.standard_staffing}` : ''}</p><p className="text-xs text-gray-500 mt-1 truncate">{assigned.map(item => item.profiles?.name).filter(Boolean).join(', ') || 'nicht eingetragen'}</p>{fn.is_patrol && vehicleNames.length ? <p className="text-xs font-semibold text-blue-700 mt-1 truncate">Fahrzeug: {vehicleNames.join(', ')}</p> : null}</div> })}</div></section>
}

// Ebene 1 der Übersicht: erfordert jetzt Aufmerksamkeit – direkt hervorgehoben, unabhängig von der Funktion.
// Fasst kritische Punkte aus mehreren Quellen zusammen (Operative Lage/Schichtübergabe, AV/BV & EV, Fahndungen).
function SofortWichtig({ items, incomplete }: { items: { id: string; title: string; description: string | null; onOpen: () => void }[]; incomplete?: boolean }) {
  const warning = incomplete ? <p className="text-xs font-medium text-amber-700 flex items-center gap-1.5 mb-2"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> AV/BV & EV bzw. Fahndungen konnten nicht vollständig geladen werden - es könnten weitere dringende Punkte fehlen. Bitte Seite neu laden.</p> : null
  if (items.length === 0) {
    if (incomplete) return <div>{warning}<div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">Keine dringenden Punkte aus den verfügbaren Quellen.</div></div>
    return <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2 text-sm text-green-800"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Keine dringenden Punkte offen.</div>
  }
  return <section><h2 className="text-xs font-bold uppercase tracking-wider text-red-700 mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Sofort wichtig</h2>{warning}<div className="space-y-2">{items.map(item => <button key={item.id} type="button" onClick={item.onOpen} className="w-full text-left rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 hover:bg-red-100"><p className="font-bold text-red-900">{item.title}</p>{item.description ? <p className="text-sm text-red-800 mt-0.5 line-clamp-2">{item.description}</p> : null}</button>)}</div></section>
}

function IncidentModal({ incident, setIncident, vdAvailable, contextEntries, contextPersonNotes, contextAvBv, contextFahndungen, priorIncidents, saving, error, locating, locateError, locate, close, save }: { incident: { callerPhone: string; callerName: string; street: string; houseNumber: string; houseNumberUnknown: boolean; location: string; summary: string; involvedPerson: string; involvedBirthDate: string; disposition: IncidentDisposition; note: string; lat: number | null; lng: number | null; coordsPrecise: boolean }; setIncident: Dispatch<SetStateAction<typeof incident>>; vdAvailable: boolean; contextEntries: ZentraleEntry[]; contextPersonNotes: OperationalPersonNote[]; contextAvBv: ZentraleAvBv[]; contextFahndungen: ZentraleFahndung[]; priorIncidents: IncidentReport[]; saving: boolean; error: string; locating: boolean; locateError: string; locate: () => Promise<void>; close: () => void; save: () => Promise<void> }) {
  const patch = (values: Partial<typeof incident>) => setIncident(current => ({ ...current, ...values }))
  return <Modal title="Neue Meldung" close={close}><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="TEL-Nr. des Melders" value={incident.callerPhone} onChange={value => patch({ callerPhone: value })} /><Field label="Name des Melders" value={incident.callerName} onChange={value => patch({ callerName: value })} /></div><div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700"><span className="font-medium">Meldezeit:</span> {new Date().toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}</div>
    <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4">
      <StreetAutocomplete
        label="Straße"
        value={incident.street}
        onChange={value => patch({ street: value, lat: null, lng: null, coordsPrecise: false, location: composeIncidentLocation(value, incident.houseNumber, incident.houseNumberUnknown) })}
        onSelect={(suggestion: StreetSuggestion) => patch({ street: suggestion.street, lat: suggestion.lat, lng: suggestion.lng, coordsPrecise: false, location: composeIncidentLocation(suggestion.street, incident.houseNumber, incident.houseNumberUnknown) })}
      />
      <div>
        <Field
          label="Hausnummer"
          value={incident.houseNumber}
          disabled={incident.houseNumberUnknown}
          onChange={value => patch({
            houseNumber: value,
            location: composeIncidentLocation(incident.street, value, incident.houseNumberUnknown),
            // Auch eine per Straßenvorschlag gesetzte Näherungsposition bezieht sich
            // nur auf die Straße, nie auf die Hausnummer - sie muss daher bei jeder
            // Änderung der Hausnummer verworfen werden, nicht nur bei coordsPrecise,
            // sonst bliebe nach dem Erfassen der Hausnummer ein Kartenpunkt stehen,
            // der sie ignoriert.
            lat: null, lng: null, coordsPrecise: false,
          })}
        />
        <button
          type="button"
          onClick={() => { const nextUnknown = !incident.houseNumberUnknown; patch({ houseNumberUnknown: nextUnknown, houseNumber: '', location: composeIncidentLocation(incident.street, '', nextUnknown), lat: null, lng: null, coordsPrecise: false }) }}
          className={`mt-2 text-xs font-semibold ${incident.houseNumberUnknown ? 'text-blue-700' : 'text-gray-500'}`}
        >
          {incident.houseNumberUnknown ? '✓ HNr unbekannt' : 'HNr unbekannt'}
        </button>
      </div>
    </div>
    <div><button type="button" disabled={!incident.location.trim() || locating} onClick={() => void locate()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 disabled:opacity-50"><MapPin className="w-3.5 h-3.5" /> {locating ? 'Suche…' : 'Auf Karte anzeigen'}</button>{locateError ? <p className="text-xs text-red-700 mt-1">{locateError}</p> : null}{incident.lat !== null && incident.lng !== null ? <div className="mt-2"><LeafletMap markers={[{ lat: incident.lat, lng: incident.lng, popup: incident.location }]} height={180} /></div> : null}</div>
    <Area label="Kurzer Sachverhalt *" value={incident.summary} onChange={value => patch({ summary: value })} /><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="Beteiligte Person" value={incident.involvedPerson} onChange={value => patch({ involvedPerson: value })} /><Field label="Geburtsdatum zur eindeutigen Zuordnung" type="date" value={incident.involvedBirthDate} onChange={value => patch({ involvedBirthDate: value })} /></div><ContextHints entries={contextEntries} personNotes={contextPersonNotes} avBv={contextAvBv} fahndungen={contextFahndungen} priorIncidents={priorIncidents} /><label className="block text-xs font-medium text-gray-600">Behandlung der Meldung<select className={inputClass} value={incident.disposition} onChange={event => patch({ disposition: event.target.value as IncidentDisposition })}><option value="jd">JD fährt an</option>{vdAvailable ? <option value="vd">VD fährt an</option> : null}<option value="bp">An Bundespolizei (BP) weitergegeben</option><option value="keine_anfahrt">Keine Anfahrt erforderlich</option></select></label><Area label="Optionale Bemerkung" value={incident.note} onChange={value => patch({ note: value })} />{error ? <ErrorMessage text={error} /> : null}<Actions saving={saving} close={close} save={save} /></Modal>
}

function ContextHints({ entries, personNotes, avBv, fahndungen, priorIncidents }: { entries: ZentraleEntry[]; personNotes: OperationalPersonNote[]; avBv: ZentraleAvBv[]; fahndungen: ZentraleFahndung[]; priorIncidents: IncidentReport[] }) {
  if (entries.length === 0 && personNotes.length === 0 && avBv.length === 0 && fahndungen.length === 0 && priorIncidents.length === 0) return null
  const today = todayLocal()
  return <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><h3 className="font-bold text-blue-900">Relevante Hinweise gefunden</h3><p className="text-xs text-blue-700 mt-0.5">Automatisch zusammengetragen – die operative Bewertung bleibt beim Zentralisten.</p><div className="space-y-2 mt-3">
    {personNotes.map(item => { const expired = !!item.valid_until && item.valid_until < today; return <div key={item.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"><p className="text-sm font-bold text-red-900">{PERSON_NOTE_LABEL[item.category]} · {personDisplayName(item.person)}</p><p className="text-sm text-red-800">{item.note}</p>{item.action_guidance ? <p className="text-sm font-semibold text-red-900 mt-1">{item.action_guidance}</p> : null}{item.location || item.valid_until ? <p className="text-xs text-red-700 mt-1 flex flex-wrap gap-x-3">{item.location ? <span>Adresse: {item.location}</span> : null}{item.valid_until ? <span>Gültig bis {new Date(item.valid_until).toLocaleDateString('de-AT')}{expired ? <strong className="text-red-900"> · Abgelaufen</strong> : null}</span> : null}</p> : null}</div> })}
    {avBv.map(item => <div key={item.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"><p className="text-sm font-bold text-red-900">{AV_BV_ART_LABEL[item.art]} · {(item.person ? personDisplayName(item.person) : (item.object?.address ?? item.gebiet ?? 'ohne Zuordnung'))}</p><p className="text-sm text-red-800">{item.grund}</p>{item.gueltig_bis ? <p className="text-xs text-red-700 mt-1">Gültig bis {new Date(item.gueltig_bis).toLocaleDateString('de-AT')}</p> : null}</div>)}
    {fahndungen.map(item => <div key={item.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"><p className="text-sm font-bold text-red-900">Fahndung ({FAHNDUNG_ART_LABEL[item.art]}) · {(item.person ? personDisplayName(item.person) : (item.object?.address ?? 'ohne Zuordnung'))}</p><p className="text-sm text-red-800">{item.beschreibung}</p></div>)}
    {entries.map(item => { const expired = !!item.valid_until && item.valid_until < today; return <div key={item.id} className="rounded-lg border border-blue-200 bg-white px-3 py-2"><p className="text-sm font-bold text-gray-900">{item.title}</p>{item.description ? <p className="text-sm text-gray-700">{item.description}</p> : null}{item.reference ? <p className="text-xs text-gray-500 mt-1">{item.reference}</p> : null}{item.valid_from || item.valid_until ? <p className={`text-xs mt-1 ${expired ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>{item.valid_from ? `Gültig ab ${new Date(item.valid_from).toLocaleDateString('de-AT')}` : 'Gültig'}{item.valid_until ? ` bis ${new Date(item.valid_until).toLocaleDateString('de-AT')}` : ''}{expired ? ' · Abgelaufen' : ''}</p> : null}</div> })}
    {priorIncidents.length > 0 ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"><p className="text-sm font-bold text-amber-900">Frühere Meldungen an dieser Adresse</p><div className="space-y-1.5 mt-1.5">{priorIncidents.map(item => <p key={item.id} className="text-sm text-amber-900"><span className="font-semibold">{new Date(item.reported_at).toLocaleDateString('de-AT')}</span> · {item.summary.slice(0, 100)}{item.summary.length > 100 ? '…' : ''}</p>)}</div></div> : null}
  </div></div>
}

// Baustellen-Markierungen unterhalb der Karte, getrennt nach Status - "gemeldet"
// (ungeprüft, von einem Benutzer z. B. im Außendienst erfasst) muss von einem
// Sachbearbeiter/Genehmiger erst bestätigt werden, bevor sie als aktiv gilt.
function BaustellenList({ items, canManage, onConfirm, onEdit, onClose, onDelete }: { items: ZentraleBaustelle[]; canManage: boolean; onConfirm: (item: ZentraleBaustelle) => Promise<void>; onEdit: (item: ZentraleBaustelle) => void; onClose: (item: ZentraleBaustelle) => Promise<void>; onDelete: (item: ZentraleBaustelle) => Promise<void> }) {
  return <section><h2 className="font-bold text-gray-900 mb-3">Baustellen</h2><div className="space-y-2">{items.map(item => <div key={item.id} className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${item.status === 'gemeldet' ? 'border-gray-300 bg-gray-50' : 'border-orange-200 bg-orange-50'}`}>
    <div>
      <p className="font-semibold text-gray-900">{item.titel}{item.status === 'gemeldet' ? <span className="text-xs font-semibold text-gray-500 ml-2">ungeprüft</span> : null}</p>
      {item.note ? <p className="text-sm text-gray-600 mt-0.5">{item.note}</p> : null}
      {item.gueltig_bis ? <p className="text-xs text-gray-500 mt-0.5">Gültig bis {new Date(item.gueltig_bis).toLocaleDateString('de-AT')}</p> : null}
    </div>
    {canManage ? <div className="flex gap-2">
      {item.status === 'gemeldet' ? <button type="button" onClick={() => void onConfirm(item)} className="text-xs font-medium text-green-700 border border-green-200 px-3 py-2 rounded-lg">Bestätigen</button> : null}
      <button type="button" onClick={() => onEdit(item)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Baustelle bearbeiten"><Pencil className="w-4 h-4" /></button>
      <button type="button" onClick={() => void onClose(item)} className="text-xs font-medium text-blue-700 border border-blue-200 px-3 py-2 rounded-lg">Erledigt</button>
      <button type="button" onClick={() => void onDelete(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Baustelle löschen"><Trash2 className="w-4 h-4" /></button>
    </div> : null}
  </div>)}</div></section>
}

function BaustelleModal({ form, setForm, editing, canManage, saving, error, locating, routing, locateStart, locateEnd, onMapClick, close, save }: { form: BaustelleFormState; setForm: Dispatch<SetStateAction<BaustelleFormState>>; editing: ZentraleBaustelle | null; canManage: boolean; saving: boolean; error: string; locating: 'start' | 'end' | null; routing: boolean; locateStart: () => Promise<void>; locateEnd: () => Promise<void>; onMapClick: (lat: number, lng: number) => void; close: () => void; save: () => Promise<void> }) {
  const patch = (values: Partial<BaustelleFormState>) => setForm(current => ({ ...current, ...values }))
  const hasStart = form.startLat !== null && form.startLng !== null
  const hasEnd = form.endLat !== null && form.endLng !== null
  const markers: MapMarker[] = hasStart && !hasEnd ? [{ lat: form.startLat as number, lng: form.startLng as number, popup: 'Startpunkt' }] : []
  // Solange keine Route berechnet ist (oder der Dienst nicht erreichbar war), zeigt die Vorschau ersatzweise die Luftlinie.
  const lines: MapLine[] = hasStart && hasEnd ? [{ points: form.path && form.path.length >= 2 ? form.path : [[form.startLat as number, form.startLng as number], [form.endLat as number, form.endLng as number]] }] : []
  return <Modal title={editing ? 'Baustelle bearbeiten' : 'Baustelle melden'} close={close}>
    <Field label="Bezeichnung *" value={form.titel} onChange={value => patch({ titel: value })} />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div><Field label="Startpunkt (Adresse)" value={form.startAddress} onChange={value => patch({ startAddress: value })} /><button type="button" disabled={!form.startAddress.trim() || locating === 'start'} onClick={() => void locateStart()} className="mt-1 text-xs font-semibold text-blue-700 disabled:opacity-50">{locating === 'start' ? 'Suche…' : 'Punkt suchen'}</button></div>
      <div><Field label="Endpunkt (Adresse)" value={form.endAddress} onChange={value => patch({ endAddress: value })} /><button type="button" disabled={!form.endAddress.trim() || locating === 'end'} onClick={() => void locateEnd()} className="mt-1 text-xs font-semibold text-blue-700 disabled:opacity-50">{locating === 'end' ? 'Suche…' : 'Punkt suchen'}</button></div>
    </div>
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => patch({ drawMode: !form.drawMode })} className={`text-xs font-semibold ${form.drawMode ? 'text-blue-700' : 'text-gray-500'}`}>{form.drawMode ? '✓ Punkte per Klick auf der Karte setzen (erst Start, dann Ende)' : 'Alternativ: Punkte per Klick auf der Karte setzen'}</button>
        {hasStart && hasEnd ? <span className="text-xs text-gray-400">{routing ? 'Route entlang der Straße wird berechnet…' : (form.path ? 'Folgt dem Straßenverlauf' : 'Straßenverlauf nicht verfügbar – zeigt Luftlinie')}</span> : null}
      </div>
      <div className="mt-2"><LeafletMap height={220} markers={markers} lines={lines} onMapClick={onMapClick} /></div>
    </div>
    <Field label="Gültig bis (optional)" type="date" value={form.gueltigBis} onChange={value => patch({ gueltigBis: value })} />
    <Area label="Bemerkung (optional)" value={form.note} onChange={value => patch({ note: value })} />
    {!canManage ? <p className="text-xs text-gray-500">Die Meldung wird als „ungeprüft“ gespeichert, bis ein Sachbearbeiter oder Genehmiger sie bestätigt.</p> : null}
    {error ? <ErrorMessage text={error} /> : null}
    <Actions saving={saving} close={close} save={save} />
  </Modal>
}
