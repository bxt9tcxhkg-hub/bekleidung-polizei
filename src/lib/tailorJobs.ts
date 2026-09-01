import { supabase } from './supabase'

export async function ensureOpenTailorJob(quarterId: string): Promise<{ id: string | null; error: Error | string | null }> {
  const { data: existing, error: findErr } = await supabase
    .from('tailor_jobs')
    .select('id')
    .eq('quarter_id', quarterId)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle()
  if (findErr) return { id: null, error: findErr.message }
  if (existing?.id) return { id: existing.id, error: null }
  const { data: created, error: insErr } = await supabase
    .from('tailor_jobs')
    .insert({ quarter_id: quarterId, status: 'open' as const })
    .select('id')
    .single()
  if (insErr) return { id: null, error: insErr.message }
  return { id: created?.id ?? null, error: null }
}
