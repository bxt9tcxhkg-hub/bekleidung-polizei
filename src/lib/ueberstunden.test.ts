import { describe, it, expect } from 'vitest'
import { bereitsVerwendeteFeiertagsstunden, berechneAufschluesselung, istUebersprungeneSommerzeitStunde, istViertelstundenRaster, MAX_MELDUNG_DAUER_TAGE, monatsUebersicht } from './ueberstunden'
import type { UeberstundenKategorieKey } from './ueberstunden'
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
    status: 'genehmigt', eingereicht_at: null, genehmiger_id: null, genehmigt_at: null, genehmiger_note: null, genehmiger_wahl_id: null,
    created_by: 'b1', created_at: '', updated_at: '',
    beamter: { id: 'b1', name: 'Max Muster', dienstnummer: '123' },
    ...overrides,
  }
}

/**
 * Baut aus Meldungen eine anteile-Map, deren Werte den vollen gespeicherten
 * Kategorien der jeweiligen Meldung entsprechen - der Regelfall für
 * monatsUebersicht() (Zeitraum ganz im gewählten Monat, kein monatsgrenzen-
 * übergreifender Anteil). Das eigentliche monatsgrenzenübergreifende Splitten
 * (inkl. der exakten 100%/200%-Sonn-/Feiertags-Aufteilung bei mehreren
 * Meldungen am selben Tag) übernimmt seit Migration Runde 16 serverseitig das
 * RPC ueberstunden_monatsanteile - das ist SQL und wird live gegen Supabase
 * verifiziert, nicht hier (siehe die Fix-Kommentare in der Migration).
 */
function anteileVon(...items: readonly UeberstundenMeldung[]): Map<string, Record<UeberstundenKategorieKey, number>> {
  const map = new Map<string, Record<UeberstundenKategorieKey, number>>()
  for (const item of items) map.set(item.id, { std_werktag_50: item.std_werktag_50, std_sonn_100: item.std_sonn_100, std_19_22: item.std_19_22, std_22_06: item.std_22_06, std_sonn_200: item.std_sonn_200 })
  return map
}

describe('monatsUebersicht', () => {
  it('summiert genehmigte Meldungen je Beamten anhand der anteile-Map', () => {
    const items = [
      meldung({ id: '1', std_werktag_50: 4 }),
      meldung({ id: '2', std_werktag_50: 2, std_19_22: 1 }),
    ]
    const result = monatsUebersicht(items, anteileVon(...items))
    expect(result).toHaveLength(1)
    expect(result[0].beamterName).toBe('Max Muster')
    expect(result[0].stunden.std_werktag_50).toBe(6)
    expect(result[0].stunden.std_19_22).toBe(1)
    expect(result[0].gesamt).toBe(7)
  })

  it('ignoriert nicht genehmigte Meldungen und Meldungen ohne Eintrag in der anteile-Map', () => {
    const eingereicht = meldung({ id: '1', status: 'eingereicht' })
    const abgelehnt = meldung({ id: '2', status: 'abgelehnt' })
    const ohneAnteil = meldung({ id: '3' }) // genehmigt, aber nicht in der Map - berührt den gewählten Monat laut RPC nicht
    const result = monatsUebersicht([eingereicht, abgelehnt, ohneAnteil], anteileVon(eingereicht, abgelehnt))
    expect(result).toEqual([])
  })

  it('gruppiert mehrere Beamte getrennt und sortiert alphabetisch', () => {
    const items = [
      meldung({ id: '1', beamter_id: 'b2', beamter: { id: 'b2', name: 'Zora Zach', dienstnummer: null } }),
      meldung({ id: '2', beamter_id: 'b1', beamter: { id: 'b1', name: 'Anna Adler', dienstnummer: null } }),
    ]
    const result = monatsUebersicht(items, anteileVon(...items))
    expect(result.map(z => z.beamterName)).toEqual(['Anna Adler', 'Zora Zach'])
  })

  it('trennt Auszahlung und Stundenersatz desselben Beamten in eigene Zeilen', () => {
    const items = [
      meldung({ id: '1', verguetung: 'auszahlung', std_werktag_50: 4 }),
      meldung({ id: '2', verguetung: 'stundenersatz', std_werktag_50: 3 }),
    ]
    const result = monatsUebersicht(items, anteileVon(...items))
    expect(result).toHaveLength(2)
    const auszahlung = result.find(z => z.verguetung === 'auszahlung')
    const stundenersatz = result.find(z => z.verguetung === 'stundenersatz')
    expect(auszahlung?.gesamt).toBe(4)
    expect(stundenersatz?.gesamt).toBe(3)
  })

  it('verwendet die geclippten Stunden aus der anteile-Map, nicht die vollen gespeicherten Summen der Meldung', () => {
    // Simuliert eine monatsgrenzenübergreifende Meldung: die volle Meldung
    // hätte 10 Std., das RPC liefert für den gewählten Monat aber nur den
    // geclippten Anteil (2 Std.) - monatsUebersicht muss den Map-Wert
    // übernehmen, nicht die gespeicherten std_*-Felder der Meldung selbst.
    const item = meldung({ id: '1', std_werktag_50: 10 })
    const anteile = new Map([['1', { std_werktag_50: 2, std_sonn_100: 0, std_19_22: 0, std_22_06: 0, std_sonn_200: 0 }]])
    const result = monatsUebersicht([item], anteile)
    expect(result).toHaveLength(1)
    expect(result[0].stunden.std_werktag_50).toBe(2)
    expect(result[0].gesamt).toBe(2)
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

describe('MAX_MELDUNG_DAUER_TAGE', () => {
  it('stimmt mit dem DB-CHECK ueberstunden_meldungen_zeitraum_maximal überein (31 Tage)', () => {
    expect(MAX_MELDUNG_DAUER_TAGE).toBe(31)
  })
})
