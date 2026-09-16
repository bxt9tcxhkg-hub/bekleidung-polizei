import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Pencil, Trash2, UsersRound } from 'lucide-react'
import LeafletMap, { type MapLine, type MapMarker } from '../../components/LeafletMap'
import StreetAutocomplete, { type StreetAutocompleteHandle } from '../../components/StreetAutocomplete'
import RoadKilometerPicker from '../../components/RoadKilometerPicker'
import { PersonNameAutocomplete } from '../../components/RegisterPickers'
import { Actions, Area, Empty, ErrorMessage, Field, Modal, inputClass } from '../../components/ZentraleEntryEditor'
import { reverseGeocode, type StreetSuggestion } from '../../lib/geocode'
import { composeKilometerLocation } from '../../lib/roadKilometer'
import { personDisplayName } from '../../lib/register'
import { AV_BV_ART_LABEL, DISPOSITION_LABEL, FAHNDUNG_ART_LABEL, PERSON_NOTE_LABEL, composeIncidentLocation, formatTime, type BaustelleFormState, type IncidentFormState, type StrasseGeometrieFormState } from '../../lib/zentraleShared'
import { nearbyByLine, type LatLng } from '../../lib/geo'
import type { DutyAssignment, DutyFunctionConfig, DutyShift, IncidentDisposition, IncidentReport, OperationalPerson, OperationalPersonNote, StrassenzustandStammdatum, ZentraleAvBv, ZentraleBaustelle, ZentraleEntry, ZentraleFahndung } from '../../lib/types'

export function DutyPanel({ assignments, functions, dutyShift, setDutyShift }: { assignments: DutyAssignment[]; functions: DutyFunctionConfig[]; dutyShift: DutyShift; setDutyShift: (value: DutyShift) => void }) {
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><UsersRound className="w-5 h-5 text-blue-700" /><h2 className="font-bold text-gray-900">Heutige Besetzung</h2></div><p className="text-sm text-gray-500 mt-1">Die eigene Funktion wird direkt im Portal ausgewählt.</p></div><select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={dutyShift} onChange={event => setDutyShift(event.target.value as DutyShift)}><option value="tag">Tagdienst</option><option value="nacht">Nachtdienst</option></select></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">{functions.map(fn => { const assigned = assignments.filter(item => item.function === fn.code); const vehicleNames = [...new Set(assigned.map(item => item.fleet_vehicles?.call_sign || item.fleet_vehicles?.name).filter(Boolean))]; return <div key={fn.code} className="rounded-xl bg-gray-50 border border-gray-200 p-3"><p className="text-xs font-semibold text-gray-500">{fn.label}</p><p className="font-bold text-gray-900 mt-1">{assigned.length}{fn.standard_staffing !== null ? ` / ${fn.standard_staffing}` : ''}</p><p className="text-xs text-gray-500 mt-1 truncate">{assigned.map(item => item.profiles?.name).filter(Boolean).join(', ') || 'nicht eingetragen'}</p>{fn.is_patrol && vehicleNames.length ? <p className="text-xs font-semibold text-blue-700 mt-1 truncate">Fahrzeug: {vehicleNames.join(', ')}</p> : null}</div> })}</div></section>
}

export function SofortWichtig({ items, incomplete }: { items: { id: string; title: string; description: string | null; onOpen: () => void }[]; incomplete?: boolean }) {
  const warning = incomplete ? <p className="text-xs font-medium text-amber-700 flex items-center gap-1.5 mb-2"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> AV/BV & EV bzw. Fahndungen konnten nicht vollständig geladen werden - es könnten weitere dringende Punkte fehlen. Bitte Seite neu laden.</p> : null
  if (items.length === 0) {
    if (incomplete) return <div>{warning}<div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">Keine dringenden Punkte aus den verfügbaren Quellen.</div></div>
    return <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2 text-sm text-green-800"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Keine dringenden Punkte offen.</div>
  }
  return <section><h2 className="text-xs font-bold uppercase tracking-wider text-red-700 mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Sofort wichtig</h2>{warning}<div className="space-y-2">{items.map(item => <button key={item.id} type="button" onClick={item.onOpen} className="w-full text-left rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 hover:bg-red-100"><p className="font-bold text-red-900">{item.title}</p>{item.description ? <p className="text-sm text-red-800 mt-0.5 line-clamp-2">{item.description}</p> : null}</button>)}</div></section>
}
