import { describe, expect, it } from 'vitest'
import { berechneSollstunden, istWerktag, werktageImMonat } from './dienstplanSollstunden'

describe('istWerktag', () => {
  it('zählt Montag bis Freitag als Werktag', () => {
    expect(istWerktag(new Date(2026, 8, 21))).toBe(true) // Montag
    expect(istWerktag(new Date(2026, 8, 25))).toBe(true) // Freitag
  })

  it('zählt Samstag und Sonntag nicht als Werktag', () => {
    expect(istWerktag(new Date(2026, 8, 26))).toBe(false) // Samstag
    expect(istWerktag(new Date(2026, 8, 27))).toBe(false) // Sonntag
  })

  it('zählt einen gesetzlichen Feiertag an einem Wochentag nicht als Werktag', () => {
    expect(istWerktag(new Date(2026, 9, 26))).toBe(false) // Nationalfeiertag, Montag 2026
  })
})

describe('werktageImMonat', () => {
  it('berechnet die Werktage für Oktober 2026 (22 Wochentage Mo-Fr, davon 1 Feiertag am 26.10.)', () => {
    expect(werktageImMonat(2026, 10)).toBe(21)
  })

  it('berechnet die Werktage für einen Monat ohne Feiertag (Februar 2026)', () => {
    expect(werktageImMonat(2026, 2)).toBe(20)
  })
})

describe('berechneSollstunden', () => {
  it('rechnet Werktage × Stunden pro Werktag für Vollzeit (Beschäftigungsgrad 111)', () => {
    expect(berechneSollstunden('2026-02', 8.75, 111)).toBeCloseTo(20 * 8.75, 5)
  })

  it('skaliert linear mit dem Beschäftigungsgrad (55.5 = halbe Vollzeit)', () => {
    expect(berechneSollstunden('2026-02', 8.75, 55.5)).toBeCloseTo((20 * 8.75) / 2, 5)
  })

  it('akzeptiert sowohl YYYY-MM als auch YYYY-MM-DD', () => {
    expect(berechneSollstunden('2026-02-01', 8.75, 111)).toBe(berechneSollstunden('2026-02', 8.75, 111))
  })

  it('rundet auf Viertelstunden', () => {
    const ergebnis = berechneSollstunden('2026-02', 8.7, 90)
    expect(ergebnis * 4).toBeCloseTo(Math.round(ergebnis * 4), 10)
  })
})
