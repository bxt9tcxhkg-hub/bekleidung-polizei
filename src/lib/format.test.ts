import { describe, it, expect } from 'vitest'
import { fmtEUR } from './format'

describe('fmtEUR', () => {
  it('formatiert Beträge deutsch-österreichisch', () => {
    expect(fmtEUR(0)).toBe('€ 0,00')
    const formatted = fmtEUR(1234.5)
    expect(formatted.startsWith('€ ')).toBe(true)
    expect(formatted.endsWith('234,50')).toBe(true)
    expect(formatted).toContain('1')
    expect(fmtEUR(350)).toBe('€ 350,00')
  })
})
