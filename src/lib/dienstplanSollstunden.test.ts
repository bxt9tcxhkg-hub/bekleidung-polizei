import { describe, expect, it } from 'vitest'
import { berechneSollstunden, istWerktag, naechsterPlanbarerMonat, werktageImMonat } from './dienstplanSollstunden'

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
    expect(berechneSollstunden('2026-02', 8.75, 111)).toBe(Math.floor(20 * 8.75))
  })

  it('skaliert linear mit dem Beschäftigungsgrad (55.5 = halbe Vollzeit)', () => {
    expect(berechneSollstunden('2026-02', 8.75, 55.5)).toBe(Math.floor((20 * 8.75) / 2))
  })

  it('akzeptiert sowohl YYYY-MM als auch YYYY-MM-DD', () => {
    expect(berechneSollstunden('2026-02-01', 8.75, 111)).toBe(berechneSollstunden('2026-02', 8.75, 111))
  })

  it('rundet immer ab auf die volle Stunde, nie auf', () => {
    expect(berechneSollstunden('2026-02', 8.7, 90)).toBe(Math.floor((20 * 8.7 * 90) / 111))
    // 20 Werktage × 8.75 × 111/111 = 175 - exakt, bleibt unverändert
    expect(berechneSollstunden('2026-02', 8.75, 111)).toBe(175)
  })
})

describe('naechsterPlanbarerMonat', () => {
  it('bleibt beim aktuellen Monat, wenn dafür noch kein Dienstplan existiert', () => {
    expect(naechsterPlanbarerMonat([], '2026-09')).toBe('2026-09')
    expect(naechsterPlanbarerMonat(['2026-08'], '2026-09')).toBe('2026-09')
  })

  it('springt zum ersten noch freien Folgemonat, wenn der aktuelle und folgende Monate schon angelegt sind', () => {
    // September und Oktober bereits angelegt (Oktober z. B. schon verschickt) - nächster freier Monat ist November.
    expect(naechsterPlanbarerMonat(['2026-09', '2026-10'], '2026-09')).toBe('2026-11')
  })

  it('springt über den Jahreswechsel', () => {
    expect(naechsterPlanbarerMonat(['2026-12'], '2026-12')).toBe('2027-01')
  })
})
