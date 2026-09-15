import type { Dispatch, SetStateAction } from 'react'
import { AlertTriangle, CheckCircle2, MapPin, Pencil, Trash2, UsersRound } from 'lucide-react'
import LeafletMap, { type MapLine, type MapMarker } from '../../components/LeafletMap'
import StreetAutocomplete from '../../components/StreetAutocomplete'
import { PersonPicker } from '../../components/RegisterPickers'
import { Actions, Area, Empty, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import { type StreetSuggestion } from '../../lib/geocode'
import { personDisplayName } from '../../lib/register'
import { AV_BV_ART_LABEL, DISPOSITION_LABEL, FAHNDUNG_ART_LABEL, PERSON_NOTE_LABEL, composeIncidentLocation, formatTime, type BaustelleFormState, type IncidentFormState, type StrasseGeometrieFormState } from '../../lib/zentraleShared'
import { nearbyByLine, type LatLng } from '../../lib/geo'
import type { DutyAssignment, DutyFunctionConfig, DutyShift, IncidentDisposition, IncidentReport, OperationalPerson, OperationalPersonNote, StrassenzustandStammdatum, ZentraleAvBv, ZentraleBaustelle, ZentraleEntry, ZentraleFahndung } from '../../lib/types'

// Von ZentraleShell.tsx sowie den einzelnen Zentrale-Seiten (Übersicht,
// Einsätze, Operative Lage - jetzt eigenständige Sidebar-Seiten statt Tabs)
// gemeinsam genutzte Darstellungsbausteine. Konstanten/Helfer liegen in
// lib/zentraleShared.ts (Komponenten-Dateien dürfen laut
// react-refresh/only-export-components nur Komponenten exportieren).

export function DutyPanel({ assignments, functions, dutyShift, setDutyShift }: { assignments: DutyAssignment[]; functions: DutyFunctionConfig[]; dutyShift: DutyShift; setDutyShift: (value: DutyShift) => void }) {
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><UsersRound className="w-5 h-5 text-blue-700" /><h2 className="font-bold text-gray-900">Heutige Besetzung</h2></div><p className="text-sm text-gray-500 mt-1">Die eigene Funktion wird direkt im Portal ausgewählt.</p></div><select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={dutyShift} onChange={event => setDutyShift(event.target.value as DutyShift)}><option value="tag">Tagdienst</option><option value="nacht">Nachtdienst</option></select></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">{functions.map(fn => { const assigned = assignments.filter(item => item.function === fn.code); const vehicleNames = [...new Set(assigned.map(item => item.fleet_vehicles?.call_sign || item.fleet_vehicles?.name).filter(Boolean))]; return <div key={fn.code} className="rounded-xl bg-gray-50 border border-gray-200 p-3"><p className="text-xs font-semibold text-gray-500">{fn.label}</p><p className="font-bold text-gray-900 mt-1">{assigned.length}{fn.standard_staffing !== null ? ` / ${fn.standard_staffing}` : ''}</p><p className="text-xs text-gray-500 mt-1 truncate">{assigned.map(item => item.profiles?.name).filter(Boolean).join(', ') || 'nicht eingetragen'}</p>{fn.is_patrol && vehicleNames.length ? <p className="text-xs font-semibold text-blue-700 mt-1 truncate">Fahrzeug: {vehicleNames.join(', ')}</p> : null}</div> })}</div></section>
}

// Ebene 1 der Übersicht: erfordert jetzt Aufmerksamkeit – direkt hervorgehoben, unabhängig von der Funktion.
// Fasst kritische Punkte aus mehreren Quellen zusammen (Operative Lage/Schichtübergabe, AV/BV & EV, Fahndungen).
export function SofortWichtig({ items, incomplete }: { items: { id: string; title: string; description: string | null; onOpen: () => void }[]; incomplete?: boolean }) {
  const warning = incomplete ? <p className="text-xs font-medium text-amber-700 flex items-center gap-1.5 mb-2"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> AV/BV & EV bzw. Fahndungen konnten nicht vollständig geladen werden - es könnten weitere dringende Punkte fehlen. Bitte Seite neu laden.</p> : null
  if (items.length === 0) {
    if (incomplete) return <div>{warning}<div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">Keine dringenden Punkte aus den verfügbaren Quellen.</div></div>
    return <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2 text-sm text-green-800"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Keine dringenden Punkte offen.</div>
  }
  return <section><h2 className="text-xs font-bold uppercase tracking-wider text-red-700 mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Sofort wichtig</h2>{warning}<div className="space-y-2">{items.map(item => <button key={item.id} type="button" onClick={item.onOpen} className="w-full text-left rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 hover:bg-red-100"><p className="font-bold text-red-900">{item.title}</p>{item.description ? <p className="text-sm text-red-800 mt-0.5 line-clamp-2">{item.description}</p> : null}</button>)}</div></section>
}

// Kurzer Hinweis auf Baustellen in der Nähe eines Punkts - z. B. des
// Einsatzorts, live während der Erfassung oder auf der gespeicherten
// Meldung. Geografische Nähe (siehe lib/geo.ts) statt Textabgleich, weil
// beide Seiten bereits Koordinaten haben - robuster als ein Straßenname-Match.
function NearbyBaustellenHint({ point, baustellen }: { point: LatLng | null; baustellen: readonly ZentraleBaustelle[] }) {
  const nearby = nearbyByLine(point, baustellen)
  if (nearby.length === 0) return null
  return <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2"><p className="text-sm font-bold text-orange-900">Baustelle in der Nähe</p><div className="space-y-1 mt-1">{nearby.map(item => <p key={item.id} className="text-sm text-orange-900">{item.titel}{item.status === 'gemeldet' ? <span className="text-xs font-medium text-orange-700 ml-1">(ungeprüft)</span> : null}{item.note ? <span className="text-orange-800"> · {item.note}</span> : null}</p>)}</div></div>
}

// Von Übersicht UND Einsätze-Seite genutzt (dieselbe Liste, keine Dopplung der Logik).
export function IncidentCards({ visibleIncidents, lageByIncidentId, baustellen, canOperateZentrale, openLageForIncident, completeIncident, deleteIncident }: {
  visibleIncidents: IncidentReport[]
  lageByIncidentId: Record<string, ZentraleEntry>
  baustellen: ZentraleBaustelle[]
  canOperateZentrale: boolean
  openLageForIncident: (item: IncidentReport) => void
  completeIncident: (item: IncidentReport) => Promise<void>
  deleteIncident: (item: IncidentReport) => Promise<void>
}) {
  return <div className="space-y-3">{visibleIncidents.length === 0
    ? <Empty text="Heute wurden noch keine Meldungen erfasst." />
    : visibleIncidents.map(item => { const lage = lageByIncidentId[item.id]; const point = item.location_lat !== null && item.location_lng !== null ? { lat: item.location_lat, lng: item.location_lng } : null; return <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-gray-900">{formatTime(item.reported_at)}</span><span className={`text-xs font-semibold px-2 py-1 rounded-full ${item.status === 'weitergegeben' ? 'bg-blue-100 text-blue-800' : item.status === 'erledigt' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{item.status === 'weitergegeben' ? 'An BP weitergegeben' : item.status === 'erledigt' ? 'Erledigt' : 'Offen'}</span></div><p className="font-semibold text-gray-900 mt-2">{item.location || 'Ohne Ortsangabe'}</p><p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{item.summary}</p><div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-3">{item.caller_phone ? <span>TEL: {item.caller_phone}</span> : null}{item.caller_name ? <span>Melder: {item.caller_name}</span> : null}<span>{DISPOSITION_LABEL[item.disposition]}</span>{item.note ? <span>Bemerkung: {item.note}</span> : null}</div><NearbyBaustellenHint point={point} baustellen={baustellen} />{canOperateZentrale ? <button type="button" onClick={() => openLageForIncident(item)} className={`inline-flex items-center gap-1.5 text-xs font-semibold mt-3 ${lage ? 'text-red-700' : 'text-blue-700'}`}>{lage ? <><AlertTriangle className="w-3.5 h-3.5" /> Operative Lage ansehen</> : 'Als Operative Lage erfassen'}</button> : null}</div><div className="flex gap-2">{canOperateZentrale && item.status === 'offen' ? <button type="button" onClick={() => void completeIncident(item)} className="text-xs font-medium text-green-700 border border-green-200 px-3 py-2 rounded-lg">Erledigt</button> : null}{canOperateZentrale ? <button type="button" onClick={() => void deleteIncident(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Einsatzmeldung löschen"><Trash2 className="w-4 h-4" /></button> : null}</div></div></article> })}</div>
}

export function IncidentModal({ incident, setIncident, vdAvailable, persons, onPersonCreated, createdBy, contextEntries, contextPersonNotes, contextAvBv, contextFahndungen, baustellen, priorIncidents, saving, error, locating, locateError, locate, close, save }: { incident: IncidentFormState; setIncident: Dispatch<SetStateAction<IncidentFormState>>; vdAvailable: boolean; persons: OperationalPerson[]; onPersonCreated: (person: OperationalPerson) => void; createdBy: string | null; contextEntries: ZentraleEntry[]; contextPersonNotes: OperationalPersonNote[]; contextAvBv: ZentraleAvBv[]; contextFahndungen: ZentraleFahndung[]; baustellen: ZentraleBaustelle[]; priorIncidents: IncidentReport[]; saving: boolean; error: string; locating: boolean; locateError: string; locate: () => Promise<void>; close: () => void; save: () => Promise<void> }) {
  const patch = (values: Partial<IncidentFormState>) => setIncident(current => ({ ...current, ...values }))
  return <Modal title="Neue Meldung" close={close}><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Field label="TEL-Nr. des Melders (dieser Anruf)" value={incident.callerPhone} onChange={value => patch({ callerPhone: value })} /><PersonPicker label="Melder" persons={persons} value={incident.callerPersonId} onChange={value => patch({ callerPersonId: value })} createdBy={createdBy} onCreated={onPersonCreated} /></div><div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700"><span className="font-medium">Meldezeit:</span> {new Date().toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}</div>
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
    <Area label="Kurzer Sachverhalt *" value={incident.summary} onChange={value => patch({ summary: value })} /><PersonPicker label="Beteiligte Person" persons={persons} value={incident.involvedPersonId} onChange={value => patch({ involvedPersonId: value })} createdBy={createdBy} onCreated={onPersonCreated} /><ContextHints entries={contextEntries} personNotes={contextPersonNotes} avBv={contextAvBv} fahndungen={contextFahndungen} baustellen={nearbyByLine(incident.lat !== null && incident.lng !== null ? { lat: incident.lat, lng: incident.lng } : null, baustellen)} priorIncidents={priorIncidents} /><label className="block text-xs font-medium text-gray-600">Behandlung der Meldung<select className={inputClass} value={incident.disposition} onChange={event => patch({ disposition: event.target.value as IncidentDisposition })}><option value="jd">JD fährt an</option>{vdAvailable ? <option value="vd">VD fährt an</option> : null}<option value="bp">An Bundespolizei (BP) weitergegeben</option><option value="keine_anfahrt">Keine Anfahrt erforderlich</option></select></label><Area label="Optionale Bemerkung" value={incident.note} onChange={value => patch({ note: value })} />{error ? <ErrorMessage text={error} /> : null}<Actions saving={saving} close={close} save={save} /></Modal>
}

function ContextHints({ entries, personNotes, avBv, fahndungen, baustellen, priorIncidents }: { entries: ZentraleEntry[]; personNotes: OperationalPersonNote[]; avBv: ZentraleAvBv[]; fahndungen: ZentraleFahndung[]; baustellen: ZentraleBaustelle[]; priorIncidents: IncidentReport[] }) {
  if (entries.length === 0 && personNotes.length === 0 && avBv.length === 0 && fahndungen.length === 0 && baustellen.length === 0 && priorIncidents.length === 0) return null
  const today = new Date(); const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><h3 className="font-bold text-blue-900">Relevante Hinweise gefunden</h3><p className="text-xs text-blue-700 mt-0.5">Automatisch zusammengetragen – die operative Bewertung bleibt beim Zentralisten.</p><div className="space-y-2 mt-3">
    {personNotes.map(item => { const expired = !!item.valid_until && item.valid_until < todayIso; return <div key={item.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"><p className="text-sm font-bold text-red-900">{PERSON_NOTE_LABEL[item.category]} · {personDisplayName(item.person)}</p><p className="text-sm text-red-800">{item.note}</p>{item.action_guidance ? <p className="text-sm font-semibold text-red-900 mt-1">{item.action_guidance}</p> : null}{item.location || item.valid_until ? <p className="text-xs text-red-700 mt-1 flex flex-wrap gap-x-3">{item.location ? <span>Adresse: {item.location}</span> : null}{item.valid_until ? <span>Gültig bis {new Date(item.valid_until).toLocaleDateString('de-AT')}{expired ? <strong className="text-red-900"> · Abgelaufen</strong> : null}</span> : null}</p> : null}</div> })}
    {avBv.map(item => <div key={item.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"><p className="text-sm font-bold text-red-900">{AV_BV_ART_LABEL[item.art]} · {(item.person ? personDisplayName(item.person) : (item.object?.address ?? item.gebiet ?? 'ohne Zuordnung'))}</p><p className="text-sm text-red-800">{item.grund}</p>{item.gueltig_bis ? <p className="text-xs text-red-700 mt-1">Gültig bis {new Date(item.gueltig_bis).toLocaleDateString('de-AT')}</p> : null}</div>)}
    {fahndungen.map(item => <div key={item.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"><p className="text-sm font-bold text-red-900">Fahndung ({FAHNDUNG_ART_LABEL[item.art]}) · {(item.person ? personDisplayName(item.person) : (item.object?.address ?? 'ohne Zuordnung'))}</p><p className="text-sm text-red-800">{item.beschreibung}</p></div>)}
    {baustellen.map(item => <div key={item.id} className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2"><p className="text-sm font-bold text-orange-900">Baustelle in der Nähe: {item.titel}{item.status === 'gemeldet' ? <span className="text-xs font-medium text-orange-700 ml-1">(ungeprüft)</span> : null}</p>{item.note ? <p className="text-sm text-orange-800">{item.note}</p> : null}</div>)}
    {entries.map(item => { const expired = !!item.valid_until && item.valid_until < todayIso; return <div key={item.id} className="rounded-lg border border-blue-200 bg-white px-3 py-2"><p className="text-sm font-bold text-gray-900">{item.title}</p>{item.description ? <p className="text-sm text-gray-700">{item.description}</p> : null}{item.reference ? <p className="text-xs text-gray-500 mt-1">{item.reference}</p> : null}{item.valid_from || item.valid_until ? <p className={`text-xs mt-1 ${expired ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>{item.valid_from ? `Gültig ab ${new Date(item.valid_from).toLocaleDateString('de-AT')}` : 'Gültig'}{item.valid_until ? ` bis ${new Date(item.valid_until).toLocaleDateString('de-AT')}` : ''}{expired ? ' · Abgelaufen' : ''}</p> : null}</div> })}
    {priorIncidents.length > 0 ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"><p className="text-sm font-bold text-amber-900">Frühere Meldungen an dieser Adresse</p><div className="space-y-1.5 mt-1.5">{priorIncidents.map(item => <p key={item.id} className="text-sm text-amber-900"><span className="font-semibold">{new Date(item.reported_at).toLocaleDateString('de-AT')}</span> · {item.summary.slice(0, 100)}{item.summary.length > 100 ? '…' : ''}</p>)}</div></div> : null}
  </div></div>
}

// Baustellen-Markierungen unterhalb der Karte, getrennt nach Status - "gemeldet"
// (ungeprüft, von einem Benutzer z. B. im Außendienst erfasst) muss von einem
// Sachbearbeiter/Genehmiger erst bestätigt werden, bevor sie als aktiv gilt.
export function BaustellenList({ items, canOperate, onConfirm, onEdit, onClose, onDelete }: { items: ZentraleBaustelle[]; canOperate: boolean; onConfirm: (item: ZentraleBaustelle) => Promise<void>; onEdit: (item: ZentraleBaustelle) => void; onClose: (item: ZentraleBaustelle) => Promise<void>; onDelete: (item: ZentraleBaustelle) => Promise<void> }) {
  return <section><h2 className="font-bold text-gray-900 mb-3">Baustellen</h2><div className="space-y-2">{items.map(item => <div key={item.id} className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${item.status === 'gemeldet' ? 'border-gray-300 bg-gray-50' : 'border-orange-200 bg-orange-50'}`}>
    <div>
      <p className="font-semibold text-gray-900">{item.titel}{item.status === 'gemeldet' ? <span className="text-xs font-semibold text-gray-500 ml-2">ungeprüft</span> : null}</p>
      {item.note ? <p className="text-sm text-gray-600 mt-0.5">{item.note}</p> : null}
      {item.gueltig_bis ? <p className="text-xs text-gray-500 mt-0.5">Gültig bis {new Date(item.gueltig_bis).toLocaleDateString('de-AT')}</p> : null}
    </div>
    {canOperate ? <div className="flex gap-2">
      {item.status === 'gemeldet' ? <button type="button" onClick={() => void onConfirm(item)} className="text-xs font-medium text-green-700 border border-green-200 px-3 py-2 rounded-lg">Bestätigen</button> : null}
      <button type="button" onClick={() => onEdit(item)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Baustelle bearbeiten"><Pencil className="w-4 h-4" /></button>
      <button type="button" onClick={() => void onClose(item)} className="text-xs font-medium text-blue-700 border border-blue-200 px-3 py-2 rounded-lg">Erledigt</button>
      <button type="button" onClick={() => void onDelete(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Baustelle löschen"><Trash2 className="w-4 h-4" /></button>
    </div> : null}
  </div>)}</div></section>
}

export function BaustelleModal({ form, setForm, editing, canOperate, saving, error, locating, routing, locateStart, locateEnd, onMapClick, close, save }: { form: BaustelleFormState; setForm: Dispatch<SetStateAction<BaustelleFormState>>; editing: ZentraleBaustelle | null; canOperate: boolean; saving: boolean; error: string; locating: 'start' | 'end' | null; routing: boolean; locateStart: () => Promise<void>; locateEnd: () => Promise<void>; onMapClick: (lat: number, lng: number) => void; close: () => void; save: () => Promise<void> }) {
  const patch = (values: Partial<BaustelleFormState>) => setForm(current => ({ ...current, ...values }))
  const hasStart = form.startLat !== null && form.startLng !== null
  const hasEnd = form.endLat !== null && form.endLng !== null
  const markers: MapMarker[] = hasStart && !hasEnd ? [{ lat: form.startLat as number, lng: form.startLng as number, popup: 'Startpunkt' }] : []
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
    {!canOperate ? <p className="text-xs text-gray-500">Die Meldung wird als „ungeprüft“ gespeichert, bis ein Sachbearbeiter, Genehmiger oder diensthabender Zentralist sie bestätigt.</p> : null}
    {error ? <ErrorMessage text={error} /> : null}
    <Actions saving={saving} close={close} save={save} />
  </Modal>
}

// Legt einmalig die Kartenposition einer Stammdaten-Straße fest (siehe
// ZentraleStrassenzustand.tsx) - keine Meldung, sondern reine Geometrie, die
// von jeder aktiven Sperre dieser Straße wiederverwendet wird. UI bewusst wie
// BaustelleModal (Adresse suchen oder auf der Karte klicken, Straßenverlauf
// per Routing-Dienst), damit Zentralisten kein zweites Bedienkonzept lernen müssen.
export function StrasseGeometrieModal({ strasse, form, setForm, saving, error, locating, routing, locateStart, locateEnd, onMapClick, close, save }: { strasse: StrassenzustandStammdatum; form: StrasseGeometrieFormState; setForm: Dispatch<SetStateAction<StrasseGeometrieFormState>>; saving: boolean; error: string; locating: 'start' | 'end' | null; routing: boolean; locateStart: () => Promise<void>; locateEnd: () => Promise<void>; onMapClick: (lat: number, lng: number) => void; close: () => void; save: () => Promise<void> }) {
  const patch = (values: Partial<StrasseGeometrieFormState>) => setForm(current => ({ ...current, ...values }))
  const hasStart = form.startLat !== null && form.startLng !== null
  const hasEnd = form.endLat !== null && form.endLng !== null
  const markers: MapMarker[] = hasStart && !hasEnd ? [{ lat: form.startLat as number, lng: form.startLng as number, popup: 'Startpunkt' }] : []
  const lines: MapLine[] = hasStart && hasEnd ? [{ points: form.path && form.path.length >= 2 ? form.path : [[form.startLat as number, form.startLng as number], [form.endLat as number, form.endLng as number]] }] : []
  return <Modal title={`Position von „${strasse.name}“ markieren`} close={close}>
    <p className="text-xs text-gray-500">Wird einmalig für diese Straße gespeichert - eine aktive Sperre dieser Straße erscheint danach automatisch als Linie auf der Karte.</p>
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
    {error ? <ErrorMessage text={error} /> : null}
    <Actions saving={saving} close={close} save={save} />
  </Modal>
}
