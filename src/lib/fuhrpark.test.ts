import { describe, expect, it } from 'vitest'
import { canManageFuhrpark } from './fuhrpark'

describe('canManageFuhrpark', () => {
  it('erlaubt globalen Admin und Genehmiger immer', () => {
    expect(canManageFuhrpark({ isStrictAdmin: true, rows: null })).toBe(true)
    expect(canManageFuhrpark({ isStrictAdmin: false, isGenehmiger: true, rows: null })).toBe(true)
  })
  it('erlaubt fuhrpark-Sachbearbeiter/Admin', () => {
    expect(canManageFuhrpark({ isStrictAdmin: false, rows: [{ area: 'fuhrpark', roles: ['sachbearbeiter'] }] })).toBe(true)
    expect(canManageFuhrpark({ isStrictAdmin: false, rows: [{ area: 'fuhrpark', roles: ['admin'] }] })).toBe(true)
  })
  it('verbietet reines Leserecht, fehlende Tabelle und andere Bereiche', () => {
    expect(canManageFuhrpark({ isStrictAdmin: false, rows: [{ area: 'fuhrpark', roles: ['user'] }] })).toBe(false)
    expect(canManageFuhrpark({ isStrictAdmin: false, rows: null })).toBe(false)
    expect(canManageFuhrpark({ isStrictAdmin: false, rows: [{ area: 'zentrale', roles: ['sachbearbeiter'] }] })).toBe(false)
  })
})
