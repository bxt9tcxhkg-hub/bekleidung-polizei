import { useState, type Dispatch, type SetStateAction } from 'react'
import { CheckCircle2, ChevronDown, Circle, MapPin, Pencil, Printer, Trash2 } from 'lucide-react'
import { Actions, Area, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import LeafletMap from '../../components/LeafletMap'
import { DISPOSITION_LABEL, formatTime } from '../../lib/zentraleShared'
import { geocodeLocation } from '../../lib/geocode'
import { nearbyByLine, type LatLng } from '../../lib/geo'
import { ZIELFUNKTION_LABEL, type AuftragFormState, type BaustelleReportState } from '../../lib/aussendienstShared'
import { useAuth } from '../../contexts/AuthContext'
import { loadEinsatzParteien } from '../../lib/einsatzParteien'
import { readDokumente } from '../../lib/einsatzDokumente'
import { generateEinsatzUebersicht } from '../../lib/einsatzUebersichtPdf'
import type { IncidentDisposition, KontrollauftragZielfunktion, ZentraleBaustelle, ZentraleEntry } from '../../lib/types'
import IncidentDocs from '../zentrale/IncidentDocs'
import EinsatzChecklisten from '../zentrale/EinsatzChecklisten'

export function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"><CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{text}</p></div> }

function NearbyBaustellenHint({ point, baustellen }: { point: LatLng | null; baustellen: readonly ZentraleBaustelle[] }) {
  const nearby = nearbyByLine(point, baustellen)
  if (nearby.length === 0) return null
  return <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2"><p className="text-sm font-bold text-orange-900">Baustelle in der Nähe</p><div className="space-y-1 mt-1">{nearby.map(item => <p key={item.id} className="text-sm text-orange-900">{item.titel}{item.status === 'gemeldet' ? <span className="text-xs font-medium text-orange-700 ml-1">(ungeprüft)</span> : null}{item.note ? <span className="text-orange-800"> · {item.note}</span> : null}</p>)}</div></div>
}

type IncidentListItem = {
  id: string; reported_at: string; location: string | null; location_lat: number | null; location_lng: number | null; summary: string; disposition: IncidentDisposition; status: string; note: string | null
  caller_name?: string | null; caller_phone?: string | null; involved_person?: string | null; involved_birth_date?: string | null
  assigned_vehicle_id?: string | null; taken_over_by?: string | null; taken_over_at?: string | null
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
      const parteien = await loadEinsatzParteien(item.id)
      const dokumente = readDokumente(item.id)
      generateEinsatzUebersicht({ incident: item, parteien, dokumente, erstelltVon: profile?.name ?? '–' })
    } catch {
      // Die Parteien-Abfrage kann fehlschlagen (z.B. keine Verbindung) - der
      // Ausdruck soll trotzdem mit den vorhandenen Meldungsdaten möglich sein.
      generateEinsatzUebersicht({ incident: item, parteien: [], dokumente: readDokumente(item.id), erstelltVon: profile?.name ?? '–' })
    } finally {
      setPrinting(false)
    }
  }
  return <button type="button" onClick={() => void print()} disabled={printing} className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline disabled:opacity-60"><Printer className="w-3.5 h-3.5" />{printing ? 'Wird vorbereitet…' : 'Übersicht drucken'}</button>
}

function IncidentRow({ item, baustellen, takeOverIncident, releaseIncidentTakeover }: { item: IncidentListItem; baustellen: readonly ZentraleBaustelle[]; takeOverIncident?: (id: string) => Promise<void>; releaseIncidentTakeover?: (id: string) => Promise<void> }) {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const point = item.location_lat !== null && item.location_lng !== null ? { lat: item.location_lat, lng: item.location_lng } : null
  const takenOverByMe = Boolean(item.taken_over_by && item.taken_over_by === profile?.id)
  async function handleTakeOver() { if (!takeOverIncident) return; setBusy(true); try { await takeOverIncident(item.id) } finally { setBusy(false) } }
  async function handleRelease() { if (!releaseIncidentTakeover) return; setBusy(true); try { await releaseIncidentTakeover(item.id) } finally { setBusy(false) } }
  return <article className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
    <button type="button" onClick={() => setOpen(!open)} className="w-full flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4 text-left hover:bg-gray-50">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="font-bold text-gray-900 flex-shrink-0">{formatTime(item.reported_at)}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${item.status === 'weitergegeben' ? 'bg-blue-100 text-blue-800' : item.status === 'erledigt' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{statusBadge(item.status)}</span>
        {item.assigned_vehicle ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 flex-shrink-0">{item.assigned_vehicle.call_sign || item.assigned_vehicle.name}</span> : null}
        {item.taken_over_by_profile ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 flex-shrink-0">Übernommen: {item.taken_over_by_profile.name}</span> : null}
        <span className="text-sm text-gray-700 truncate">{item.location || 'Ohne Ortsangabe'}</span>
      </div>
      <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open ? <div className="px-3 sm:px-4 pb-4 pt-1 border-t border-gray-100 space-y-3">
      <p className="text-sm text-gray-700">{item.summary}</p>
      <p className="text-xs text-gray-500">{DISPOSITION_LABEL[item.disposition]}</p>
      <NearbyBaustellenHint point={point} baustellen={baustellen} />
      <div className="flex flex-wrap items-center gap-4">
        <PrintIncidentButton item={item} />
        {takeOverIncident && releaseIncidentTakeover ? (takenOverByMe
          ? <button type="button" onClick={() => void handleRelease()} disabled={busy} className="text-xs font-medium text-gray-600 hover:underline disabled:opacity-60">Übernahme zurücknehmen</button>
          : <button type="button" onClick={() => void handleTakeOver()} disabled={busy} className="text-xs font-semibold text-purple-700 hover:underline disabled:opacity-60">{item.taken_over_by_profile ? 'Stattdessen selbst übernehmen' : 'Übernehmen'}</button>) : null}
      </div>
      <details className="rounded-xl border border-gray-200 px-3 py-2">
        <summary className="text-xs font-bold text-gray-800 cursor-pointer">Ablauf-Checkliste (Erstmeldung / Notunterkunft)</summary>
        <div className="mt-2"><EinsatzChecklisten incidentId={item.id} canOperate /></div>
      </details>
      <IncidentDocs incidentId={item.id} from="streife" />
    </div> : null}
  </article>
}

export function EntryOrIncidentList({ kind, entries, incidents, baustellen, canManage, onEdit, onToggleErledigt, takeOverIncident, releaseIncidentTakeover }: { kind: 'entries' | 'incidents'; entries?: ZentraleEntry[]; incidents?: IncidentListItem[]; baustellen?: ZentraleBaustelle[]; canManage?: boolean; onEdit?: (item: ZentraleEntry) => void; onToggleErledigt?: (item: ZentraleEntry) => Promise<void>; takeOverIncident?: (id: string) => Promise<void>; releaseIncidentTakeover?: (id: string) => Promise<void> }) {
  if (kind === 'incidents') {
    if (!incidents || incidents.length === 0) return <Empty text="Heute wurden noch keine Meldungen erfasst." />
    return <div className="space-y-2">{incidents.map(item => <IncidentRow key={item.id} item={item} baustellen={baustellen ?? []} takeOverIncident={takeOverIncident} releaseIncidentTakeover={releaseIncidentTakeover} />)}</div>
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

export function AuftragModal({ auftrag, setAuftrag, editing, saving, error, close, save, remove }: { auftrag: AuftragFormState; setAuftrag: Dispatch<SetStateAction<AuftragFormState>>; editing: ZentraleEntry | null; saving: boolean; error: string; close: () => void; save: () => Promise<void>; remove: () => Promise<void> }) {
  const patch = (values: Partial<AuftragFormState>) => setAuftrag(current => ({ ...current, ...values }))
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState('')
  async function locate() {
    if (!auftrag.location.trim()) { setLocateError('Bitte zuerst einen Ort eintragen.'); return }
    setLocating(true); setLocateError('')
    const result = await geocodeLocation(auftrag.location)
    setLocating(false)
    if (!result) { setLocateError('Die Position wurde nicht gefunden. Bitte Ort prüfen oder auf der Karte anklicken.'); return }
    patch({ lat: result.lat, lng: result.lng })
  }
  return <Modal title={editing ? 'Kontrollauftrag bearbeiten' : 'Kontrollauftrag anlegen'} close={close} wide><div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_minmax(360px,1fr)] gap-5">
    <div className="space-y-4">
      <Field label="Bezeichnung *" value={auftrag.title} onChange={value => patch({ title: value })} />
      <Area label="Welche Kontrollen sind durchzuführen" value={auftrag.description} onChange={value => patch({ description: value })} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Ort" value={auftrag.location} onChange={value => patch({ location: value, lat: null, lng: null })} />
        <label className="text-xs font-medium text-gray-600">Zielfunktion<select className={inputClass} value={auftrag.targetFunction} onChange={event => patch({ targetFunction: event.target.value as KontrollauftragZielfunktion })}>{Object.entries(ZIELFUNKTION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <Field label="Von" type="date" value={auftrag.validFrom} onChange={value => patch({ validFrom: value })} />
        <Field label="Bis" type="date" value={auftrag.validUntil} onChange={value => patch({ validUntil: value })} />
      </div>
      <Field label="Uhrzeit / Zeitfenster (optional)" value={auftrag.zeitfenster} onChange={value => patch({ zeitfenster: value })} />
      <button type="button" onClick={() => void locate()} disabled={locating} className="inline-flex items-center gap-2 rounded-lg border border-blue-300 px-3 py-2 text-sm font-medium text-blue-800 disabled:opacity-60"><MapPin className="w-4 h-4" />{locating ? 'Position wird gesucht…' : 'Ort auf Karte suchen'}</button>
      {locateError ? <p className="text-xs text-red-700">{locateError}</p> : null}
      {error ? <ErrorMessage text={error} /> : null}
      <div className="flex flex-wrap gap-3 pt-2">{editing ? <button type="button" disabled={saving} onClick={() => void remove()} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /> Endgültig löschen</button> : <span className="mr-auto" />}<Actions saving={saving} close={close} save={save} /></div>
    </div>
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1">Ort auf der Karte</p>
      <LeafletMap markers={auftrag.lat !== null && auftrag.lng !== null ? [{ lat: auftrag.lat, lng: auftrag.lng, popup: auftrag.location || 'Kontrollauftrag' }] : []} onMapClick={(lat, lng) => patch({ lat, lng })} height={480} />
      <p className="text-xs text-gray-500 mt-1.5">Alternativ zur Adresssuche: auf die Karte klicken, um den Ort direkt dort zu setzen.</p>
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
