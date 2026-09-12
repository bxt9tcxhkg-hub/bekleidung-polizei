import { supabase } from './supabase'

export const DEFAULT_BUDGET = 350
export const DEFAULT_SHOE_CAP = 120
const today = () => new Date().toISOString().split('T')[0]

/** Admin hat kein persönliches Bekleidungsbudget und zählt nicht in der Budgetstatistik. */
export function isBudgetParticipant(roles: readonly string[] | null | undefined): boolean {
  return !(roles ?? []).includes('admin')
}

export function withoutAdminProfiles<T extends { roles?: readonly string[] | null }>(profiles: T[]): T[] {
  return profiles.filter(p => isBudgetParticipant(p.roles))
}

export type BudgetStatRow = {
  used: number
  totalBudget: number
}

export function summarizeBudgetRows(rows: BudgetStatRow[]) {
  const totalBudget = rows.reduce((s, r) => s + r.totalBudget, 0)
  const totalUsed = rows.reduce((s, r) => s + r.used, 0)
  const utilizationPct = totalBudget > 0 ? Math.min(100, (totalUsed / totalBudget) * 100) : 0
  const overBudgetCount = rows.filter(r => r.used > r.totalBudget).length
  const unusedCount = rows.filter(r => r.used === 0).length
  return { totalBudget, totalUsed, utilizationPct, overBudgetCount, unusedCount }
}

/** Kalenderjahr einer Budgetzeile aus valid_from (YYYY-MM-DD). */
export function budgetYearFromValidFrom(validFrom: string): number {
  return Number(validFrom.slice(0, 4))
}

/** Bestellsumme zählt nur im gleichen Kalenderjahr; neues Jahr startet bei 0. */
export function orderUsedForBudgetYear(
  currentYearOrderUsed: number,
  validFrom: string,
  currentYear: number,
): number {
  return budgetYearFromValidFrom(validFrom) === currentYear ? currentYearOrderUsed : 0
}

/**
 * Korrektur für das angegebene Kalenderjahr.
 * Vorjahreszeilen gelten nicht — Rückstellung zum 01.01.
 */
export function usedAdjustmentForYear(
  rows: { year: number; used_adjustment?: number | null; valid_from: string }[],
  year: number,
  asOf = today(),
): number {
  const current = rows
    .filter(r => r.year === year && r.valid_from <= asOf)
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0]
  return Number(current?.used_adjustment ?? 0)
}

/** Verbrauch = Bestellsumme des Kalenderjahres + Korrektur. */
export function effectiveUsed(orderUsed: number, usedAdjustment: number): number {
  return orderUsed + usedAdjustment
}

export function remainingBudget(total: number, used: number): number {
  return total - used
}

/** Speichert die Differenz, damit Bestellungen weiterzählen. */
export function usedAdjustmentFromEdited(editedUsed: number, orderUsed: number): number {
  return editedUsed - orderUsed
}

export function parseBudgetAmount(raw: string): number | null {
  const val = parseFloat(raw.replace(',', '.').trim())
  if (!Number.isFinite(val) || val < 0) return null
  return val
}

export function budgetUpsertPayload(input: {
  userId: string
  validFrom: string
  totalBudget: number
  editedUsed: number
  currentYearOrderUsed: number
  currentYear: number
}): {
  user_id: string
  year: number
  total_budget: number
  used_adjustment: number
  valid_from: string
} {
  const year = budgetYearFromValidFrom(input.validFrom)
  const orderUsed = orderUsedForBudgetYear(input.currentYearOrderUsed, input.validFrom, input.currentYear)
  return {
    user_id: input.userId,
    year,
    total_budget: input.totalBudget,
    used_adjustment: usedAdjustmentFromEdited(input.editedUsed, orderUsed),
    valid_from: input.validFrom,
  }
}

export async function getCurrentBudget(userId: string, year: number): Promise<number> {
  const { data } = await supabase
    .from('user_budgets')
    .select('total_budget')
    .eq('user_id', userId)
    .eq('year', year)
    .lte('valid_from', today())
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.total_budget ?? DEFAULT_BUDGET
}

export async function getUsedBudget(userId: string, year: number): Promise<number> {
  const [{ data: orders }, { data: budget }] = await Promise.all([
    supabase
      .from('orders')
      .select('unit_price, quantity')
      .eq('user_id', userId)
      .not('status', 'in', '(pending,cancelled)')
      .gte('created_at', `${year}-01-01`)
      .lt('created_at', `${year + 1}-01-01`),
    supabase
      .from('user_budgets')
      .select('used_adjustment')
      .eq('user_id', userId)
      .eq('year', year)
      .lte('valid_from', today())
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const orderUsed = (orders ?? []).reduce((s, o) => s + o.unit_price * o.quantity, 0)
  return effectiveUsed(orderUsed, Number(budget?.used_adjustment ?? 0))
}

/**
 * Wie getCurrentShoeRefundCap(), gibt aber zusätzlich einen eventuellen
 * Abfragefehler zurück - für Stellen, die einen fehlgeschlagenen Lookup NICHT
 * stillschweigend als "kein Cap konfiguriert" (= DEFAULT_SHOE_CAP) behandeln
 * dürfen, weil sie den zurückgegebenen Betrag dauerhaft speichern (z. B. beim
 * Genehmigen einer Schuherstattung).
 */
export async function getCurrentShoeRefundCapResult() {
  const { data, error } = await supabase
    .from('shoe_refund_caps')
    .select('cap_amount')
    .lte('valid_from', today())
    .order('valid_from', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return { cap: (data?.cap_amount ?? DEFAULT_SHOE_CAP) as number, error }
}

export async function getCurrentShoeRefundCap(): Promise<number> {
  const { cap } = await getCurrentShoeRefundCapResult()
  return cap
}

/** Gleiches Gültig-ab-Datum → bestehenden Cap-Eintrag überschreiben, sonst neu anlegen. */
export function existingCapIdForDate(
  caps: { id: string; valid_from: string }[],
  validFrom: string,
): string | null {
  return caps.find(c => c.valid_from.slice(0, 10) === validFrom.slice(0, 10))?.id ?? null
}
