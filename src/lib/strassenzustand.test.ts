import { describe, expect, it } from 'vitest'
import { aktiveSperren, formatZeitraum, latestPerStrasse, strassenKey, strassenName, toTimestamp } from './strassenzustand'
import type { StrassenzustandBerichtzeile } from './types'

function zeile(overrides: Partial<StrassenzustandBerichtzeile>): StrassenzustandBerichtzeile {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    bericht_id: 'bericht-1',
    strasse_id: 'strasse-1',
    strasse_freitext: null,
    zustand: 'frei_befahrbar',
    zustand_freitext: null,
    auftraggeber_id: null,
    auftraggeber_freitext: null,
    melder_id: null,
    melder_freitext: null,
    gueltig_von: '2026-01-01T00:00:00.000Z',
    gueltig_bis: null,
    meldungsart: 'neuzugang',
    created_at: '2026-01-01T08:00:00Z',
    strassenzustand_strassen: { name: 'Ebniterstraße' },
    ...overrides,
  }
}

describe('strassenKey', () => {
  it('uses the Stammdaten-Id when present', () => {
    expect(strassenKey({ strasse_id: 'abc', strasse_freitext: null })).toBe('abc')
  })
  it('falls back to normalized freitext', () => {
    expect(strassenKey({ strasse_id: null, strasse_freitext: '  Testweg  ' })).toBe('frei:testweg')
  })
})

describe('strassenName', () => {
  it('prefers the joined Stammdaten name', () => {
    expect(strassenName(zeile({ strassenzustand_strassen: { name: 'Kehleggerstraße' }, strasse_freitext: 'ignoriert' }))).toBe('Kehleggerstraße')
  })
  it('falls back to freitext when no Stammdaten-Eintrag verknüpft ist', () => {
    expect(strassenName(zeile({ strasse_id: null, strassenzustand_strassen: null, strasse_freitext: 'Testweg' }))).toBe('Testweg')
  })
})

describe('latestPerStrasse', () => {
  it('picks the newest row per Straße, regardless of input order', () => {
    const alt = zeile({ id: 'a', created_at: '2026-01-01T08:00:00Z', zustand: 'gesperrt' })
    const neu = zeile({ id: 'b', created_at: '2026-01-02T08:00:00Z', zustand: 'sonstige' })
    const andere = zeile({ id: 'c', strasse_id: 'strasse-2', strassenzustand_strassen: { name: 'Kehleggerstraße' }, created_at: '2026-01-01T09:00:00Z' })
    const result = latestPerStrasse([neu, alt, andere])
    expect(result).toHaveLength(2)
    expect(result.find(item => item.strasse_id === 'strasse-1')?.id).toBe('b')
    expect(result.find(item => item.strasse_id === 'strasse-2')?.id).toBe('c')
  })

  it('unterscheidet Freitext-Straßen unabhängig von Groß-/Kleinschreibung und Leerzeichen', () => {
    const first = zeile({ id: 'a', strasse_id: null, strasse_freitext: 'Testweg', created_at: '2026-01-01T08:00:00Z' })
    const second = zeile({ id: 'b', strasse_id: null, strasse_freitext: ' testweg ', created_at: '2026-01-02T08:00:00Z' })
    const result = latestPerStrasse([first, second])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('b')
  })
})

describe('aktiveSperren', () => {
  it('blendet Straßen mit Zustand frei_befahrbar aus und sortiert alphabetisch', () => {
    const frei = zeile({ id: 'a', strasse_id: 'strasse-1', zustand: 'frei_befahrbar' })
    const gesperrt1 = zeile({ id: 'b', strasse_id: 'strasse-2', strassenzustand_strassen: { name: 'Kehleggerstraße' }, zustand: 'gesperrt' })
    const gesperrt2 = zeile({ id: 'c', strasse_id: 'strasse-3', strassenzustand_strassen: { name: 'Ebniterstraße' }, zustand: 'sonstige' })
    const result = aktiveSperren([frei, gesperrt1, gesperrt2])
    expect(result.map(item => item.id)).toEqual(['c', 'b'])
  })

  it('zeigt eine Straße erst wieder als aktiv, nachdem ein neuer Bericht sie widerruft', () => {
    const neuzugang = zeile({ id: 'a', created_at: '2026-01-01T08:00:00Z', zustand: 'gesperrt' })
    const widerruf = zeile({ id: 'b', created_at: '2026-01-02T08:00:00Z', zustand: 'frei_befahrbar' })
    expect(aktiveSperren([neuzugang, widerruf])).toHaveLength(0)
  })
})

describe('toTimestamp', () => {
  it('gibt null bei leerem Datum zurück', () => {
    expect(toTimestamp('', '')).toBeNull()
  })
  it('nimmt Mitternacht an, wenn keine Uhrzeit gesetzt ist', () => {
    const iso = toTimestamp('2026-01-01', '')!
    const date = new Date(iso)
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(0)
    expect(date.getDate()).toBe(1)
    expect(date.getHours()).toBe(0)
    expect(date.getMinutes()).toBe(0)
  })
  it('übernimmt eine gesetzte Uhrzeit', () => {
    const iso = toTimestamp('2026-01-01', '14:30')!
    const date = new Date(iso)
    expect(date.getHours()).toBe(14)
    expect(date.getMinutes()).toBe(30)
  })
})

describe('formatZeitraum', () => {
  it('zeigt "bis auf Weiteres" ohne Enddatum und ohne Uhrzeit', () => {
    const von = toTimestamp('2026-01-01', '')!
    expect(formatZeitraum({ gueltig_von: von, gueltig_bis: null })).toBe('Ab 1.1.2026 (bis auf Weiteres)')
  })
  it('zeigt den vollen Zeitraum mit Enddatum', () => {
    const von = toTimestamp('2026-01-01', '')!
    const bis = toTimestamp('2026-01-05', '')!
    expect(formatZeitraum({ gueltig_von: von, gueltig_bis: bis })).toBe('1.1.2026 – 5.1.2026')
  })
  it('zeigt zusätzlich die Uhrzeit, wenn eine gesetzt wurde', () => {
    const von = toTimestamp('2026-01-01', '14:30')!
    expect(formatZeitraum({ gueltig_von: von, gueltig_bis: null })).toBe('Ab 1.1.2026 14:30 (bis auf Weiteres)')
  })
})
