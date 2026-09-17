import { isAuthenticated, serviceUnavailable, unauthorized, type AuthEnv } from './_auth'

interface Env extends AuthEnv {
  BEKLEIDUNG: R2Bucket
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Einsatz-Unterlagen haben keine eigene DB-Tabelle (Metadaten liegen nur im localStorage
// der Zentrale/Streife). Berechtigung folgt daher der beim Upload: angemeldet + aktives
// Profil reicht, der Datei-Key muss aber unter dem angegebenen Einsatz liegen.
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return serviceUnavailable()
  if (!(await isAuthenticated(request, env))) return unauthorized()

  const incidentId = request.headers.get('X-Incident-Id') ?? ''
  const key = request.headers.get('X-File-Key') ?? ''
  if (!UUID.test(incidentId) || !key.startsWith(`einsatz-dokumente/${incidentId}/`)) {
    return new Response(JSON.stringify({ error: 'Ungültige Unterlage.' }), { status: 400 })
  }

  try {
    await env.BEKLEIDUNG.delete(key)
  } catch {
    return new Response(JSON.stringify({ error: 'Unterlage konnte nicht gelöscht werden.' }), { status: 400 })
  }
  return new Response(JSON.stringify({ deleted: true }), { headers: { 'Content-Type': 'application/json' } })
}
