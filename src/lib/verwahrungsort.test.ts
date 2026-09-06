import { describe, expect, it } from 'vitest'
import {
  VERWAHRUNGSORTE,
  VERWAHRUNGSORT_LABELS,
  isLagerOrt,
  isVerwahrungsort,
} from './verwahrungsort'

describe('Verwahrungsorte', () => {
  it('enthält die bestehenden Orte plus Spind und Waffentresor', () => {
    expect([...VERWAHRUNGSORTE]).toEqual([
      'lager',
      'innendienst',
      'peter_1',
      'peter_2',
      'peter_30',
      'spind_1',
      'spind_2',
      'waffentresor_zentrale',
      'waffentresor_keller',
    ])
  })

  it('hat deutsche UI-Labels für alle Werte', () => {
    expect(VERWAHRUNGSORT_LABELS).toEqual({
      lager: 'Lager',
      innendienst: 'Innendienst',
      peter_1: 'Peter 1',
      peter_2: 'Peter 2',
      peter_30: 'Peter 30',
      spind_1: 'Spind 1',
      spind_2: 'Spind 2',
      waffentresor_zentrale: 'Waffentresor Zentrale',
      waffentresor_keller: 'Waffentresor Keller',
    })
    expect(Object.keys(VERWAHRUNGSORT_LABELS)).toEqual([...VERWAHRUNGSORTE])
  })

  it('erkennt gültige Werte und lehnt Unbekanntes ab', () => {
    expect(isVerwahrungsort('lager')).toBe(true)
    expect(isVerwahrungsort('spind_1')).toBe(true)
    expect(isVerwahrungsort('waffentresor_keller')).toBe(true)
    expect(isVerwahrungsort('peter_3')).toBe(false)
    expect(isVerwahrungsort('fuhrpark')).toBe(false)
    expect(isVerwahrungsort('Spind 1')).toBe(false)
  })

  it('kennt Lager als Ort für die optionale Notiz', () => {
    expect(isLagerOrt('lager')).toBe(true)
    expect(isLagerOrt('spind_1')).toBe(false)
    expect(isLagerOrt('')).toBe(false)
  })
})
