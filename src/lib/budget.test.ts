import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BUDGET,
  DEFAULT_SHOE_CAP,
  existingCapIdForDate,
  isBudgetParticipant,
  summarizeBudgetRows,
  withoutAdminProfiles,
} from './budget'

describe('Budget-Fallbacks', () => {
  it('hält das Standard-Jahresbudget bei 350 €', () => {
    expect(DEFAULT_BUDGET).toBe(350)
  })

  it('hält den Schuherstattungs-Fallback bei 120 € (kein Cap-Eintrag)', () => {
    expect(DEFAULT_SHOE_CAP).toBe(120)
  })
})

describe('isBudgetParticipant', () => {
  it('schließt Admin aus der Budgetstatistik aus', () => {
    expect(isBudgetParticipant(['admin'])).toBe(false)
    expect(isBudgetParticipant(['admin', 'genehmiger'])).toBe(false)
    expect(isBudgetParticipant(['user', 'admin'])).toBe(false)
  })

  it('zählt Genehmiger und Sachbearbeiter ohne Admin-Rolle weiter mit', () => {
    expect(isBudgetParticipant(['user'])).toBe(true)
    expect(isBudgetParticipant(['sachbearbeiter'])).toBe(true)
    expect(isBudgetParticipant(['genehmiger'])).toBe(true)
    expect(isBudgetParticipant(['genehmiger', 'sachbearbeiter'])).toBe(true)
    expect(isBudgetParticipant([])).toBe(true)
  })
})

describe('withoutAdminProfiles', () => {
  it('entfernt nur Profile mit Admin-Rolle', () => {
    const profiles = [
      { id: 'admin', roles: ['admin'] },
      { id: 'user', roles: ['user'] },
      { id: 'sb', roles: ['sachbearbeiter'] },
      { id: 'g', roles: ['genehmiger'] },
    ]
    expect(withoutAdminProfiles(profiles).map(p => p.id)).toEqual(['user', 'sb', 'g'])
  })
})

describe('summarizeBudgetRows', () => {
  it('zählt Kein Verbrauch nicht, wenn nur der Admin (nach Filter) übrig bleibt', () => {
    const afterAdminFilter = withoutAdminProfiles([
      { id: 'admin', roles: ['admin'], used: 0, totalBudget: DEFAULT_BUDGET },
    ]).map(p => ({ used: p.used, totalBudget: p.totalBudget }))
    const stats = summarizeBudgetRows(afterAdminFilter)
    expect(stats.unusedCount).toBe(0)
    expect(stats.totalBudget).toBe(0)
    expect(stats.overBudgetCount).toBe(0)
  })

  it('zählt Benutzer ohne Verbrauch, lässt Admin und Dienstrollen ohne Admin unangetastet', () => {
    const profiles = [
      { id: 'admin', roles: ['admin'], used: 0, totalBudget: DEFAULT_BUDGET },
      { id: 'user', roles: ['user'], used: 0, totalBudget: DEFAULT_BUDGET },
      { id: 'sb', roles: ['sachbearbeiter'], used: 100, totalBudget: DEFAULT_BUDGET },
      { id: 'g', roles: ['genehmiger'], used: 400, totalBudget: DEFAULT_BUDGET },
    ]
    const stats = summarizeBudgetRows(
      withoutAdminProfiles(profiles).map(p => ({ used: p.used, totalBudget: p.totalBudget })),
    )
    expect(stats.unusedCount).toBe(1)
    expect(stats.overBudgetCount).toBe(1)
    expect(stats.totalBudget).toBe(DEFAULT_BUDGET * 3)
    expect(stats.totalUsed).toBe(500)
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
