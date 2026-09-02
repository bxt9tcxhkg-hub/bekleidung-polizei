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
  const { data } = await supabase
    .from('orders')
    .select('unit_price, quantity')
    .eq('user_id', userId)
    .not('status', 'in', '(pending,cancelled)')
    .gte('created_at', `${year}-01-01`)
  return (data ?? []).reduce((s, o) => s + o.unit_price * o.quantity, 0)
}

export async function getCurrentShoeRefundCap(): Promise<number> {
  const { data } = await supabase
    .from('shoe_refund_caps')
    .select('cap_amount')
    .lte('valid_from', today())
    .order('valid_from', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.cap_amount ?? DEFAULT_SHOE_CAP
}

/** Gleiches Gültig-ab-Datum → bestehenden Cap-Eintrag überschreiben, sonst neu anlegen. */
export function existingCapIdForDate(
  caps: { id: string; valid_from: string }[],
  validFrom: string,
): string | null {
  return caps.find(c => c.valid_from.slice(0, 10) === validFrom.slice(0, 10))?.id ?? null
}
