import { describe, expect, it } from 'vitest'
import { ruhezeitVerletzungen } from './dienstplanRegelpruefung'

describe('ruhezeitVerletzungen', () => {
  it('meldet keine Verletzung bei ausreichend Ruhezeit zwischen zwei Tagdiensten', () => {
    const dienste = [
      { beamterId: 'a', datum: '2026-10-05', vonZeit: '08:00', bisZeit: '19:00', kategorie: 'dienst' as const },
      { beamterId: 'a', datum: '2026-10-07', vonZeit: '08:00', bisZeit: '19:00', kategorie: 'dienst' as const },
    ]
    expect(ruhezeitVerletzungen(dienste, 11).size).toBe(0)
  })

  it('meldet eine Verletzung, wenn zwischen Dienstende und nächstem Dienstbeginn weniger als die Mindestruhezeit liegt', () => {
    const dienste = [
      { beamterId: 'a', datum: '2026-10-05', vonZeit: '08:00', bisZeit: '19:00', kategorie: 'dienst' as const },
      { beamterId: 'a', datum: '2026-10-06', vonZeit: '05:00', bisZeit: '13:00', kategorie: 'dienst' as const },
    ]
    // Ruhezeit: 19:00 -> 05:00 = 10 Stunden, unter der Mindestruhezeit von 11.
    expect(ruhezeitVerletzungen(dienste, 11)).toEqual(new Set(['a|2026-10-06']))
  })

  it('prüft jede Person getrennt', () => {
    const dienste = [
      { beamterId: 'a', datum: '2026-10-05', vonZeit: '08:00', bisZeit: '19:00', kategorie: 'dienst' as const },
      { beamterId: 'a', datum: '2026-10-06', vonZeit: '05:00', bisZeit: '13:00', kategorie: 'dienst' as const },
      { beamterId: 'b', datum: '2026-10-05', vonZeit: '08:00', bisZeit: '19:00', kategorie: 'dienst' as const },
      { beamterId: 'b', datum: '2026-10-07', vonZeit: '08:00', bisZeit: '19:00', kategorie: 'dienst' as const },
    ]
    expect(ruhezeitVerletzungen(dienste, 11)).toEqual(new Set(['a|2026-10-06']))
  })

  it('ignoriert Abwesenheiten (kategorie != dienst) bei der Ruhezeitprüfung', () => {
    const dienste = [
      { beamterId: 'a', datum: '2026-10-05', vonZeit: '08:00', bisZeit: '19:00', kategorie: 'dienst' as const },
      { beamterId: 'a', datum: '2026-10-06', vonZeit: null, bisZeit: null, kategorie: 'krank' as const },
    ]
    expect(ruhezeitVerletzungen(dienste, 11).size).toBe(0)
  })

  it('berücksichtigt Nachtdienste ohne Uhrzeit (Standard 19:00-08:00)', () => {
    const dienste = [
      { beamterId: 'a', datum: '2026-10-05', vonZeit: null, bisZeit: null, kategorie: 'dienst' as const },
      { beamterId: 'a', datum: '2026-10-06', vonZeit: '10:00', bisZeit: '18:00', kategorie: 'dienst' as const },
    ]
    // Nachtdienst endet 06.10. 08:00, nächster Dienst beginnt 06.10. 10:00 = 2 Stunden Ruhezeit.
    expect(ruhezeitVerletzungen(dienste, 11)).toEqual(new Set(['a|2026-10-06']))
  })
})
