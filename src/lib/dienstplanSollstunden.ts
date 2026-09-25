// Sollstunden-Formel für die Dienstplan-Planung (siehe
// dienstplan_regeln/dienstplan_person_einstellungen): Werktage im Monat
// (Montag-Freitag, ohne gesetzliche Feiertage) × Stunden pro Werktag ×
// Beschäftigungsgrad. Der Wert ist bewusst NICHT pro Monat in der DB
// gespeichert (unterschiedlicher Beschäftigungsgrad ergibt einen anderen
// Wert je Person) - diese reine Funktion wird stattdessen überall dort
// aufgerufen, wo Sollstunden angezeigt werden (Regel-Einstellungsseite,
// später Meine Dienste/Planer-Grid).
import { isAustrianHoliday } from './austrianHolidays'

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

/** Rundet auf Viertelstunden - wie bei der Lohnverrechnung üblich (siehe lib/dienstplanAuswertung.ts). */
export function rundeViertelstunde(wert: number): number { return Math.round(wert * 4) / 4 }

/**
 * Sollstunden für eine Person in einem Monat.
 * @param monat 'YYYY-MM' oder 'YYYY-MM-DD' (nur Jahr/Monat werden ausgewertet)
 * @param stundenProWerktag aus dienstplan_regeln.stunden_pro_werktag
 * @param beschaeftigungsgrad aus dienstplan_person_einstellungen.beschaeftigungsgrad (100 = Vollzeit)
 */
export function berechneSollstunden(monat: string, stundenProWerktag: number, beschaeftigungsgrad: number): number {
  const [jahrText, monatText] = monat.split('-')
  const jahr = Number(jahrText)
  const monatNr = Number(monatText)
  const werktage = werktageImMonat(jahr, monatNr)
  return rundeViertelstunde(werktage * stundenProWerktag * (beschaeftigungsgrad / 100))
}
