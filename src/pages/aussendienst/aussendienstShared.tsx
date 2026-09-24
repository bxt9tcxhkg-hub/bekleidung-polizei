import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Circle, Navigation, Pencil, Printer, Trash2 } from 'lucide-react'
import { Actions, Area, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import LeafletMap from '../../components/LeafletMap'
import StreetAutocomplete, { type StreetAutocompleteHandle } from '../../components/StreetAutocomplete'
import RoadKilometerPicker from '../../components/RoadKilometerPicker'
import { composeIncidentLocation, DISPOSITION_LABEL, formatTime } from '../../lib/zentraleShared'
import { reverseGeocode, type StreetSuggestion } from '../../lib/geocode'
import { lookupParcel } from '../../lib/kataster'
import { composeKilometerLocation } from '../../lib/roadKilometer'
import { nearbyByLine, navigationUrl, type LatLng } from '../../lib/geo'
import { ZIELFUNKTION_LABEL, type AuftragFormState, type BaustelleReportState } from '../../lib/aussendienstShared'
import { useAuth } from '../../contexts/AuthContext'
import { loadEinsatzParteien } from '../../lib/einsatzParteien'
import { loadDokumente } from '../../lib/einsatzDokumente'
import { generateEinsatzUebersicht } from '../../lib/einsatzUebersichtPdf'
import { loadIncidentEreignis } from '../../lib/ereignis'
import { officerPrintName } from '../../lib/printDocs'
import { supabase } from '../../lib/supabase'
import type { IncidentContextItem, IncidentDisposition, IncidentSupport, KontrollauftragZielfunktion, ZentraleBaustelle, ZentraleEntry } from '../../lib/types'
import IncidentDocs from '../zentrale/IncidentDocs'
import IncidentNamensliste from '../zentrale/IncidentNamensliste'
import PatrolAssistancePanel from './PatrolAssistancePanel'

export function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"><CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{text}</p></div> }

function NavigationButton({ point, address }: { point: LatLng | null; address: string | null }) {
  const url = navigationUrl(point, address)
  if (!url) return null
  return <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1.5 bg-blue-800 hover:bg-blue-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
  >
    <Navigation className="w-3.5 h-3.5" /> Navigation starten
  </a>
}

function NearbyBaustellenHint({ point, baustellen }: { point: LatLng | null; baustellen: readonly ZentraleBaustelle[] }) {
  const nearby = nearbyByLine(point, baustellen)
  if (nearby.length === 0) return null
  return <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2"><p className="text-sm font-bold text-orange-900">Baustelle in der Nähe</p><div className="space-y-1 mt-1">{nearby.map(item => <p key={item.id} className="text-sm text-orange-900">{item.titel}{item.status === 'gemeldet' ? <span className="text-xs font-medium text-orange-700 ml-1">(ungeprüft)</span> : null}{item.note ? <span className="text-orange-800"> · {item.note}</span> : null}</p>)}</div></div>
}

type IncidentListItem = {
  id: string; reported_at: string; reason_code?: string | null; location: string | null; location_lat: number | null; location_lng: number | null; summary: string; disposition: IncidentDisposition; status: string; note: string | null
  caller_name?: string | null; caller_phone?: string | null; involved_person?: string | null; involved_birth_date?: string | null
  assigned_vehicle_id?: string | null; taken_over_by?: string | null; taken_over_at?: string | null; taken_over_vehicle_id?: string | null; completed_by?: string | null; completed_at?: string | null
  assigned_vehicle?: { id: string; name: string; call_sign: string | null } | null
  taken_over_by_profile?: { id: string; name: string } | null
}

function statusBadge(status: string) {
  return status === 'weitergegeben' ? 'An BP weitergegeben' : status === 'erledigt' ? 'Erledigt' : 'Offen'
}

function PrintIncidentButton({ item }: { item: IncidentListItem }) {
  const { profile } = useAuth()
  const [printing, setPrinting] = useState(false)
  async function print() {
    setPrinting(true)
    try {
      const [parteien, ereignis, dokumente] = await Promise.all([
        loadEinsatzParteien(item.id),
        loadIncidentEreignis(item.id),
        loadDokumente(item.id, profile?.id),
      ])
      generateEinsatzUebersicht({ incident: item, parteien, dokumente, ereignisDimension: ereignis?.dimension, erstelltVon: officerPrintName(profile) })
    } catch {
      // Bei einem Ladefehler bleibt ein Ausdruck der bereits bekannten
      // Meldungsdaten möglich; fehlende Serverdaten werden nicht erfunden.
      generateEinsatzUebersicht({ incident: item, parteien: [], dokumente: [], erstelltVon: officerPrintName(profile) })
    } finally {
      setPrinting(false)
    }
  }
  return <button type="button" onClick={() => void print()} disabled={printing} className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline disabled:opacity-60"><Printer className="w-3.5 h-3.5" />{printing ? 'Wird vorbereitet…' : 'Übersicht drucken'}</button>
}

function IncidentRow({
  item, baustellen, ownVehicleId, ownFunction, supports, takeOverIncident, releaseIncidentTakeover,
  supportIncident, stopSupportingIncident, completeIncident, reopenIncident, contextSummary,
}: {
  item: IncidentListItem
  baustellen: readonly ZentraleBaustelle[]
  ownVehicleId?: string | null
  ownFunction?: string | null
  supports: readonly IncidentSupport[]
  takeOverIncident?: (id: string) => Promise<void>
  releaseIncidentTakeover?: (id: string) => Promise<void>
  supportIncident?: (id: string) => Promise<void>
  stopSupportingIncident?: (id: string) => Promise<void>
  completeIncident?: (id: string) => Promise<void>
  reopenIncident?: (id: string) => Promise<void>
  contextSummary?: { safety: number; attention: number }
}) {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [contextItems, setContextItems] = useState<IncidentContextItem[]>([])
  const [contextLoaded, setContextLoaded] = useState(false)
  const [contextLoading, setContextLoading] = useState(false)
  const point = item.location_lat !== null && item.location_lng !== null ? { lat: item.location_lat, lng: item.location_lng } : null
  const takenOverByMe = Boolean(item.taken_over_by && item.taken_over_by === profile?.id)
  const primaryVehicleId = item.taken_over_vehicle_id || item.assigned_vehicle_id
  const ownIsPrimary = Boolean(ownVehicleId && primaryVehicleId === ownVehicleId)
  const activeSupports = supports.filter(row => row.incident_id === item.id && row.ended_at === null)
  const ownSupport = activeSupports.find(row => row.vehicle_id === ownVehicleId)
  const canTakeOver = item.status !== 'erledigt' && (ownIsPrimary || (!primaryVehicleId && (item.disposition === 'offen' || item.disposition === ownFunction)))
  const canComplete = item.status !== 'erledigt' && (ownIsPrimary || takenOverByMe)
  const canReopen = item.status === 'erledigt' && (ownIsPrimary || item.completed_by === profile?.id)

  async function toggleOpen() {
    const next = !open
    setOpen(next)
    if (next && !contextLoaded && !contextLoading) {
      setContextLoading(true)
      const { data } = await supabase.rpc('incident_context', { p_incident_id: item.id })
      setContextItems((data ?? []) as IncidentContextItem[])
      setContextLoaded(true)
      setContextLoading(false)
    }
  }

  async function run(action: (() => Promise<void>) | undefined) {
    if (!action) return
    setBusy(true)
    try { await action() } finally { setBusy(false) }
  }

  return <article className={`rounded-2xl border bg-white overflow-hidden ${ownIsPrimary ? 'border-blue-300 shadow-sm' : 'border-gray-200'}`}>
    <button type="button" onClick={() => void toggleOpen()} className="w-full flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4 text-left hover:bg-gray-50">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-gray-900">{formatTime(item.reported_at)}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.status === 'erledigt' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{statusBadge(item.status)}</span>
          {ownIsPrimary ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">Meine Streife</span> : null}
          {item.assigned_vehicle ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">{item.assigned_vehicle.call_sign || item.assigned_vehicle.name}</span> : null}
          {ownSupport ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">Unterstützung aktiv</span> : null}
        </div>
        <p className="text-sm font-medium text-gray-800 mt-1 truncate">{item.location || 'Ohne Ortsangabe'}</p>
        <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{item.summary}</p>
        {contextSummary?.safety ? <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800"><AlertTriangle className="w-3.5 h-3.5" />{contextSummary.safety === 1 ? 'Sicherheitsrelevanter Hinweis' : `${contextSummary.safety} sicherheitsrelevante Hinweise`}</div>
        : contextSummary?.attention ? <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800"><AlertTriangle className="w-3.5 h-3.5" />Besondere Aufmerksamkeit</div>
        : null}
      </div>
      <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>

    {open ? <div className="px-3 sm:px-4 pb-4 pt-3 border-t border-gray-100 space-y-3">
      <div className="flex flex-wrap gap-2">
        <NavigationButton point={point} address={item.location} />
        {item.status !== 'erledigt' && !item.taken_over_at && canTakeOver && takeOverIncident ? <button type="button" disabled={busy} onClick={() => void run(() => takeOverIncident(item.id))} className="inline-flex items-center gap-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60">Übernehmen</button> : null}
        {item.status !== 'erledigt' && item.taken_over_at && (ownIsPrimary || takenOverByMe) && releaseIncidentTakeover ? <button type="button" disabled={busy} onClick={() => void run(() => releaseIncidentTakeover(item.id))} className="inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-60">Übernahme zurücknehmen</button> : null}
        {item.status !== 'erledigt' && primaryVehicleId && !ownIsPrimary && ownVehicleId && !ownSupport && supportIncident ? <button type="button" disabled={busy} onClick={() => void run(() => supportIncident(item.id))} className="inline-flex items-center gap-1.5 border border-purple-300 text-purple-800 bg-purple-50 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60">Unterstützen</button> : null}
        {item.status !== 'erledigt' && ownSupport && stopSupportingIncident ? <button type="button" disabled={busy} onClick={() => void run(() => stopSupportingIncident(item.id))} className="inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-60">Unterstützung beenden</button> : null}
        {canComplete && completeIncident ? <button type="button" disabled={busy} onClick={() => void run(() => completeIncident(item.id))} className="inline-flex items-center gap-1.5 bg-green-700 hover:bg-green-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60">Erledigen</button> : null}
        {canReopen && reopenIncident ? <button type="button" disabled={busy} onClick={() => void run(() => reopenIncident(item.id))} className="inline-flex items-center gap-1.5 border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60">Wieder öffnen</button> : null}
      </div>

      {activeSupports.length > 0 ? <div className="rounded-lg bg-purple-50 border border-purple-100 px-3 py-2"><p className="text-xs font-semibold text-purple-900">Unterstützende Streifen</p><p className="text-sm text-purple-900 mt-0.5">{activeSupports.map(row => row.vehicle?.call_sign || row.vehicle?.name || 'Streife').join(', ')}</p></div> : null}

      {contextLoading ? <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-500">Relevante Einsatzinformationen werden geprüft…</div> : null}
      {contextItems.length > 0 ? <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Relevante Hinweise</p>
        {contextItems.map((ctx, index) => <div key={`${ctx.kind}-${index}`} className={`rounded-lg border px-3 py-2 ${ctx.severity === 'sicherheit' ? 'border-red-200 bg-red-50' : ctx.severity === 'achtung' ? 'border-orange-200 bg-orange-50' : ctx.severity === 'nahbereich' ? 'border-amber-200 bg-amber-50' : 'border-blue-100 bg-blue-50'}`}>
          <p className={`text-sm font-semibold ${ctx.severity === 'sicherheit' ? 'text-red-900' : ctx.severity === 'achtung' ? 'text-orange-900' : ctx.severity === 'nahbereich' ? 'text-amber-900' : 'text-blue-900'}`}>{ctx.title}{ctx.distance_m !== null ? ` · ${ctx.distance_m} m` : ''}</p>
          {ctx.detail ? <p className={`text-xs mt-0.5 ${ctx.severity === 'sicherheit' ? 'text-red-800' : ctx.severity === 'achtung' ? 'text-orange-800' : ctx.severity === 'nahbereich' ? 'text-amber-800' : 'text-blue-800'}`}>{ctx.detail}</p> : null}
        </div>)}
      </div> : null}

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Sachverhalt</p>
        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{item.summary}</p>
      </div>
      {(item.caller_name || item.caller_phone) ? <div><p className="text-xs font-bold uppercase tracking-wider text-gray-400">Meldungsleger</p><p className="text-sm text-gray-700 mt-1">{item.caller_name || 'Name nicht erfasst'}{item.caller_phone ? ` · ${item.caller_phone}` : ''}</p></div> : null}
      <p className="text-xs text-gray-500">{DISPOSITION_LABEL[item.disposition]}</p>
      <NearbyBaustellenHint point={point} baustellen={baustellen} />
      <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
        <PatrolAssistancePanel incidentId={item.id} vehicleId={ownVehicleId ?? primaryVehicleId ?? null} incidentLocation={item.location} />
      </div>

      <details className="rounded-xl border border-gray-200 px-3 py-2">
        <summary className="text-xs font-bold text-gray-800 cursor-pointer">Dokumente zum Einsatz</summary>
        <div className="mt-3">
          <IncidentDocs incidentId={item.id} from="streife" />
        </div>
      </details>

      <details className="rounded-xl border border-gray-200 px-3 py-2">
        <summary className="text-xs font-bold text-gray-800 cursor-pointer">Bewohnerdaten / ZMR</summary>
        <div className="mt-3">
          <IncidentNamensliste incidentId={item.id} incidentTitel={`${formatTime(item.reported_at)} · ${item.location || 'Ohne Ortsangabe'}`} />
        </div>
      </details>

      <div><PrintIncidentButton item={item} /></div>
    </div> : null}
  </article>
}

export function EntryOrIncidentList({ kind, entries, incidents, baustellen, canManage, onEdit, onToggleErledigt, ownVehicleId, ownFunction, incidentSupports, takeOverIncident, releaseIncidentTakeover, supportIncident, stopSupportingIncident, completeIncident, reopenIncident, incidentContextSummary, emptyText }: { kind: 'entries' | 'incidents'; entries?: ZentraleEntry[]; incidents?: IncidentListItem[]; baustellen?: ZentraleBaustelle[]; canManage?: boolean; onEdit?: (item: ZentraleEntry) => void; onToggleErledigt?: (item: ZentraleEntry) => Promise<void>; ownVehicleId?: string | null; ownFunction?: string | null; incidentSupports?: IncidentSupport[]; takeOverIncident?: (id: string) => Promise<void>; releaseIncidentTakeover?: (id: string) => Promise<void>; supportIncident?: (id: string) => Promise<void>; stopSupportingIncident?: (id: string) => Promise<void>; completeIncident?: (id: string) => Promise<void>; reopenIncident?: (id: string) => Promise<void>; incidentContextSummary?: Record<string, { safety: number; attention: number }>; emptyText?: string }) {
  if (kind === 'incidents') {
    if (!incidents || incidents.length === 0) return <Empty text={emptyText ?? 'Heute wurden noch keine Meldungen erfasst.'} />
    return <div className="space-y-2">{incidents.map(item => <IncidentRow key={item.id} item={item} baustellen={baustellen ?? []} ownVehicleId={ownVehicleId} ownFunction={ownFunction} supports={incidentSupports ?? []} takeOverIncident={takeOverIncident} releaseIncidentTakeover={releaseIncidentTakeover} supportIncident={supportIncident} stopSupportingIncident={stopSupportingIncident} completeIncident={completeIncident} reopenIncident={reopenIncident} contextSummary={incidentContextSummary?.[item.id]} />)}</div>
  }
  const list = entries ?? []
  if (list.length === 0) return <Empty text="Keine Einträge vorhanden." />
  return <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">{list.map(item => {
    const erledigt = item.status === 'erledigt'
    return <article key={item.id} className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3 min-w-0">
      {onToggleErledigt ? <button type="button" onClick={() => void onToggleErledigt(item)} className={`mt-0.5 flex-shrink-0 ${erledigt ? 'text-green-600' : 'text-gray-300 hover:text-gray-400'}`} aria-label={erledigt ? 'Als offen markieren' : 'Als erledigt markieren'}>{erledigt ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}</button> : null}
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className={`font-semibold ${erledigt ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{item.title}</h3><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.priority === 'kritisch' ? 'bg-red-100 text-red-800' : item.priority === 'hoch' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>{item.priority}</span>{item.target_function ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">{ZIELFUNKTION_LABEL[item.target_function]}</span> : null}</div>{item.description ? <p className={`text-sm mt-2 whitespace-pre-wrap ${erledigt ? 'text-gray-400' : 'text-gray-600'}`}>{item.description}</p> : null}<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">{item.location ? <span>Ort: {item.location}</span> : null}{item.zeitfenster ? <span>Uhrzeit: {item.zeitfenster}</span> : null}{item.valid_from ? <span>Ab: {new Date(item.valid_from).toLocaleDateString('de-AT')}</span> : null}{item.valid_until ? <span>Bis: {new Date(item.valid_until).toLocaleDateString('de-AT')}</span> : null}{erledigt && item.erledigt_at ? <span>Erledigt um {formatTime(item.erledigt_at)} (Gedankenstütze, kein Nachweis)</span> : null}</div></div></div>{canManage && onEdit ? <button type="button" onClick={() => onEdit(item)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex-shrink-0" aria-label="Eintrag bearbeiten"><Pencil className="w-4 h-4" /></button> : null}</div></article>
  })}</div>
}

export function AuftragModal({ auftrag, setAuftrag, editing, saving, error, locating, locateError, locate, close, save, remove }: { auftrag: AuftragFormState; setAuftrag: Dispatch<SetStateAction<AuftragFormState>>; editing: ZentraleEntry | null; saving: boolean; error: string; locating: boolean; locateError: string; locate: (queryOverride?: string) => Promise<void>; close: () => void; save: () => Promise<void>; remove: () => Promise<void> }) {
  const patch = (values: Partial<AuftragFormState>) => setAuftrag(current => ({ ...current, ...values }))
  const streetRef = useRef<StreetAutocompleteHandle>(null)
  const [mapResolving, setMapResolving] = useState(false)
  const [mapError, setMapError] = useState('')

  async function handleMapClick(lat: number, lng: number) {
    patch({
      locationMode: 'address',
      lat, lng, coordsPrecise: true,
      roadQuery: '', roadNumber: '', roadName: '', kilometer: '', kilometerFrom: null, kilometerTo: null,
    })
    setMapError('')
    setMapResolving(true)
    const [result, parcel] = await Promise.all([reverseGeocode(lat, lng), lookupParcel(lat, lng)])
    setMapResolving(false)
    const street = result?.street || auftrag.street
    const houseNumber = result?.houseNumber || auftrag.houseNumber
    const base = (result && (result.street || result.houseNumber))
      ? composeIncidentLocation(street, houseNumber, false)
      : auftrag.location
    const location = parcel?.label ? (base ? `${base} · ${parcel.label}` : parcel.label) : base
    if (!result || (!result.street && !result.houseNumber)) {
      setMapError('Adresse zum gewählten Punkt konnte nicht ermittelt werden - Koordinate wurde trotzdem übernommen.')
      if (parcel?.label) patch({ location: location || parcel.label })
      return
    }
    patch({ street, houseNumber, houseNumberUnknown: false, location })
  }

  return <Modal title={editing ? 'Kontrollauftrag bearbeiten' : 'Kontrollauftrag anlegen'} close={close} wide><div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_minmax(480px,1.1fr)] gap-5">
    <div className="space-y-4">
      <Field label="Bezeichnung *" value={auftrag.title} onChange={value => patch({ title: value })} />
      <Area label="Welche Kontrollen sind durchzuführen" value={auftrag.description} onChange={value => patch({ description: value })} />
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Ort</p>
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-1 flex gap-1">
        <button type="button" onClick={() => patch({ locationMode: 'address', roadQuery: '', roadNumber: '', roadName: '', kilometer: '', kilometerFrom: null, kilometerTo: null, location: composeIncidentLocation(auftrag.street, auftrag.houseNumber, auftrag.houseNumberUnknown), lat: null, lng: null, coordsPrecise: false })} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${auftrag.locationMode === 'address' ? 'bg-white text-blue-800 shadow-sm' : 'text-gray-600'}`}>Straße und Hausnummer</button>
        <button type="button" onClick={() => patch({ locationMode: 'kilometer', roadQuery: auftrag.roadName || auftrag.street, roadNumber: '', roadName: '', kilometer: '', kilometerFrom: null, kilometerTo: null, houseNumber: '', houseNumberUnknown: false, location: '', lat: null, lng: null, coordsPrecise: false })} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${auftrag.locationMode === 'kilometer' ? 'bg-white text-blue-800 shadow-sm' : 'text-gray-600'}`}>Straßenkilometer</button>
      </div>
      {auftrag.locationMode === 'address' ? <>
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-4 items-start">
          <StreetAutocomplete
            ref={streetRef}
            label="Straße"
            value={auftrag.street}
            onChange={value => patch({ street: value, lat: null, lng: null, coordsPrecise: false, location: composeIncidentLocation(value, auftrag.houseNumber, auftrag.houseNumberUnknown) })}
            onSelect={(suggestion: StreetSuggestion) => {
              const houseNumber = suggestion.houseNumber || auftrag.houseNumber
              const composed = composeIncidentLocation(suggestion.street, houseNumber, suggestion.houseNumber ? false : auftrag.houseNumberUnknown)
              patch({ street: suggestion.street, houseNumber, houseNumberUnknown: suggestion.houseNumber ? false : auftrag.houseNumberUnknown, lat: suggestion.lat, lng: suggestion.lng, coordsPrecise: Boolean(suggestion.houseNumber), location: composed })
              void lookupParcel(suggestion.lat, suggestion.lng).then(parcel => { if (parcel?.label) patch({ location: `${composed} · ${parcel.label}` }) })
              if (houseNumber.trim() && !suggestion.houseNumber) void locate(composed)
            }}
          />
          <div>
            <Field label="Hausnummer" value={auftrag.houseNumber} disabled={auftrag.houseNumberUnknown} onChange={value => patch({ houseNumber: value, location: composeIncidentLocation(auftrag.street, value, auftrag.houseNumberUnknown), lat: null, lng: null, coordsPrecise: false })} onBlur={() => { if (auftrag.street.trim() && auftrag.houseNumber.trim()) void locate() }} onKeyDown={event => { if (event.key === 'Enter' && auftrag.street.trim()) { event.preventDefault(); void locate() } }} />
            <button type="button" onClick={() => { const nextUnknown = !auftrag.houseNumberUnknown; patch({ houseNumberUnknown: nextUnknown, houseNumber: '', location: composeIncidentLocation(auftrag.street, '', nextUnknown), lat: null, lng: null, coordsPrecise: false }) }} className={`mt-2 text-xs font-semibold ${auftrag.houseNumberUnknown ? 'text-blue-700' : 'text-gray-500'}`}>{auftrag.houseNumberUnknown ? '✓ HNr unbekannt' : 'HNr unbekannt'}</button>
          </div>
          <button type="button" onClick={() => { if (auftrag.houseNumber.trim() && !auftrag.houseNumberUnknown) void locate(); else streetRef.current?.search() }} disabled={auftrag.street.trim().length < 3} className="mt-5 shrink-0 px-3 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 disabled:opacity-50">Suchen</button>
        </div>
        {locating ? <p className="text-xs text-gray-500">Suche…</p> : null}
        {locateError ? <p className="text-xs text-red-700 mt-1">{locateError}<button type="button" onClick={() => void locate()} className="ml-2 font-semibold text-blue-700">Erneut versuchen</button></p> : null}
      </> : <RoadKilometerPicker query={auftrag.roadQuery} roadNumber={auftrag.roadNumber} roadName={auftrag.roadName} kilometer={auftrag.kilometer} kilometerFrom={auftrag.kilometerFrom} kilometerTo={auftrag.kilometerTo} onQueryChange={value => patch({ roadQuery: value, roadNumber: '', roadName: '', kilometerFrom: null, kilometerTo: null, street: '', location: '', lat: null, lng: null, coordsPrecise: false })} onRoadSelect={road => patch({ roadQuery: `${road.roadName} (${road.roadNumber})`, roadNumber: road.roadNumber, roadName: road.roadName, kilometerFrom: road.fromKm, kilometerTo: road.toKm, street: road.roadName, location: auftrag.kilometer ? composeKilometerLocation(road.roadName, road.roadNumber, auftrag.kilometer) : '', lat: null, lng: null, coordsPrecise: false })} onKilometerChange={value => patch({ kilometer: value, location: auftrag.roadNumber && value ? composeKilometerLocation(auftrag.roadName, auftrag.roadNumber, value) : '', lat: null, lng: null, coordsPrecise: false })} onResolved={point => patch({ kilometer: point.kilometer, location: composeKilometerLocation(auftrag.roadName, point.roadNumber, point.kilometer), lat: point.lat, lng: point.lng, coordsPrecise: true })} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-xs font-medium text-gray-600">Zielfunktion<select className={inputClass} value={auftrag.targetFunction} onChange={event => patch({ targetFunction: event.target.value as KontrollauftragZielfunktion })}>{Object.entries(ZIELFUNKTION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <Field label="Von" type="date" value={auftrag.validFrom} onChange={value => patch({ validFrom: value })} />
        <Field label="Bis" type="date" value={auftrag.validUntil} onChange={value => patch({ validUntil: value })} />
        <Field label="Uhrzeit / Zeitfenster (optional)" value={auftrag.zeitfenster} onChange={value => patch({ zeitfenster: value })} />
      </div>
      {error ? <ErrorMessage text={error} /> : null}
      <div className="flex flex-wrap gap-3 pt-2">{editing ? <button type="button" disabled={saving} onClick={() => void remove()} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /> Endgültig löschen</button> : <span className="mr-auto" />}<Actions saving={saving} close={close} save={save} /></div>
    </div>
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1">Ort auf der Karte</p>
      <LeafletMap markers={auftrag.lat !== null && auftrag.lng !== null ? [{ lat: auftrag.lat, lng: auftrag.lng, popup: auftrag.location || 'Kontrollauftrag' }] : []} onMapClick={(lat, lng) => void handleMapClick(lat, lng)} height={560} incidentKey={editing ? 'bearbeiten' : 'neu'} />
      <p className="text-xs text-gray-500 mt-1.5">Alternativ zur Eingabe: auf die Karte klicken, um den Ort direkt dort zu setzen.</p>
      {auftrag.locationMode === 'kilometer' ? <p className="text-[11px] text-gray-500 mt-1">Kilometrierung: Datenquelle Land Vorarlberg – data.vorarlberg.gv.at (CC BY 4.0)</p> : null}
      {mapResolving ? <p className="text-xs text-gray-500 mt-1">Adresse wird ermittelt…</p> : null}
      {mapError ? <p className="text-xs text-amber-700 mt-1">{mapError}</p> : null}
    </div>
  </div></Modal>
}

export function BaustelleReportModal({ report, setReport, saving, error, close, save }: { report: BaustelleReportState; setReport: Dispatch<SetStateAction<BaustelleReportState>>; saving: boolean; error: string; close: () => void; save: () => Promise<void> }) {
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
