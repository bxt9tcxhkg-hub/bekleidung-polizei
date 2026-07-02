// Verifiziert Supabase-Access-Tokens für Pages Functions.
// URL/Key können per Env überschrieben werden; die Defaults sind die
// öffentlichen Projektwerte (der Anon-Key ist ohnehin im Client-Bundle).
const DEFAULT_SUPABASE_URL = 'https://qqkxlkrkbctexwnqjitx.supabase.co'
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxa3hsa3JrYmN0ZXh3bnFqaXR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Njg1MzksImV4cCI6MjA5NDA0NDUzOX0.WLoCJYLrWRIH6tA6FPHJiJpCOGuPxeBIN5gWiP3mRQU'

export interface AuthEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
}

/**
 * Liest den Access-Token aus dem Authorization-Header (Bearer) oder dem
 * ?token= Query-Parameter (für direkte Datei-Links) und prüft ihn gegen
 * Supabase Auth. Gibt true zurück, wenn ein gültiger Benutzer dahintersteckt.
 */
export async function isAuthenticated(request: Request, env: AuthEnv): Promise<boolean> {
  const authHeader = request.headers.get('Authorization')
  let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) token = new URL(request.url).searchParams.get('token')
  if (!token) return false

  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL
  const anonKey = env.SUPABASE_ANON_KEY || DEFAULT_ANON_KEY

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
