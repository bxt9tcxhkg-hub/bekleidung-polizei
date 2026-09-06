import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BUDGET,
  DEFAULT_SHOE_CAP,
  budgetUpsertPayload,
  budgetYearFromValidFrom,
  effectiveUsed,
  existingCapIdForDate,
  isBudgetParticipant,
  orderUsedForBudgetYear,
  parseBudgetAmount,
  remainingBudget,
  summarizeBudgetRows,
  usedAdjustmentForYear,
  usedAdjustmentFromEdited,
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

  it('persönliches Jahresbudget (Dashboard Mein Bereich) nur ohne Rolle admin', () => {
    expect(isBudgetParticipant(['admin'])).toBe(false)
    expect(isBudgetParticipant(['admin', 'sachbearbeiter', 'genehmiger'])).toBe(false)
    expect(isBudgetParticipant(['sachbearbeiter'])).toBe(true)
    expect(isBudgetParticipant(['genehmiger'])).toBe(true)
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

describe('Verbrauch und Rückstellung zum 01.01.', () => {
  it('parst Beträge mit Komma und lehnt negative Werte ab', () => {
    expect(parseBudgetAmount('120,50')).toBe(120.5)
    expect(parseBudgetAmount('0')).toBe(0)
    expect(parseBudgetAmount('-1')).toBeNull()
    expect(parseBudgetAmount('')).toBeNull()
    expect(parseBudgetAmount('abc')).toBeNull()
  })

  it('nimmt das Kalenderjahr aus gültig-ab', () => {
    expect(budgetYearFromValidFrom('2026-09-06')).toBe(2026)
    expect(budgetYearFromValidFrom('2027-01-01')).toBe(2027)
  })

  it('zählt Bestellungen nur im gleichen Kalenderjahr', () => {
    expect(orderUsedForBudgetYear(180, '2026-06-01', 2026)).toBe(180)
    expect(orderUsedForBudgetYear(180, '2027-01-01', 2026)).toBe(0)
  })

  it('nimmt die aktuelle Jahreskorrektur, nicht das Vorjahr', () => {
    const rows = [
      { year: 2025, used_adjustment: 80, valid_from: '2025-01-01' },
      { year: 2026, used_adjustment: 25, valid_from: '2026-01-01' },
      { year: 2026, used_adjustment: 10, valid_from: '2026-07-01' },
    ]
    expect(usedAdjustmentForYear(rows, 2025, '2026-09-06')).toBe(80)
    expect(usedAdjustmentForYear(rows, 2026, '2026-06-15')).toBe(25)
    expect(usedAdjustmentForYear(rows, 2026, '2026-09-06')).toBe(10)
    expect(usedAdjustmentForYear(rows, 2027, '2027-01-01')).toBe(0)
  })

  it('setzt Verbrauch aus Bestellungen plus Korrektur und rechnet Verbleibend', () => {
    expect(effectiveUsed(120, 30)).toBe(150)
    expect(effectiveUsed(0, 0)).toBe(0)
    expect(usedAdjustmentFromEdited(150, 120)).toBe(30)
    expect(usedAdjustmentFromEdited(50, 120)).toBe(-70)
    expect(remainingBudget(350, 150)).toBe(200)
    expect(remainingBudget(350, 400)).toBe(-50)
  })

  it('stellt zum 01.01. zurück, außer eine Korrektur für das neue Jahr wird gesetzt', () => {
    const priorYear = [
      { year: 2026, used_adjustment: 90, valid_from: '2026-01-01' },
    ]
    const asOfNewYear = '2027-01-01'
    const orderUsed2027 = 0
    expect(usedAdjustmentForYear(priorYear, 2027, asOfNewYear)).toBe(0)
    expect(effectiveUsed(orderUsed2027, usedAdjustmentForYear(priorYear, 2027, asOfNewYear))).toBe(0)
    expect(remainingBudget(DEFAULT_BUDGET, 0)).toBe(DEFAULT_BUDGET)

    const explicit = budgetUpsertPayload({
      userId: 'u1',
      validFrom: '2027-01-01',
      totalBudget: DEFAULT_BUDGET,
      editedUsed: 40,
      currentYearOrderUsed: 180,
      currentYear: 2026,
    })
    expect(explicit.year).toBe(2027)
    expect(explicit.used_adjustment).toBe(40)
    expect(remainingBudget(explicit.total_budget, effectiveUsed(0, explicit.used_adjustment))).toBe(310)
  })

  it('speichert die Korrektur relativ zur Bestellsumme des Kalenderjahres', () => {
    const payload = budgetUpsertPayload({
      userId: 'u1',
      validFrom: '2026-09-06',
      totalBudget: 400,
      editedUsed: 200,
      currentYearOrderUsed: 150,
      currentYear: 2026,
    })
    expect(payload).toEqual({
      user_id: 'u1',
      year: 2026,
      total_budget: 400,
      used_adjustment: 50,
      valid_from: '2026-09-06',
    })
    expect(remainingBudget(payload.total_budget, effectiveUsed(150, payload.used_adjustment))).toBe(200)
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
