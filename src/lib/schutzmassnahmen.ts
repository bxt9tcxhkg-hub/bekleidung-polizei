import type { OperationalObject, OperationalPerson } from './types'

export type Schutzmassnahme = 'bv_av' | 'ev'
export type SchutzfallStatus = 'aktiv' | 'aufgehoben' | 'abgelaufen'
export type EvRechtsgrundlage = '382b' | '382c' | 'kombiniert'

export interface Schutzbereich {
  id: string
  schutzfall_id: string
  art: 'wohnung' | 'ort'
  object_id: string | null
  bezeichnung: string
  lat: number
  lng: number
  radius_m: number
  position_bestaetigt: boolean
  sort_order: number
  object?: Pick<OperationalObject, 'id' | 'address' | 'label'> | null
}

export interface Schutzkontrolle {
  id: string
  schutzfall_id: string
  kontrolliert_am: string
  notiz: string | null
  created_by: string
}

export interface Schutzfall {
  id: string
  massnahme: Schutzmassnahme
  ev_rechtsgrundlage: EvRechtsgrundlage | null
  gefaehrder_id: string
  pad_aktenzahl: string
  externe_aktenzahl: string | null
  ausstellende_stelle: string | null
  beginn: string
  ende: string
  status: SchutzfallStatus
  waffenverbot: boolean
  schluessel_status: 'nicht_erfasst' | 'abgenommen' | 'verwahrt' | 'gericht' | 'ausgefolgt'
  schluessel_verwahrort: string | null
  ausnahmen: string | null
  hinweise: string | null
  /** Legt fest, ob beim Anlegen/Bearbeiten ein Kontrollauftrag für die Streife erzeugt werden soll (siehe create_schutzfall_kontrollauftrag/remove_schutzfall_kontrollauftrag). */
  kontrolle_erforderlich: boolean
  created_by: string
  created_at: string
  updated_at: string
  gefaehrder?: Pick<OperationalPerson, 'id' | 'vorname' | 'nachname' | 'birth_date'> | null
  geschuetzte?: { person_id: string; person?: Pick<OperationalPerson, 'id' | 'vorname' | 'nachname' | 'birth_date'> | null }[]
  bereiche?: Schutzbereich[]
  kontrollen?: Schutzkontrolle[]
}

export const SCHUTZ_SELECT = '*, gefaehrder:operational_persons!schutzfaelle_gefaehrder_id_fkey(id,vorname,nachname,birth_date), geschuetzte:schutzfall_personen(person_id,person:operational_persons(id,vorname,nachname,birth_date)), bereiche:schutzbereiche(*,object:operational_objects(id,address,label)), kontrollen:schutzkontrollen(id,schutzfall_id,kontrolliert_am,notiz,created_by)'

export const MASSNAHME_LABEL: Record<Schutzmassnahme, string> = {
  bv_av: 'Betretungs- und Annäherungsverbot',
  ev: 'Einstweilige Verfügung',
}

export function localDateTimeInput(value: Date | string = new Date()) {
  const date = typeof value === 'string' ? new Date(value) : value
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function defaultBvAvEnd(begin: string) {
  return localDateTimeInput(new Date(new Date(begin).getTime() + 14 * 24 * 60 * 60 * 1000))
}

export function firstControlDeadline(item: Pick<Schutzfall, 'beginn'>) {
  return new Date(new Date(item.beginn).getTime() + 72 * 60 * 60 * 1000)
}

export function hasInitialControl(item: Pick<Schutzfall, 'beginn' | 'kontrollen'>) {
  const deadline = firstControlDeadline(item).getTime()
  return (item.kontrollen ?? []).some(row => {
    const time = new Date(row.kontrolliert_am).getTime()
    return time >= new Date(item.beginn).getTime() && time <= deadline
  })
}

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const lat1 = a.lat * rad
  const lat2 = b.lat * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function assessDistance(distance: number, limit = 100, accuracy = 0) {
  if (distance + accuracy < limit) return { code: 'innerhalb' as const, label: 'innerhalb', color: 'text-red-700 bg-red-50 border-red-200' }
  if (distance - accuracy > limit) return { code: 'ausserhalb' as const, label: 'außerhalb', color: 'text-green-700 bg-green-50 border-green-200' }
  return { code: 'unklar' as const, label: 'im Genauigkeitsbereich der Grenze', color: 'text-amber-800 bg-amber-50 border-amber-200' }
}

export function distanceNote(distance: number, accuracy: number, subject: string, limit = 100) {
  const assessment = assessDistance(distance, limit, accuracy)
  const accuracyText = accuracy > 0 ? `; Standortgenauigkeit ±${Math.round(accuracy)} m` : '; Position(en) manuell auf Karte gesetzt'
  return `Distanzhinweis ${subject}: Luftlinie ca. ${Math.round(distance)} m${accuracyText}; technische Einschätzung: ${assessment.label} des ${limit}-m-Abstands. PAD-Protokollierung/rechtliche Beurteilung separat.`
}
