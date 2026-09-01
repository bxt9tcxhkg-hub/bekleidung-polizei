import { describe, it, expect } from 'vitest'
import { DEFAULT_BUDGET, DEFAULT_SHOE_CAP, existingCapIdForDate } from './budget'

describe('Budget-Fallbacks', () => {
  it('hält das Standard-Jahresbudget bei 350 €', () => {
    expect(DEFAULT_BUDGET).toBe(350)
  })

  it('hält den Schuherstattungs-Fallback bei 120 € (kein Cap-Eintrag)', () => {
    expect(DEFAULT_SHOE_CAP).toBe(120)
  })
})

describe('existingCapIdForDate', () => {
  const caps = [
    { id: 'a', valid_from: '2026-09-01' },
    { id: 'b', valid_from: '2027-01-01' },
  ]

  it('findet den Eintrag zum selben Gültig-ab-Datum zum Überschreiben', () => {
    expect(existingCapIdForDate(caps, '2026-09-01')).toBe('a')
    expect(existingCapIdForDate([{ id: 'c', valid_from: '2026-09-01T00:00:00' }], '2026-09-01')).toBe('c')
  })

  it('liefert null wenn ein neues Datum angelegt werden soll', () => {
    expect(existingCapIdForDate(caps, '2026-10-01')).toBeNull()
  })
})
