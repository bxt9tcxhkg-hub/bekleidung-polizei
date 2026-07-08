import { supabase } from './supabase'

/**
 * Schreibt einen Eintrag ins Audit-Log. Fire-and-forget:
 * Ein fehlgeschlagener Log-Eintrag darf die eigentliche Aktion nie blockieren.
 */
export function logAudit(action: string, details?: string) {
  supabase.auth.getUser().then(({ data }) => {
    if (!data.user) return
    return supabase.from('audit_log').insert({
      action,
      details: details ?? null,
      user_id: data.user.id,
    })
  }).then(res => {
    if (res && 'error' in res && res.error) console.error('Audit-Log fehlgeschlagen:', res.error.message)
  }).catch(() => {})
}
