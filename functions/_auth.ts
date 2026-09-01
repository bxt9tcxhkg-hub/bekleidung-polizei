// Verifiziert Supabase-Access-Tokens für Pages Functions.
// URL/Key müssen per Env gesetzt sein (Cloudflare Pages → Settings → Environment variables).
// Kein Fallback-JWT im Quellcode — ohne Env schlägt die Prüfung fehl.

export interface AuthEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
}

/**
 * Liest den Access-Token aus dem Authorization-Header (Bearer)
 * und prüft ihn gegen Supabase Auth. Query-Parameter werden nicht akzeptiert.
 */
export async function isAuthenticated(request: Request, env: AuthEnv): Promise<boolean> {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return false

  const supabaseUrl = env.SUPABASE_URL
  const anonKey = env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return false

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    })
    return res.ok
  } catch {
    return false
  }
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function serviceUnavailable(): Response {
  return new Response(JSON.stringify({ error: 'Upload/Dateien nicht konfiguriert (SUPABASE_URL, SUPABASE_ANON_KEY)' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  })
}
