import type { IncidentDisposition, OperationalPersonNoteCategory, AvBvArt, FahndungArt } from './types'

// Von ZentraleShell.tsx, den Zentrale-Unterseiten (Übersicht/Einsätze/
// Operative Lage) und zentraleShared.tsx gemeinsam genutzte Konstanten/
// Hilfsfunktionen - eigene .ts-Datei, weil Komponenten-Dateien laut
// react-refresh/only-export-components nur Komponenten exportieren dürfen.

export const DISPOSITION_LABEL: Record<IncidentDisposition, string> = { jd: 'JD fährt an', vd: 'VD fährt an', bp: 'An Bundespolizei (BP) weitergegeben', keine_anfahrt: 'Keine Anfahrt erforderlich' }
export const PERSON_NOTE_LABEL: Record<OperationalPersonNoteCategory, string> = { infektionsschutz: 'Infektionsschutz', aggressiv: 'Aggressives Verhalten', waffenverbot: 'Waffenverbot', fluchtgefahr: 'Fluchtgefahr', suizidgefahr: 'Suizidgefahr', sonstiges: 'Sonstiger Sicherheitshinweis' }
export const AV_BV_ART_LABEL: Record<AvBvArt, string> = { amtsverbot: 'Amtsverbot', betretungsverbot: 'Betretungsverbot', einreiseverbot: 'Einreiseverbot' }
export const FAHNDUNG_ART_LABEL: Record<FahndungArt, string> = { person: 'Person', fahrzeug: 'Fahrzeug', objekt: 'Objekt', sonstiges: 'Sonstiges' }
export function formatTime(value: string) { return new Date(value).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) }
export function composeIncidentLocation(street: string, houseNumber: string, houseNumberUnknown: boolean) {
  const trimmedStreet = street.trim()
  if (!trimmedStreet) return ''
  if (houseNumberUnknown || !houseNumber.trim()) return trimmedStreet
  return `${trimmedStreet} ${houseNumber.trim()}`
}

// Analog zu EMPTY_BAUSTELLE_FORM, aber ohne Bezeichnung/Bemerkung/Gültigkeit -
// hier wird nur einmalig die Position einer Stammdaten-Straße festgelegt
// (siehe ZentraleStrassenzustand.tsx), nicht ein einzelner Bericht.
export const EMPTY_STRASSE_GEOMETRIE_FORM = {
  startAddress: '', endAddress: '',
  startLat: null as number | null, startLng: null as number | null,
  endLat: null as number | null, endLng: null as number | null,
  path: null as [number, number][] | null,
  drawMode: false,
}
export type StrasseGeometrieFormState = typeof EMPTY_STRASSE_GEOMETRIE_FORM

export const EMPTY_BAUSTELLE_FORM = {
  titel: '', startAddress: '', endAddress: '', note: '', gueltigBis: '',
  startLat: null as number | null, startLng: null as number | null,
  endLat: null as number | null, endLng: null as number | null,
  path: null as [number, number][] | null,
  drawMode: false,
}
export type BaustelleFormState = typeof EMPTY_BAUSTELLE_FORM

// Melder und beteiligte Person sind Verknüpfungen zum Personen-Register
// (callerPersonId/involvedPersonId), kein Namens-/Geburtsdatum-Freitext mehr -
// Name, Geburtsdatum und Telefonnummer stecken in der Person selbst.
// callerPhone bleibt eigenständig: die Nummer, von der dieser Anruf kam, kann
// von der im Personen-Register hinterlegten Nummer abweichen.
// reportedTime (HH:MM) ist standardmäßig die aktuelle Uhrzeit beim Öffnen des
// Formulars (siehe openIncident() in ZentraleShell.tsx), aber änderbar - eine
// Meldung kommt nicht immer erst in dem Moment herein, in dem sie erfasst
// wird. Immer für den heutigen Tag (kein Datumsfeld), wie bisher.
export type IncidentFormState = {
  callerPhone: string
  callerPersonId: string | null
  locationMode: 'address' | 'kilometer'
  street: string
  houseNumber: string
  houseNumberUnknown: boolean
  roadQuery: string
  roadNumber: string
  roadName: string
  kilometer: string
  kilometerFrom: number | null
  kilometerTo: number | null
  location: string
  summary: string
  involvedPersonId: string | null
  disposition: IncidentDisposition
  note: string
  lat: number | null
  lng: number | null
  coordsPrecise: boolean
  reportedTime: string
}
export const EMPTY_INCIDENT_FORM: IncidentFormState = {
  callerPhone: '', callerPersonId: null, locationMode: 'address',
  street: '', houseNumber: '', houseNumberUnknown: false,
  roadQuery: '', roadNumber: '', roadName: '', kilometer: '', kilometerFrom: null, kilometerTo: null,
  location: '', summary: '', involvedPersonId: null, disposition: 'jd', note: '',
  lat: null, lng: null, coordsPrecise: false, reportedTime: '',
}
