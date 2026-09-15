import { describe, it, expect } from 'vitest'
import { bereitsVerwendeteFeiertagsstunden, berechneAufschluesselung, istUebersprungeneSommerzeitStunde, istViertelstundenRaster, monatsUebersicht } from './ueberstunden'
import type { UeberstundenMeldung } from './types'

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

function meldung(overrides: Partial<UeberstundenMeldung>): UeberstundenMeldung {
  return {
    id: 'x', beamter_id: 'b1', von_datum: '2026-09-14', von_zeit: '10:00', bis_datum: '2026-09-14', bis_zeit: '14:00',
    grund: 'Test', verguetung: 'auszahlung',
    std_werktag_50: 4, std_sonn_100: 0, std_19_22: 0, std_22_06: 0, std_sonn_200: 0,
    status: 'genehmigt', eingereicht_at: null, genehmiger_id: null, genehmigt_at: null, genehmiger_note: null,
    created_by: 'b1', created_at: '', updated_at: '',
    beamter: { id: 'b1', name: 'Max Muster', dienstnummer: '123' },
    ...overrides,
  }
}

describe('monatsUebersicht', () => {
  it('summiert genehmigte Meldungen je Beamten für den gewählten Monat', () => {
    const result = monatsUebersicht([
      meldung({ id: '1', std_werktag_50: 4 }),
      meldung({ id: '2', std_werktag_50: 2, std_19_22: 1 }),
    ], '2026-09')
    expect(result).toHaveLength(1)
    expect(result[0].beamterName).toBe('Max Muster')
    expect(result[0].stunden.std_werktag_50).toBe(6)
    expect(result[0].stunden.std_19_22).toBe(1)
    expect(result[0].gesamt).toBe(7)
  })

  it('ignoriert nicht genehmigte Meldungen und andere Monate', () => {
    const result = monatsUebersicht([
      meldung({ id: '1', status: 'eingereicht' }),
      meldung({ id: '2', status: 'abgelehnt' }),
      meldung({ id: '3', von_datum: '2026-08-31', bis_datum: '2026-08-31' }),
    ], '2026-09')
    expect(result).toEqual([])
  })

  it('gruppiert mehrere Beamte getrennt und sortiert alphabetisch', () => {
    const result = monatsUebersicht([
      meldung({ id: '1', beamter_id: 'b2', beamter: { id: 'b2', name: 'Zora Zach', dienstnummer: null } }),
      meldung({ id: '2', beamter_id: 'b1', beamter: { id: 'b1', name: 'Anna Adler', dienstnummer: null } }),
    ], '2026-09')
    expect(result.map(z => z.beamterName)).toEqual(['Anna Adler', 'Zora Zach'])
  })

  it('trennt Auszahlung und Stundenersatz desselben Beamten in eigene Zeilen', () => {
    const result = monatsUebersicht([
      meldung({ id: '1', verguetung: 'auszahlung', std_werktag_50: 4 }),
      meldung({ id: '2', verguetung: 'stundenersatz', std_werktag_50: 3 }),
    ], '2026-09')
    expect(result).toHaveLength(2)
    const auszahlung = result.find(z => z.verguetung === 'auszahlung')
    const stundenersatz = result.find(z => z.verguetung === 'stundenersatz')
    expect(auszahlung?.gesamt).toBe(4)
    expect(stundenersatz?.gesamt).toBe(3)
  })

  it('teilt eine über eine Monatsgrenze reichende Meldung an der Grenze auf, statt sie komplett dem Startmonat zuzurechnen', () => {
    // Mittwoch 30.09.2026 22:00 bis Donnerstag 01.10.2026 02:00 - reine
    // Werktags-Nachtstunden (22-06), exakt zur Hälfte auf beide Monate
    // aufteilbar (je 2 von insgesamt 4 Stunden).
    const item = meldung({ id: '1', von_datum: '2026-09-30', von_zeit: '22:00', bis_datum: '2026-10-01', bis_zeit: '02:00', std_werktag_50: 0, std_22_06: 4 })
    const september = monatsUebersicht([item], '2026-09')
    const oktober = monatsUebersicht([item], '2026-10')
    expect(september).toHaveLength(1)
    expect(september[0].stunden.std_22_06).toBe(2)
    expect(september[0].gesamt).toBe(2)
    expect(oktober).toHaveLength(1)
    expect(oktober[0].stunden.std_22_06).toBe(2)
    expect(oktober[0].gesamt).toBe(2)
  })

  it('teilt bei einer Monatsgrenze, die zugleich in einen Sonn-/Feiertag reicht, die Sonn-/Feiertagsstunden im Verhältnis der tatsächlichen Stunden auf', () => {
    // Samstag 31.10.2026 23:00 (Werktag) bis Sonntag 01.11.2026 01:00
    // (Sonn-/Feiertag, Allerheiligen) - je eine Stunde auf jeder Seite,
    // sowohl der Monatsgrenze als auch der Sonn-/Feiertagsgrenze.
    const item = meldung({ id: '1', von_datum: '2026-10-31', von_zeit: '23:00', bis_datum: '2026-11-01', bis_zeit: '01:00', std_werktag_50: 0, std_22_06: 1, std_sonn_100: 1 })
    const oktober = monatsUebersicht([item], '2026-10')
    const november = monatsUebersicht([item], '2026-11')
    expect(oktober).toHaveLength(1)
    expect(oktober[0].stunden.std_22_06).toBe(1)
    expect(oktober[0].stunden.std_sonn_100).toBe(0)
    expect(oktober[0].gesamt).toBe(1)
    expect(november).toHaveLength(1)
    expect(november[0].stunden.std_22_06).toBe(0)
    expect(november[0].stunden.std_sonn_100).toBe(1)
    expect(november[0].gesamt).toBe(1)
  })

  it('vermischt bei einer Monatsgrenze zwischen zwei benachbarten Sonn-/Feiertagen (je eigene 8-Std.-Schwelle) nicht deren 100%/200%-Aufteilung', () => {
    // Sonntag 30.04.2028 14:00 bis Montag 01.05.2028 02:00 (Staatsfeiertag) -
    // 10 Std. am Sonntag (8 zu 100 %, 2 zu 200 %), 2 Std. am Feiertag (beide
    // zu 100 %, eigene Schwelle) - korrekt wäre April 8/2, Mai 2/0, NICHT ein
    // einziges gemeinsames Verhältnis über beide Tage hinweg.
    const item = meldung({ id: '1', von_datum: '2028-04-30', von_zeit: '14:00', bis_datum: '2028-05-01', bis_zeit: '02:00', std_werktag_50: 0, std_sonn_100: 10, std_sonn_200: 2 })
    const april = monatsUebersicht([item], '2028-04')
    const mai = monatsUebersicht([item], '2028-05')
    expect(april).toHaveLength(1)
    expect(april[0].stunden.std_sonn_100).toBe(8)
    expect(april[0].stunden.std_sonn_200).toBe(2)
    expect(april[0].gesamt).toBe(10)
    expect(mai).toHaveLength(1)
    expect(mai[0].stunden.std_sonn_100).toBe(2)
    expect(mai[0].stunden.std_sonn_200).toBe(0)
    expect(mai[0].gesamt).toBe(2)
  })

  it('rechnet eine Meldung ganz außerhalb des gewählten Monats keinem der beiden Monate zu', () => {
    const item = meldung({ id: '1', von_datum: '2026-09-30', von_zeit: '22:00', bis_datum: '2026-10-01', bis_zeit: '02:00', std_werktag_50: 0, std_22_06: 4 })
    expect(monatsUebersicht([item], '2026-08')).toEqual([])
    expect(monatsUebersicht([item], '2026-11')).toEqual([])
  })
})

describe('istUebersprungeneSommerzeitStunde', () => {
  it('erkennt die übersprungene Stunde am letzten Sonntag im März (Frühjahrsumstellung)', () => {
    // Letzter Sonntag im März: 29.03.2026, 28.03.2027, 26.03.2028.
    for (const zeit of ['02:00', '02:15', '02:30', '02:45']) expect(istUebersprungeneSommerzeitStunde('2026-03-29', zeit)).toBe(true)
    expect(istUebersprungeneSommerzeitStunde('2027-03-28', '02:30')).toBe(true)
    expect(istUebersprungeneSommerzeitStunde('2028-03-26', '02:30')).toBe(true)
  })

  it('lehnt andere Uhrzeiten, Tage und Monate ab', () => {
    expect(istUebersprungeneSommerzeitStunde('2026-03-29', '01:45')).toBe(false)
    expect(istUebersprungeneSommerzeitStunde('2026-03-29', '03:00')).toBe(false)
    expect(istUebersprungeneSommerzeitStunde('2026-03-22', '02:15')).toBe(false) // vorletzter Sonntag
    expect(istUebersprungeneSommerzeitStunde('2026-10-25', '02:15')).toBe(false) // Herbstumstellung - dort mehrdeutig, nicht übersprungen
    expect(istUebersprungeneSommerzeitStunde('2026-09-14', '02:15')).toBe(false)
  })
})

describe('bereitsVerwendeteFeiertagsstunden (Vorschau-Kontext)', () => {
  it('berücksichtigt nur zeitlich frühere eigene Meldungen desselben Tages', () => {
    const bereits = bereitsVerwendeteFeiertagsstunden(
      [{ von: SONNTAG(0), bis: SONNTAG(8) }], // 8 Std, 00-08 Uhr
      SONNTAG(10), // eigener Zeitraum beginnt danach
    )
    expect(bereits(new Date(2026, 8, 13))).toBe(8)
    const result = berechneAufschluesselung(SONNTAG(10), SONNTAG(12), bereits)
    expect(result.std_sonn_100).toBe(0)
    expect(result.std_sonn_200).toBe(2)
  })

  it('ignoriert zeitlich spätere Meldungen (die Vorschau bezieht sich nur auf den eigenen, gerade bearbeiteten Zeitraum)', () => {
    const bereits = bereitsVerwendeteFeiertagsstunden(
      [{ von: SONNTAG(14), bis: SONNTAG(18) }], // liegt NACH dem eigenen Start
      SONNTAG(10),
    )
    expect(bereits(new Date(2026, 8, 13))).toBe(0)
  })
})

describe('istViertelstundenRaster', () => {
  it('akzeptiert Zeiten auf dem Viertelstunden-Raster', () => {
    for (const zeit of ['08:00', '08:15', '08:30', '08:45', '00:00', '23:45']) expect(istViertelstundenRaster(zeit)).toBe(true)
  })
  it('lehnt Zeiten außerhalb des Rasters ab', () => {
    for (const zeit of ['18:55', '19:05', '08:01', '08:10']) expect(istViertelstundenRaster(zeit)).toBe(false)
  })
})
