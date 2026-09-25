import { describe, it, expect } from 'vitest'
import { dienstZeitraum, dienstZeitraumMitNachtdienstDefault, persoenlicheStundenUebersicht, type DienstplanDienstZeile } from './dienstplanAuswertung'

describe('dienstZeitraum', () => {
  it('baut einen normalen Tageszeitraum', () => {
    const zeitraum = dienstZeitraum({ datum: '2026-02-03', von_zeit: '08:00', bis_zeit: '19:00' })
    expect(zeitraum).toEqual({ von: new Date(2026, 1, 3, 8, 0), bis: new Date(2026, 1, 3, 19, 0) })
  })
  it('erkennt einen Nachtdienst über Mitternacht (Ende vor Beginn) und verschiebt das Ende auf den Folgetag', () => {
    const zeitraum = dienstZeitraum({ datum: '2026-02-03', von_zeit: '22:00', bis_zeit: '06:00' })
    expect(zeitraum).toEqual({ von: new Date(2026, 1, 3, 22, 0), bis: new Date(2026, 1, 4, 6, 0) })
  })
  it('ohne Uhrzeit (krank/Urlaub) gibt es keinen Zeitraum', () => {
    expect(dienstZeitraum({ datum: '2026-02-03', von_zeit: null, bis_zeit: null })).toBeNull()
  })
})

describe('dienstZeitraumMitNachtdienstDefault', () => {
  it('ohne Uhrzeit gilt der Nachtdienst-Standardzeitraum 19:00-08:00 Uhr des Folgetags', () => {
    const zeitraum = dienstZeitraumMitNachtdienstDefault({ datum: '2026-02-03', von_zeit: null, bis_zeit: null })
    expect(zeitraum).toEqual({ von: new Date(2026, 1, 3, 19, 0), bis: new Date(2026, 1, 4, 8, 0) })
  })
  it('mit Uhrzeit bleibt es beim tatsächlichen Zeitraum, kein Nachtdienst-Default', () => {
    const zeitraum = dienstZeitraumMitNachtdienstDefault({ datum: '2026-02-03', von_zeit: '08:00', bis_zeit: '19:00' })
    expect(zeitraum).toEqual({ von: new Date(2026, 1, 3, 8, 0), bis: new Date(2026, 1, 3, 19, 0) })
  })
})

function zeile(overrides: Partial<DienstplanDienstZeile>): DienstplanDienstZeile {
  return { datum: '2026-02-02', von_zeit: '08:00', bis_zeit: '19:00', kategorie: 'dienst', ...overrides }
}

describe('persoenlicheStundenUebersicht', () => {
  it('zählt krank/Urlaub (ohne Uhrzeit) nicht als Arbeitsstunden, nur echte Dienste', () => {
    // Montag 2.2.2026 - gewöhnlicher Werktag.
    const ergebnis = persoenlicheStundenUebersicht([
      zeile({ datum: '2026-02-02', von_zeit: '08:00', bis_zeit: '19:00' }),
      zeile({ datum: '2026-02-03', kategorie: 'krank', von_zeit: null, bis_zeit: null }),
      zeile({ datum: '2026-02-04', kategorie: 'urlaub', von_zeit: null, bis_zeit: null }),
    ])
    expect(ergebnis).toEqual({ gesamt: 11, sonnFeiertag: 0, tag: 11, nacht: 0 })
  })

  it('ein Dienst ohne Uhrzeit zählt als Nachtdienst 19:00-08:00 Uhr (13 Std., davon 2 Std. Tag nach 06:00)', () => {
    // Montag 2.2.2026, Nachtdienst ohne Uhrzeit in der Zelle.
    const ergebnis = persoenlicheStundenUebersicht([zeile({ datum: '2026-02-02', von_zeit: null, bis_zeit: null })])
    expect(ergebnis).toEqual({ gesamt: 13, sonnFeiertag: 0, tag: 2, nacht: 11 })
  })

  it('ein Sonntagsdienst zählt komplett zu Sonn-/Feiertagsstunden, unabhängig von der Uhrzeit', () => {
    // Sonntag 1.2.2026.
    const ergebnis = persoenlicheStundenUebersicht([zeile({ datum: '2026-02-01', von_zeit: '08:00', bis_zeit: '19:00' })])
    expect(ergebnis).toEqual({ gesamt: 11, sonnFeiertag: 11, tag: 11, nacht: 0 })
  })

  it('summiert mehrere Dienste über den Monat hinweg (Tag- und Nachtstunden getrennt)', () => {
    const ergebnis = persoenlicheStundenUebersicht([
      zeile({ datum: '2026-02-02', von_zeit: '08:00', bis_zeit: '19:00' }), // 11 Std Tag
      zeile({ datum: '2026-02-05', von_zeit: '22:00', bis_zeit: '06:00' }), // 8 Std Nacht (22-06)
    ])
    expect(ergebnis).toEqual({ gesamt: 19, sonnFeiertag: 0, tag: 11, nacht: 8 })
  })

  it('leere Liste ergibt lauter Nullen', () => {
    expect(persoenlicheStundenUebersicht([])).toEqual({ gesamt: 0, sonnFeiertag: 0, tag: 0, nacht: 0 })
  })
})
