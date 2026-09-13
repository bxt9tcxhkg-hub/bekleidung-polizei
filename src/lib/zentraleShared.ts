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

export const EMPTY_BAUSTELLE_FORM = {
  titel: '', startAddress: '', endAddress: '', note: '', gueltigBis: '',
  startLat: null as number | null, startLng: null as number | null,
  endLat: null as number | null, endLng: null as number | null,
  path: null as [number, number][] | null,
  drawMode: false,
}
export type BaustelleFormState = typeof EMPTY_BAUSTELLE_FORM

export type IncidentFormState = { callerPhone: string; callerName: string; street: string; houseNumber: string; houseNumberUnknown: boolean; location: string; summary: string; involvedPerson: string; involvedBirthDate: string; disposition: IncidentDisposition; note: string; lat: number | null; lng: number | null; coordsPrecise: boolean }
