import type { IncidentDisposition, OperationalPersonNoteCategory, AvBvArt, FahndungArt } from './types'

// Von ZentraleShell.tsx, den Zentrale-Unterseiten (Übersicht/Einsätze/
// Operative Lage) und zentraleShared.tsx gemeinsam genutzte Konstanten/
// Hilfsfunktionen - eigene .ts-Datei, weil Komponenten-Dateien laut
// react-refresh/only-export-components nur Komponenten exportieren dürfen.

export const DISPOSITION_LABEL: Record<IncidentDisposition, string> = { offen: 'Offen / noch nicht zugewiesen', zentrale: 'Bearbeitung durch Zentrale', jd: 'JD', vd: 'VD', bp: 'An Bundespolizei (BP) abgetreten', keine_anfahrt: 'Keine Anfahrt erforderlich' }
export const PERSON_NOTE_LABEL: Record<OperationalPersonNoteCategory, string> = { infektionsschutz: 'Infektionsschutz', aggressiv: 'Aggressives Verhalten', waffenverbot: 'Waffenverbot', fluchtgefahr: 'Fluchtgefahr', suizidgefahr: 'Suizidgefahr', sonstiges: 'Sonstiger Sicherheitshinweis' }
export const AV_BV_ART_LABEL: Record<AvBvArt, string> = { amtsverbot: 'Amtsverbot', betretungsverbot: 'Betretungsverbot', einreiseverbot: 'Einreiseverbot' }
export const FAHNDUNG_ART_LABEL: Record<FahndungArt, string> = { person: 'Person', fahrzeug: 'Fahrzeug', objekt: 'Objekt', sonstiges: 'Sonstiges' }
export function formatTime(value: string) { return new Date(value).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) }

const INCIDENT_REASON_RULES: { code: string; patterns: RegExp[] }[] = [
  { code: 'haeuslicher_streit', patterns: [/\bhäuslich(?:er|en|e)?\s+streit\b/i, /\bfamili(?:en|ärer|aerer)streit\b/i] },
  { code: 'hilfeschreie', patterns: [/\bhilfeschrei/i, /\bschrei(?:t|e|en).*\bhilfe\b/i, /\bruft.*\bhilfe\b/i] },
  { code: 'schuesse_knall', patterns: [/\bsch[uü]ss/i, /\bknallgeräusch/i, /\bknall(?:e|geräusche)?\b/i] },
  { code: 'verkehrsunfall', patterns: [/\bverkehrsunfall\b/i, /\bunfall\b.*\b(?:pkw|auto|fahrzeug|motorrad|rad)\b/i, /\b(?:pkw|auto|fahrzeug|motorrad|rad).*\bunfall\b/i] },
  { code: 'verkehrsbehinderung', patterns: [/\bverkehrsbehinderung\b/i, /\bfahrbahn.*\bblockiert\b/i, /\bblockiert.*\bfahrbahn\b/i] },
  { code: 'falschparker', patterns: [/\bfalschpark/i, /\bverkehrsbehindernd\s+geparkt\b/i] },
  { code: 'vermisste_person', patterns: [/\bvermisst/i, /\bvermisste\s+person\b/i] },
  { code: 'person_in_not', patterns: [/\bperson.*\bnotlage\b/i, /\bhilflose\s+person\b/i, /\bperson.*\bverletzt\b/i] },
  { code: 'einbruch', patterns: [/\beinbruch/i, /\beingebrochen\b/i] },
  { code: 'alarmanlage', patterns: [/\balarmanlage\b/i, /\beinbruchalarm\b/i, /\balarm ausgelöst\b/i] },
  { code: 'ruhestoerung', patterns: [/\bruhestörung\b/i, /\blärmbelästigung\b/i, /\blärm\b/i] },
  { code: 'sachbeschaedigung', patterns: [/\bsachbeschädigung\b/i, /\bbeschädigt\b/i, /\bvandalismus\b/i] },
  { code: 'verdaechtige_wahrnehmung', patterns: [/\bverdächtig/i, /\bauffällige\s+person\b/i, /\bauffälliges\s+fahrzeug\b/i] },
  { code: 'streit', patterns: [/\bstreit\b/i, /\bauseinandersetzung\b/i] },
  { code: 'tier_fund', patterns: [/\bfundtier\b/i, /\btier gefunden\b/i, /\bfreilaufend(?:er|es|e)?\s+(?:hund|tier)\b/i] },
]

/**
 * Deterministische, bewusst konservative Zuordnung. Nur wenn genau eine
 * fachliche Kategorie passt, wird ein interner Grund gesetzt. Keine KI,
 * keine sicherheitsrelevante Ableitung aus unscharfen Treffern.
 */
export function detectIncidentReason(summary: string): string | null {
  const text = summary.trim()
  if (!text) return null
  const matches = INCIDENT_REASON_RULES.filter(rule => rule.patterns.some(pattern => pattern.test(text))).map(rule => rule.code)
  const unique = [...new Set(matches)]
  return unique.length === 1 ? unique[0] : null
}

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
  reasonCode: string
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
  location: '', reasonCode: '', summary: '', involvedPersonId: null, disposition: 'offen', assignedVehicleId: null, note: '',
  lat: null, lng: null, coordsPrecise: false, reportedTime: '',
}
