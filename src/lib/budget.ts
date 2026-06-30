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
