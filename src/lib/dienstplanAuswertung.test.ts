import { describe, it, expect } from 'vitest'
import { dienstZeitraum, persoenlicheStundenUebersicht, type DienstplanDienstZeile } from './dienstplanAuswertung'

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

function zeile(overrides: Partial<DienstplanDienstZeile>): DienstplanDienstZeile {
  return { datum: '2026-02-02', von_zeit: '08:00', bis_zeit: '19:00', kategorie: 'dienst', ...overrides }
}

describe('persoenlicheStundenUebersicht', () => {
  it('summiert nur Dienst-Einträge mit erkennbarer Uhrzeit', () => {
    // Montag 2.2.2026 - gewöhnlicher Werktag.
    const ergebnis = persoenlicheStundenUebersicht([
      zeile({ datum: '2026-02-02', von_zeit: '08:00', bis_zeit: '19:00' }),
      zeile({ datum: '2026-02-03', kategorie: 'krank', von_zeit: null, bis_zeit: null }),
      zeile({ datum: '2026-02-04', kategorie: 'urlaub', von_zeit: null, bis_zeit: null }),
    ])
    expect(ergebnis.stunden.std_werktag_50).toBe(11) // 08-19 Uhr
    expect(ergebnis.gesamt).toBe(11)
  })

  it('kategorisiert einen Sonntagsdienst korrekt (100%/200%-Schwelle)', () => {
    // Sonntag 1.2.2026.
    const ergebnis = persoenlicheStundenUebersicht([zeile({ datum: '2026-02-01', von_zeit: '08:00', bis_zeit: '19:00' })])
    expect(ergebnis.stunden.std_sonn_100).toBe(8)
    expect(ergebnis.stunden.std_sonn_200).toBe(3)
    expect(ergebnis.gesamt).toBe(11)
  })

  it('summiert mehrere Dienste über den Monat hinweg', () => {
    const ergebnis = persoenlicheStundenUebersicht([
      zeile({ datum: '2026-02-02', von_zeit: '08:00', bis_zeit: '19:00' }), // 11 Std Werktag
      zeile({ datum: '2026-02-05', von_zeit: '22:00', bis_zeit: '06:00' }), // 8 Std Nacht (22-06)
    ])
    expect(ergebnis.stunden.std_werktag_50).toBe(11)
    expect(ergebnis.stunden.std_22_06).toBe(8)
    expect(ergebnis.gesamt).toBe(19)
  })

  it('leere Liste ergibt lauter Nullen', () => {
    const ergebnis = persoenlicheStundenUebersicht([])
    expect(ergebnis.gesamt).toBe(0)
    expect(ergebnis.stunden).toEqual({ std_werktag_50: 0, std_sonn_100: 0, std_19_22: 0, std_22_06: 0, std_sonn_200: 0 })
  })
})
