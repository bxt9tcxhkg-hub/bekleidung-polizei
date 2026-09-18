import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import LeafletMap from '../../components/LeafletMap'
import StreetAutocomplete, { type StreetAutocompleteHandle } from '../../components/StreetAutocomplete'
import RoadKilometerPicker from '../../components/RoadKilometerPicker'
import { PersonNameAutocomplete } from '../../components/RegisterPickers'
import { Actions, Area, ErrorMessage, Field, Modal } from '../../components/ZentraleEntryEditor'
import { reverseGeocode, type StreetSuggestion } from '../../lib/geocode'
import { lookupParcel } from '../../lib/kataster'
import { composeKilometerLocation } from '../../lib/roadKilometer'
import { composeIncidentLocation, type IncidentFormState } from '../../lib/zentraleShared'
import { ContextHints } from './ContextHints'
import { OrtDossier } from './OrtDossier'
import type { IncidentReport, OperationalPerson, OperationalPersonNote, ZentraleAvBv, ZentraleEntry } from '../../lib/types'

export function IncidentModal({ editing, incident, setIncident, persons, onPersonCreated, createdBy, contextEntries, contextPersonNotes, contextAvBv, priorIncidents, saving, error, locating, locateError, locate, close, save }: { editing: boolean; incident: IncidentFormState; setIncident: Dispatch<SetStateAction<IncidentFormState>>; vdAvailable: boolean; persons: OperationalPerson[]; onPersonCreated: (person: OperationalPerson) => void; createdBy: string | null; contextEntries: ZentraleEntry[]; contextPersonNotes: OperationalPersonNote[]; contextAvBv: ZentraleAvBv[]; priorIncidents: IncidentReport[]; saving: boolean; error: string; locating: boolean; locateError: string; locate: (queryOverride?: string) => Promise<void>; close: () => void; save: () => Promise<void> }) {
  const patch = (values: Partial<IncidentFormState>) => setIncident(current => ({ ...current, ...values }))
  const streetRef = useRef<StreetAutocompleteHandle>(null)
  const [mapResolving, setMapResolving] = useState(false)
  const [mapError, setMapError] = useState('')
  const [orgMode, setOrgMode] = useState(Boolean(incident.callerOrg))

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
    const street = result?.street || incident.street
    const houseNumber = result?.houseNumber || incident.houseNumber
    const base = (result && (result.street || result.houseNumber))
      ? composeIncidentLocation(street, houseNumber, false)
      : incident.location
    const location = parcel?.label ? (base ? `${base} · ${parcel.label}` : parcel.label) : base
    if (!result || (!result.street && !result.houseNumber)) {
      setMapError('Adresse zum gewählten Punkt konnte nicht ermittelt werden - Koordinate wurde trotzdem übernommen.')
      if (parcel?.label) patch({ location: location || parcel.label })
      return
    }
    patch({ street, houseNumber, houseNumberUnknown: false, location })
  }

  return <Modal title={editing ? 'Meldung bearbeiten' : 'Neue Meldung'} close={close} wide><div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_minmax(480px,1.1fr)] gap-5">
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {orgMode ? <Field label="Meldende Stelle" value={incident.callerOrg} onChange={value => patch({ callerOrg: value })} /> : <PersonNameAutocomplete label="Melder" persons={persons} value={incident.callerPersonId} onChange={value => patch({ callerPersonId: value })} createdBy={createdBy} onCreated={onPersonCreated} phone={incident.callerPhone} />}
        <Field label="Telefonnummer" value={incident.callerPhone} onChange={value => patch({ callerPhone: value })} />
      </div>
      <button type="button" onClick={() => { setOrgMode(!orgMode); patch(orgMode ? { callerOrg: '' } : { callerOrg: '', callerPersonId: null }) }} className={`text-xs font-semibold ${orgMode ? 'text-blue-700' : 'text-gray-500'}`}>{orgMode ? '✓ Meldende Stelle (statt Person)' : 'Meldende Stelle statt Person (z. B. RFL, LLZ, Feuerwehr)'}</button>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Einsatzort</p>
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-1 flex gap-1">
        <button type="button" onClick={() => patch({ locationMode: 'address', roadQuery: '', roadNumber: '', roadName: '', kilometer: '', kilometerFrom: null, kilometerTo: null, location: composeIncidentLocation(incident.street, incident.houseNumber, incident.houseNumberUnknown), lat: null, lng: null, coordsPrecise: false })} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${incident.locationMode === 'address' ? 'bg-white text-blue-800 shadow-sm' : 'text-gray-600'}`}>Straße und Hausnummer</button>
        <button type="button" onClick={() => patch({ locationMode: 'kilometer', roadQuery: incident.roadName || incident.street, roadNumber: '', roadName: '', kilometer: '', kilometerFrom: null, kilometerTo: null, houseNumber: '', houseNumberUnknown: false, location: '', lat: null, lng: null, coordsPrecise: false })} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${incident.locationMode === 'kilometer' ? 'bg-white text-blue-800 shadow-sm' : 'text-gray-600'}`}>Straßenkilometer</button>
      </div>
      {incident.locationMode === 'address' ? <>
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-4 items-start">
          <StreetAutocomplete
            ref={streetRef}
            label="Straße"
            value={incident.street}
            onChange={value => patch({ street: value, lat: null, lng: null, coordsPrecise: false, location: composeIncidentLocation(value, incident.houseNumber, incident.houseNumberUnknown) })}
            onSelect={(suggestion: StreetSuggestion) => {
              const houseNumber = suggestion.houseNumber || incident.houseNumber
              const composed = composeIncidentLocation(suggestion.street, houseNumber, suggestion.houseNumber ? false : incident.houseNumberUnknown)
              patch({ street: suggestion.street, houseNumber, houseNumberUnknown: suggestion.houseNumber ? false : incident.houseNumberUnknown, lat: suggestion.lat, lng: suggestion.lng, coordsPrecise: Boolean(suggestion.houseNumber), location: composed })
              void lookupParcel(suggestion.lat, suggestion.lng).then(parcel => { if (parcel?.label) patch({ location: `${composed} · ${parcel.label}` }) })
              if (houseNumber.trim() && !suggestion.houseNumber) void locate(composed)
            }}
          />
          <div>
            <Field label="Hausnummer" value={incident.houseNumber} disabled={incident.houseNumberUnknown} onChange={value => patch({ houseNumber: value, location: composeIncidentLocation(incident.street, value, incident.houseNumberUnknown), lat: null, lng: null, coordsPrecise: false })} onBlur={() => { if (incident.street.trim() && incident.houseNumber.trim()) void locate() }} onKeyDown={event => { if (event.key === 'Enter' && incident.street.trim()) { event.preventDefault(); void locate() } }} />
            <button type="button" onClick={() => { const nextUnknown = !incident.houseNumberUnknown; patch({ houseNumberUnknown: nextUnknown, houseNumber: '', location: composeIncidentLocation(incident.street, '', nextUnknown), lat: null, lng: null, coordsPrecise: false }) }} className={`mt-2 text-xs font-semibold ${incident.houseNumberUnknown ? 'text-blue-700' : 'text-gray-500'}`}>{incident.houseNumberUnknown ? '✓ HNr unbekannt' : 'HNr unbekannt'}</button>
          </div>
          <button type="button" onClick={() => { if (incident.houseNumber.trim() && !incident.houseNumberUnknown) void locate(); else streetRef.current?.search() }} disabled={incident.street.trim().length < 3} className="mt-5 shrink-0 px-3 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 disabled:opacity-50">Suchen</button>
        </div>
        {locating ? <p className="text-xs text-gray-500">Suche…</p> : null}
        {locateError ? <p className="text-xs text-red-700 mt-1">{locateError}<button type="button" onClick={() => void locate()} className="ml-2 font-semibold text-blue-700">Erneut versuchen</button></p> : null}
      </> : <RoadKilometerPicker query={incident.roadQuery} roadNumber={incident.roadNumber} roadName={incident.roadName} kilometer={incident.kilometer} kilometerFrom={incident.kilometerFrom} kilometerTo={incident.kilometerTo} onQueryChange={value => patch({ roadQuery: value, roadNumber: '', roadName: '', kilometerFrom: null, kilometerTo: null, street: '', location: '', lat: null, lng: null, coordsPrecise: false })} onRoadSelect={road => patch({ roadQuery: `${road.roadName} (${road.roadNumber})`, roadNumber: road.roadNumber, roadName: road.roadName, kilometerFrom: road.fromKm, kilometerTo: road.toKm, street: road.roadName, location: incident.kilometer ? composeKilometerLocation(road.roadName, road.roadNumber, incident.kilometer) : '', lat: null, lng: null, coordsPrecise: false })} onKilometerChange={value => patch({ kilometer: value, location: incident.roadNumber && value ? composeKilometerLocation(incident.roadName, incident.roadNumber, value) : '', lat: null, lng: null, coordsPrecise: false })} onResolved={point => patch({ kilometer: point.kilometer, location: composeKilometerLocation(incident.roadName, point.roadNumber, point.kilometer), lat: point.lat, lng: point.lng, coordsPrecise: true })} />}
      <OrtDossier street={incident.street} houseNumber={incident.houseNumber} location={incident.location} />
      <Area label="Sachverhalt *" value={incident.summary} onChange={value => patch({ summary: value })} />
      <ContextHints entries={contextEntries} personNotes={contextPersonNotes} avBv={contextAvBv} priorIncidents={priorIncidents} />
      {error ? <ErrorMessage text={error} /> : null}
      <Actions saving={saving} close={close} save={save} />
    </div>
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1">Einsatzort auf der Karte</p>
      <LeafletMap markers={incident.lat !== null && incident.lng !== null ? [{ lat: incident.lat, lng: incident.lng, popup: incident.location || 'Einsatzort' }] : []} onMapClick={(lat, lng) => void handleMapClick(lat, lng)} height={560} incidentKey={editing ? 'bearbeiten' : 'neu'} />
      <p className="text-xs text-gray-500 mt-1.5">Alternativ zur Eingabe: auf die Karte klicken, um den Einsatzort direkt dort zu setzen.</p>
      {incident.locationMode === 'kilometer' ? <p className="text-[11px] text-gray-500 mt-1">Kilometrierung: Datenquelle Land Vorarlberg – data.vorarlberg.gv.at (CC BY 4.0)</p> : null}
      {mapResolving ? <p className="text-xs text-gray-500 mt-1">Adresse wird ermittelt…</p> : null}
      {mapError ? <p className="text-xs text-amber-700 mt-1">{mapError}</p> : null}
    </div>
  </div></Modal>
}
