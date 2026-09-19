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

/**
 * ISO-Zeitpunkt für "Mitternacht heute" in der lokalen Zeitzone des Geräts,
 * für .gte('reported_at', ...)-Filter auf einer timestamptz-Spalte. Ein
 * naiver String wie `${todayLocal()}T00:00:00` wird von Postgres ohne
 * Offset interpretiert (Session-Zeitzone, i. d. R. UTC) - das lag bis zu
 * zwei Stunden (MESZ) hinter der tatsächlichen lokalen Mitternacht zurück
 * und ließ heute erst erfasste Einsätze rund um Mitternacht aus der
 * "heute"-Liste verschwinden, bis die UTC-Uhr nachzog. new Date() kennt die
 * lokale Zeitzone und .toISOString() liefert den korrekten UTC-Zeitpunkt
 * inklusive "Z"-Offset, den Postgres eindeutig interpretiert.
 */
export function startOfTodayIso() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

/**
 * Nachtdienste laufen über Mitternacht hinaus - der "Diensttag" (duty_date
 * einer laufenden Schicht, "heutige" Einsätze) wechselt daher nicht exakt um
 * 00:00 Uhr, sondern erst gegen Dienstbeginn des Tagdienstes. Vor 6 Uhr
 * lokaler Zeit gilt weiterhin der Vortag als "heute" - sonst würde ein
 * Nachtdienst, der z. B. um 19:00 mit duty_date=gestern begonnen hat, kurz
 * nach Mitternacht seine eigene Diensteinteilung und die währenddessen
 * erfassten Einsätze nicht mehr finden (beides über duty_date bzw.
 * reported_at gegen den literalen Kalendertag abgeglichen).
 */
export function operationalToday(cutoffHour = 6) {
  const date = new Date()
  if (date.getHours() < cutoffHour) date.setDate(date.getDate() - 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function startOfOperationalDayIso(cutoffHour = 6) {
  const date = new Date()
  if (date.getHours() < cutoffHour) date.setDate(date.getDate() - 1)
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}
export function composeIncidentLocation(street: string, houseNumber: string, houseNumberUnknown: boolean) {
  const trimmedStreet = street.trim()
  if (!trimmedStreet) return ''
  if (houseNumberUnknown || !houseNumber.trim()) return trimmedStreet
  return `${trimmedStreet} ${houseNumber.trim()}`
}

/** Zerlegt eine gespeicherte Ortsangabe ("Straße 12") wieder in Straße/Hausnummer, zum Vorbefüllen beim Bearbeiten. */
export function locationParts(location: string | null): { street: string; houseNumber: string } {
  const value = (location ?? '').trim()
  const match = value.match(/^(.*\D)\s+(\d+[a-zA-Z]?(?:[/-][\w-]+)?)$/)
  return match ? { street: match[1].trim(), houseNumber: match[2] } : { street: value, houseNumber: '' }
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
  /** Meldende Stelle statt Person (z. B. RFL, LLZ, Feuerwehr) - Freitext statt Personen-Register, schließt callerPersonId aus. */
  callerOrg: string
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
  /** Von der Zentrale zugewiesene Streife (Fahrzeug) - zusätzlich zur groben Disposition (JD/VD/BP), unabhängig von der Streife selbst per "Übernehmen" gesetzten Zuständigkeit. */
  assignedVehicleId: string | null
  note: string
  lat: number | null
  lng: number | null
  coordsPrecise: boolean
  reportedTime: string
}
export const EMPTY_INCIDENT_FORM: IncidentFormState = {
  callerPhone: '', callerPersonId: null, callerOrg: '', locationMode: 'address',
  street: '', houseNumber: '', houseNumberUnknown: false,
  roadQuery: '', roadNumber: '', roadName: '', kilometer: '', kilometerFrom: null, kilometerTo: null,
  location: '', summary: '', involvedPersonId: null, disposition: 'jd', assignedVehicleId: null, note: '',
  lat: null, lng: null, coordsPrecise: false, reportedTime: '',
}
