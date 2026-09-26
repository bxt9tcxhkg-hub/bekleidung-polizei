import { describe, it, expect } from 'vitest'
import { dienstZeitraum, dienstZeitraumMitNachtdienstDefault, persoenlicheStundenUebersicht, zaehleDienstarten, type DienstplanDienstZeile } from './dienstplanAuswertung'

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

  it('ein Dienst ohne Uhrzeit zählt als Nachtdienst 19:00-08:00 Uhr (13 Std., komplett Nachtstunden)', () => {
    // Montag 2.2.2026, Nachtdienst ohne Uhrzeit in der Zelle.
    const ergebnis = persoenlicheStundenUebersicht([zeile({ datum: '2026-02-02', von_zeit: null, bis_zeit: null })])
    expect(ergebnis).toEqual({ gesamt: 13, sonnFeiertag: 0, tag: 0, nacht: 13 })
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

  it('Tagdienst-Grenze ist 08-19 Uhr, nicht 06-19 Uhr - Stunden davor/danach zählen zu Nacht', () => {
    // 06:00-19:00 Uhr: die ersten 2 Std. (06-08) zählen zur Nacht, erst ab 08:00 zu Tag.
    const ergebnis = persoenlicheStundenUebersicht([zeile({ datum: '2026-02-02', von_zeit: '06:00', bis_zeit: '19:00' })])
    expect(ergebnis).toEqual({ gesamt: 13, sonnFeiertag: 0, tag: 11, nacht: 2 })
  })

  it('leere Liste ergibt lauter Nullen', () => {
    expect(persoenlicheStundenUebersicht([])).toEqual({ gesamt: 0, sonnFeiertag: 0, tag: 0, nacht: 0 })
  })
})

describe('zaehleDienstarten', () => {
  it('zählt Z/ID/JD als Grunddienst, alles andere als Zusatzdienst, je nach Uhrzeit Tag oder Nacht', () => {
    const ergebnis = zaehleDienstarten([
      { rohtext: 'Z', von_zeit: '08:00', kategorie: 'dienst', markierung_id: null },
      { rohtext: 'JD', von_zeit: null, kategorie: 'dienst', markierung_id: null },
      { rohtext: 'VD', von_zeit: '08:00', kategorie: 'dienst', markierung_id: null },
      { rohtext: 'SVE', von_zeit: null, kategorie: 'dienst', markierung_id: null },
    ])
    expect(ergebnis).toEqual({ grundTag: 1, grundNacht: 1, zusatzTag: 1, zusatzNacht: 1, ueberstunden: 0 })
  })

  it('ignoriert Abwesenheiten (kategorie != dienst)', () => {
    expect(zaehleDienstarten([{ rohtext: 'U', von_zeit: null, kategorie: 'urlaub', markierung_id: null }])).toEqual({ grundTag: 0, grundNacht: 0, zusatzTag: 0, zusatzNacht: 0, ueberstunden: 0 })
  })

  it('erkennt Grunddienst auch in kombinierten Codes (z. B. "SVE/JD")', () => {
    expect(zaehleDienstarten([{ rohtext: 'SVE/JD', von_zeit: '08:00', kategorie: 'dienst', markierung_id: null }])).toEqual({ grundTag: 1, grundNacht: 0, zusatzTag: 0, zusatzNacht: 0, ueberstunden: 0 })
  })

  it('zählt Diensteinträge mit der System-Markierung "Überstunden" zusätzlich in ueberstunden, ohne die Grund-/Zusatzdienst-Zählung zu beeinflussen', () => {
    const ergebnis = zaehleDienstarten([
      { rohtext: 'Z', von_zeit: '08:00', kategorie: 'dienst', markierung_id: 'ueberstunden-id' },
      { rohtext: 'VD', von_zeit: '08:00', kategorie: 'dienst', markierung_id: null },
    ], 'ueberstunden-id')
    expect(ergebnis).toEqual({ grundTag: 1, grundNacht: 0, zusatzTag: 1, zusatzNacht: 0, ueberstunden: 1 })
  })

  it('zählt ohne übergebene ueberstundenMarkierungId keine Überstunden', () => {
    expect(zaehleDienstarten([{ rohtext: 'Z', von_zeit: '08:00', kategorie: 'dienst', markierung_id: 'irgendeine-id' }]).ueberstunden).toBe(0)
  })
})
