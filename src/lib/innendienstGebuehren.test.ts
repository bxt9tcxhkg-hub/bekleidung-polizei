import { describe, expect, it } from 'vitest'
import { gebuehrensatzTotal, parseGebuehrenBetrag, validateGebuehrenpositionName, validateGebuehrensatzName } from './innendienstGebuehren'

describe('gebuehrensatzTotal', () => {
  it('summiert die Beträge aller verknüpften Positionen', () => {
    expect(gebuehrensatzTotal([
      { position: { id: '1', name: 'Bundesabgabe', betrag: 15, active: true } },
      { position: { id: '2', name: 'Verwaltungsgebühr', betrag: 21.8, active: true } },
    ])).toBeCloseTo(36.8)
  })

  it('ignoriert fehlende Positionen und liefert 0 für eine leere Liste', () => {
    expect(gebuehrensatzTotal([{ position: undefined }])).toBe(0)
    expect(gebuehrensatzTotal([])).toBe(0)
  })
})

describe('validateGebuehrenpositionName', () => {
  it('verlangt einen nicht-leeren Namen', () => {
    expect(validateGebuehrenpositionName('')).toBeTruthy()
    expect(validateGebuehrenpositionName('   ')).toBeTruthy()
  })
  it('erlaubt einen normalen Namen', () => {
    expect(validateGebuehrenpositionName('Bundesabgabe')).toBeNull()
  })
  it('verbietet zu lange Namen', () => {
    expect(validateGebuehrenpositionName('a'.repeat(121))).toBeTruthy()
    expect(validateGebuehrenpositionName('a'.repeat(120))).toBeNull()
  })
})

describe('validateGebuehrensatzName', () => {
  it('verlangt einen nicht-leeren Namen', () => {
    expect(validateGebuehrensatzName('')).toBeTruthy()
  })
  it('verbietet zu lange Namen', () => {
    expect(validateGebuehrensatzName('a'.repeat(161))).toBeTruthy()
    expect(validateGebuehrensatzName('a'.repeat(160))).toBeNull()
  })
})

describe('parseGebuehrenBetrag', () => {
  it('parst Komma und Punkt als Dezimaltrenner', () => {
    expect(parseGebuehrenBetrag('15,00')).toBe(15)
    expect(parseGebuehrenBetrag('21.8')).toBe(21.8)
  })
  it('rundet auf 2 Nachkommastellen', () => {
    expect(parseGebuehrenBetrag('15.999')).toBe(16)
  })
  it('lehnt leere, negative oder ungültige Eingaben ab', () => {
    expect(parseGebuehrenBetrag('')).toBeNull()
    expect(parseGebuehrenBetrag('-5')).toBeNull()
    expect(parseGebuehrenBetrag('abc')).toBeNull()
  })
  it('erlaubt 0', () => {
    expect(parseGebuehrenBetrag('0')).toBe(0)
  })
})
