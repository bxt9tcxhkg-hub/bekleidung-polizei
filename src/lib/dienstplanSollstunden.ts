// Sollstunden-Formel für die Dienstplan-Planung (siehe
// dienstplan_regeln/dienstplan_person_einstellungen): Werktage im Monat
// (Montag-Freitag, ohne gesetzliche Feiertage) × Stunden pro Werktag ×
// Beschäftigungsgrad. Der Wert ist bewusst NICHT pro Monat in der DB
// gespeichert (unterschiedlicher Beschäftigungsgrad ergibt einen anderen
// Wert je Person) - diese reine Funktion wird stattdessen überall dort
// aufgerufen, wo Sollstunden angezeigt werden (Regel-Einstellungsseite,
// später Meine Dienste/Planer-Grid).
import { isAustrianHoliday } from './austrianHolidays'

/** Beschäftigungsgrad wird auf der hausinternen Skala geführt, auf der Vollzeit 111 ist (nicht 100) - siehe dienstplan_person_einstellungen. Wird auch für das Freiplanungswunsch-Kontingent verwendet (siehe lib/dienstplanWunsch.ts). */
export const VOLLZEIT_BESCHAEFTIGUNGSGRAD = 111

/** Montag bis Freitag, kein gesetzlicher Feiertag - die für die Sollstunden-Formel maßgebliche "Werktag"-Definition. */
export function istWerktag(date: Date): boolean {
  const wochentag = date.getDay()
  return wochentag >= 1 && wochentag <= 5 && !isAustrianHoliday(date)
}

/** Anzahl Werktage (siehe istWerktag) in einem Kalendermonat. */
export function werktageImMonat(jahr: number, monatNr: number): number {
  const letzterTag = new Date(jahr, monatNr, 0).getDate()
  let anzahl = 0
  for (let tag = 1; tag <= letzterTag; tag++) {
    if (istWerktag(new Date(jahr, monatNr - 1, tag))) anzahl++
  }
  return anzahl
}

/** Bei den Sollstunden zählt laut Kommandant nur die volle Stunde - es wird immer abgerundet, nie aufgerundet. */
export function rundeAbVolleStunde(wert: number): number { return Math.floor(wert) }

/** Nächster Kalendermonat als 'YYYY-MM'. */
function naechsterMonat(monat: string): string {
  const [jahrText, monatText] = monat.split('-')
  const jahr = Number(jahrText)
  const monatNr = Number(monatText)
  return monatNr === 12 ? `${jahr + 1}-01` : `${jahr}-${String(monatNr + 1).padStart(2, '0')}`
}

/**
 * Der nächste Monat, für den noch kein Dienstplan angelegt wurde (egal ob
 * Entwurf oder veröffentlicht) - für die Sollstunden-Vorschau in den
 * Dienstplan-Einstellungen. Ausgangspunkt ist der aktuelle Kalendermonat,
 * aber wenn dafür (und für folgende Monate) bereits ein Dienstplan existiert
 * - z. B. weil der Oktober-Dienstplan schon verschickt wurde, während wir
 * uns noch im September befinden - zählt erst der erste freie Monat danach.
 */
export function naechsterPlanbarerMonat(vorhandeneMonate: readonly string[], heute: string): string {
  const vorhanden = new Set(vorhandeneMonate.map(monat => monat.slice(0, 7)))
  let kandidat = heute.slice(0, 7)
  while (vorhanden.has(kandidat)) kandidat = naechsterMonat(kandidat)
  return kandidat
}

/**
 * Sollstunden für eine Person in einem Monat.
 * @param monat 'YYYY-MM' oder 'YYYY-MM-DD' (nur Jahr/Monat werden ausgewertet)
 * @param stundenProWerktag aus dienstplan_regeln.stunden_pro_werktag
 * @param beschaeftigungsgrad aus dienstplan_person_einstellungen.beschaeftigungsgrad (111 = Vollzeit, siehe VOLLZEIT_BESCHAEFTIGUNGSGRAD)
 */
export function berechneSollstunden(monat: string, stundenProWerktag: number, beschaeftigungsgrad: number): number {
  const [jahrText, monatText] = monat.split('-')
  const jahr = Number(jahrText)
  const monatNr = Number(monatText)
  const werktage = werktageImMonat(jahr, monatNr)
  return rundeAbVolleStunde(werktage * stundenProWerktag * (beschaeftigungsgrad / VOLLZEIT_BESCHAEFTIGUNGSGRAD))
}
