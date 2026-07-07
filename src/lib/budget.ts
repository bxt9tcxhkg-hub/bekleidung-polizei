import { supabase } from './supabase'

const DEFAULT_BUDGET = 350
const today = () => new Date().toISOString().split('T')[0]

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
    .limit(1)
    .maybeSingle()
  return data?.cap_amount ?? 120
}

export { DEFAULT_BUDGET }
