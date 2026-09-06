import { describe, expect, it } from 'vitest'
import {
  EM_SUB_TABS,
  canViewLagerbestand,
  sanitizeEmSubTab,
  visibleEmSubTabs,
} from './einsatzmittelVisibility'

describe('visibleEmSubTabs', () => {
  it('zeigt Sachbearbeiter/Admin alle drei Reiter', () => {
    expect(visibleEmSubTabs(true).map(tab => tab.id)).toEqual([
      'persoenlich',
      'pool',
      'lagerbestand',
    ])
    expect(EM_SUB_TABS.map(tab => tab.label)).toEqual(['Persönlich', 'Pool', 'Lagerbestand'])
  })

  it('lässt Benutzer Persönlich und Pool, blendet Lagerbestand aus', () => {
    expect(visibleEmSubTabs(false).map(tab => tab.id)).toEqual(['persoenlich', 'pool'])
  })
})

describe('sanitizeEmSubTab', () => {
  it('erzwingt Persönlich, wenn Lagerbestand ohne Manage-Recht gewählt ist', () => {
    expect(sanitizeEmSubTab('lagerbestand', false)).toBe('persoenlich')
    expect(sanitizeEmSubTab('pool', false)).toBe('pool')
    expect(sanitizeEmSubTab('persoenlich', false)).toBe('persoenlich')
  })

  it('lässt alle Reiter für Manage-Recht unverändert', () => {
    expect(sanitizeEmSubTab('lagerbestand', true)).toBe('lagerbestand')
    expect(sanitizeEmSubTab('pool', true)).toBe('pool')
  })
})

describe('canViewLagerbestand', () => {
  it('erlaubt globalen Admin und einsatz_mt Sachbearbeiter/Admin', () => {
    expect(canViewLagerbestand({ isStrictAdmin: true, rows: [] })).toBe(true)
    expect(canViewLagerbestand({
      isStrictAdmin: false,
      rows: [{ area: 'einsatz_mt', roles: ['sachbearbeiter'] }],
    })).toBe(true)
    expect(canViewLagerbestand({
      isStrictAdmin: false,
      rows: [{ area: 'einsatz_mt', roles: ['admin'] }],
    })).toBe(true)
  })

  it('verbietet reinen Benutzer und fehlende Rechte', () => {
    expect(canViewLagerbestand({
      isStrictAdmin: false,
      rows: [{ area: 'einsatz_mt', roles: ['user'] }],
    })).toBe(false)
    expect(canViewLagerbestand({ isStrictAdmin: false, rows: null })).toBe(false)
    expect(canViewLagerbestand({
      isStrictAdmin: false,
      rows: [{ area: 'bekleidung', roles: ['admin'] }],
    })).toBe(false)
  })
})
