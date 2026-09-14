// Gesetzliche Feiertage in Österreich - bundesweit, gilt auch für Vorarlberg
// (anders als z. B. in Deutschland gibt es in Österreich keine zusätzlichen,
// nur landesweit geltenden Feiertage). Für die automatische Aufschlüsselung
// der Überstundenmeldung (siehe ueberstunden.ts) relevant, weil Sonn- und
// Feiertage eigene Lohnarten haben.

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/** Ostersonntag nach der gaußschen Osterformel (Meeus/Jones/Butcher-Algorithmus, gregorianischer Kalender). */
function osterSonntag(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

/** Alle 13 gesetzlichen Feiertage eines Jahres, aufsteigend sortiert. */
export function austrianHolidays(year: number): Date[] {
  const ostern = osterSonntag(year)
  return [
    new Date(year, 0, 1), // Neujahr
    new Date(year, 0, 6), // Heilige Drei Könige
    addDays(ostern, 1), // Ostermontag
    new Date(year, 4, 1), // Staatsfeiertag
    addDays(ostern, 39), // Christi Himmelfahrt
    addDays(ostern, 50), // Pfingstmontag
    addDays(ostern, 60), // Fronleichnam
    new Date(year, 7, 15), // Mariä Himmelfahrt
    new Date(year, 9, 26), // Nationalfeiertag
    new Date(year, 10, 1), // Allerheiligen
    new Date(year, 11, 8), // Mariä Empfängnis
    new Date(year, 11, 25), // Christtag
    new Date(year, 11, 26), // Stefanitag
  ].sort((a, b) => a.getTime() - b.getTime())
}

function sameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function isAustrianHoliday(date: Date): boolean {
  return austrianHolidays(date.getFullYear()).some(holiday => sameDate(holiday, date))
}

/** Sonntag oder gesetzlicher Feiertag - für die Überstunden-Lohnart "Sonn-/Feiertag" maßgeblich. */
export function isSonnOderFeiertag(date: Date): boolean {
  return date.getDay() === 0 || isAustrianHoliday(date)
}
