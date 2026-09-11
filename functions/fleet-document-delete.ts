import { bearerHeaders, isAuthenticated, serviceUnavailable, unauthorized, type AuthEnv } from './_auth'

interface Env extends AuthEnv {
  BEKLEIDUNG: R2Bucket
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return serviceUnavailable()
  if (!(await isAuthenticated(request, env))) return unauthorized()

  const id = request.headers.get('X-Document-Id') ?? ''
  const headers = bearerHeaders(request, env)
  if (!UUID.test(id) || !headers) return new Response(JSON.stringify({ error: 'Ungültiges Dokument.' }), { status: 400 })

  // RLS auf fleet_documents entscheidet, ob löschen erlaubt ist (Fuhrpark-Verwaltung oder Fahrzeugverantwortliche/r).
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/fleet_documents?id=eq.${encodeURIComponent(id)}&select=id,file_key`, {
    method: 'DELETE',
    headers: { ...headers, Prefer: 'return=representation' },
  })
  if (!response.ok) return new Response(JSON.stringify({ error: 'Dokument konnte nicht gelöscht werden.' }), { status: 400 })
  const rows = await response.json() as { id: string; file_key: string | null }[]
  if (rows.length !== 1) return new Response(JSON.stringify({ error: 'Dokument wurde nicht gefunden, ist bereits gelöscht oder keine Berechtigung.' }), { status: 404 })

  const key = rows[0].file_key
  if (key?.startsWith('fuhrpark-dokumente/')) {
    try { await env.BEKLEIDUNG.delete(key) } catch { /* Orphaned object is inaccessible and can be cleaned up later. */ }
  }
  return new Response(JSON.stringify({ deleted: true }), { headers: { 'Content-Type': 'application/json' } })
}
