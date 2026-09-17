import { describe, it, expect } from 'vitest'
import { groupSizes, sortedSizes, sizeLabel } from './sizes'

describe('groupSizes', () => {
  it('gruppiert Herren-Hosen (U/N/S-Präfix) in Untersetzt/Normal/Schlank', () => {
    const sizes = ['U22', 'U23', 'N44', 'N46', 'S88', 'S102', 'S90']
    const groups = groupSizes(sizes)!
    expect(groups.map(g => g.label)).toEqual(['Untersetzt', 'Normal', 'Schlank'])
    expect(groups[0].sizes).toEqual(['U22', 'U23'])
    expect(groups[1].sizes).toEqual(['N44', 'N46'])
    expect(groups[2].sizes).toEqual(['S88', 'S90', 'S102'])
  })

  it('sortiert S-Größen numerisch, nicht alphabetisch (S90 vor S102)', () => {
    const groups = groupSizes(['S102', 'S106', 'S110', 'S114', 'S118', 'S122', 'S88', 'S90', 'S94', 'S98'])!
    expect(groups[0].sizes).toEqual(['S88', 'S90', 'S94', 'S98', 'S102', 'S106', 'S110', 'S114', 'S118', 'S122'])
  })

  it('gruppiert Damen-Hosen (K/N/L-Präfix) in Kurz/Normal/Lang', () => {
    const sizes = ['K17', 'K18', 'N34', 'N36', 'L68', 'L100', 'L72']
    const groups = groupSizes(sizes)!
    expect(groups.map(g => g.label)).toEqual(['Kurz', 'Normal', 'Lang'])
    expect(groups[2].sizes).toEqual(['L68', 'L72', 'L100'])
  })

  it('gruppiert Jacken (44I/44II) in Länge I/Länge II', () => {
    const sizes = ['44I', '44II', '46I', '46II', '60I', '60II']
    const groups = groupSizes(sizes)!
    expect(groups.map(g => g.label)).toEqual(['Länge I', 'Länge II'])
    expect(groups[0].sizes).toEqual(['44I', '46I', '60I'])
    expect(groups[1].sizes).toEqual(['44II', '46II', '60II'])
  })

  it('gruppiert Suffix-Format (44N, 22U, 88S)', () => {
    const groups = groupSizes(['44N', '46N', '22U', '88S'])!
    expect(groups.map(g => g.label)).toEqual(['Untersetzt', 'Normal', 'Schlank'])
    expect(groups[1].sizes).toEqual(['44N', '46N'])
  })

  it('liefert null für einfache numerische Größen', () => {
    expect(groupSizes(['36', '37', '38'])).toBeNull()
  })

  it('liefert null für Konfektionsgrößen (S, M, L)', () => {
    expect(groupSizes(['S', 'M', 'L'])).toBeNull()
  })

  it('liefert null für geteilte Hemdgrößen (37/38)', () => {
    expect(groupSizes(['37/38', '39/40', '41/42'])).toBeNull()
  })
})

describe('sortedSizes', () => {
  it('sortiert numerisch inkl. Dezimalgrößen (Handschuhe)', () => {
    expect(sortedSizes(['10', '7.5', '8', '11.5', '9'])).toEqual(['7.5', '8', '9', '10', '11.5'])
  })

  it('sortiert Konfektionsgrößen in natürlicher Reihenfolge', () => {
    expect(sortedSizes(['L', 'S', 'M'])).toEqual(['S', 'M', 'L'])
  })

  it('sortiert Präfix-Größen numerisch', () => {
    expect(sortedSizes(['N62', 'N44', 'N48'])).toEqual(['N44', 'N48', 'N62'])
  })
})

describe('sizeLabel', () => {
  it('entfernt Präfix bei gruppierter Anzeige (N44 → 44)', () => {
    expect(sizeLabel('N44', true)).toBe('44')
    expect(sizeLabel('U22', true)).toBe('22')
    expect(sizeLabel('S102', true)).toBe('102')
    expect(sizeLabel('K17', true)).toBe('17')
    expect(sizeLabel('L100', true)).toBe('100')
  })

  it('entfernt Jacken-Suffix (44II → 44)', () => {
    expect(sizeLabel('44I', true)).toBe('44')
    expect(sizeLabel('44II', true)).toBe('44')
  })

  it('entfernt Suffix (44N → 44)', () => {
    expect(sizeLabel('44N', true)).toBe('44')
  })

  it('lässt Größen unverändert wenn nicht gruppiert', () => {
    expect(sizeLabel('N44', false)).toBe('N44')
  })

  it('lässt einfache Größen unverändert', () => {
    expect(sizeLabel('42', true)).toBe('42')
    expect(sizeLabel('M', true)).toBe('M')
    expect(sizeLabel('37/38', true)).toBe('37/38')
  })
})
