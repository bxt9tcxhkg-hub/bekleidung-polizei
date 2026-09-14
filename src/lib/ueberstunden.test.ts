import { describe, it, expect } from 'vitest'
import { berechneAufschluesselung } from './ueberstunden'

// Montag, 14.09.2026 - ein gewöhnlicher Werktag (siehe austrianHolidays.test.ts).
const WERKTAG = (h: number, m = 0) => new Date(2026, 8, 14, h, m)
// Sonntag, 13.09.2026.
const SONNTAG = (h: number, m = 0) => new Date(2026, 8, 13, h, m)
// Nationalfeiertag 2026 - fällt auf einen Montag.
const FEIERTAG = (h: number, m = 0) => new Date(2026, 9, 26, h, m)

describe('berechneAufschluesselung', () => {
  it('Werktag tagsüber (06-19) zählt voll zu LA 3250', () => {
    const result = berechneAufschluesselung(WERKTAG(10), WERKTAG(14))
    expect(result).toEqual({ std_werktag_50: 4, std_sonn_100: 0, std_19_22: 0, std_22_06: 0, std_sonn_200: 0 })
  })

  it('Werktag-Abend teilt sich auf 19-22 und 22-06 auf', () => {
    const result = berechneAufschluesselung(WERKTAG(20), WERKTAG(23))
    expect(result.std_19_22).toBe(2) // 20-22
    expect(result.std_22_06).toBe(1) // 22-23
    expect(result.std_werktag_50).toBe(0)
  })

  it('ein Abschnitt über Mitternacht in einen weiteren Werktag zählt beide Nachthälften zu 22-06', () => {
    const result = berechneAufschluesselung(WERKTAG(23), new Date(2026, 8, 15, 1))
    expect(result.std_22_06).toBe(2) // 23-24 Montag + 00-01 Dienstag
  })

  it('ein Abschnitt über mehrere Zeitfenster hinweg wird korrekt auf alle Werktags-Kategorien verteilt', () => {
    const result = berechneAufschluesselung(WERKTAG(18), WERKTAG(23))
    expect(result.std_werktag_50).toBe(1) // 18-19
    expect(result.std_19_22).toBe(3) // 19-22
    expect(result.std_22_06).toBe(1) // 22-23
  })

  it('Sonntag: die ersten 8 Stunden zählen zu 100 %, der Rest zu 200 %', () => {
    const result = berechneAufschluesselung(SONNTAG(8), SONNTAG(18))
    expect(result.std_sonn_100).toBe(8)
    expect(result.std_sonn_200).toBe(2)
    expect(result.std_werktag_50).toBe(0)
    expect(result.std_19_22).toBe(0)
  })

  it('ein Feiertag zählt komplett zur Feiertagsregel, unabhängig von der Uhrzeit', () => {
    const result = berechneAufschluesselung(FEIERTAG(9), FEIERTAG(12))
    expect(result).toEqual({ std_werktag_50: 0, std_sonn_100: 3, std_19_22: 0, std_22_06: 0, std_sonn_200: 0 })
  })

  it('ein Zeitraum von einem Werktag in einen Sonntag hinein wechselt an Mitternacht die Lohnart', () => {
    // Samstag 12.09.2026, 22:00 bis Sonntag 13.09.2026, 02:00
    const result = berechneAufschluesselung(new Date(2026, 8, 12, 22), new Date(2026, 8, 13, 2))
    expect(result.std_22_06).toBe(2) // Samstag 22-24, Werktag-Nachtstunden
    expect(result.std_sonn_100).toBe(2) // Sonntag 00-02, erste Stunden des Feiertags
  })

  it('leerer oder ungültiger Zeitraum ergibt lauter Nullen', () => {
    expect(berechneAufschluesselung(WERKTAG(10), WERKTAG(10))).toEqual({ std_werktag_50: 0, std_sonn_100: 0, std_19_22: 0, std_22_06: 0, std_sonn_200: 0 })
    expect(berechneAufschluesselung(WERKTAG(14), WERKTAG(10))).toEqual({ std_werktag_50: 0, std_sonn_100: 0, std_19_22: 0, std_22_06: 0, std_sonn_200: 0 })
  })

  it('rundet auf Viertelstunden', () => {
    const result = berechneAufschluesselung(WERKTAG(10, 0), WERKTAG(10, 40))
    expect(result.std_werktag_50).toBe(0.75) // 40 Minuten ≈ 0.667 Std, nächste Viertelstunde
  })
})
