import { describe, it, expect } from 'vitest'
import { austrianHolidays, isAustrianHoliday, isSonnOderFeiertag } from './austrianHolidays'

describe('austrianHolidays', () => {
  it('enthält alle 13 gesetzlichen Feiertage 2026', () => {
    const holidays = austrianHolidays(2026)
    expect(holidays).toHaveLength(13)
    const iso = holidays.map(d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    expect(iso).toEqual([
      '2026-01-01', // Neujahr
      '2026-01-06', // Heilige Drei Könige
      '2026-04-06', // Ostermontag (Ostersonntag 2026: 5. April)
      '2026-05-01', // Staatsfeiertag
      '2026-05-14', // Christi Himmelfahrt
      '2026-05-25', // Pfingstmontag
      '2026-06-04', // Fronleichnam
      '2026-08-15', // Mariä Himmelfahrt
      '2026-10-26', // Nationalfeiertag
      '2026-11-01', // Allerheiligen
      '2026-12-08', // Mariä Empfängnis
      '2026-12-25', // Christtag
      '2026-12-26', // Stefanitag
    ])
  })

  it('erkennt bewegliche Feiertage in anderen Jahren korrekt (Ostermontag 2025)', () => {
    expect(isAustrianHoliday(new Date(2025, 3, 21))).toBe(true) // Ostersonntag 2025: 20. April
    expect(isAustrianHoliday(new Date(2025, 3, 20))).toBe(false) // Ostersonntag selbst ist kein gesetzlicher Feiertag
  })

  it('ein gewöhnlicher Werktag ist kein Feiertag', () => {
    expect(isAustrianHoliday(new Date(2026, 8, 14))).toBe(false) // 14. September 2026, Montag
  })

  it('isSonnOderFeiertag erkennt Sonntage unabhängig vom Feiertagskalender', () => {
    expect(isSonnOderFeiertag(new Date(2026, 8, 13))).toBe(true) // Sonntag
    expect(isSonnOderFeiertag(new Date(2026, 8, 14))).toBe(false) // Montag, kein Feiertag
    expect(isSonnOderFeiertag(new Date(2026, 9, 26))).toBe(true) // Nationalfeiertag, ein Montag
  })
})
