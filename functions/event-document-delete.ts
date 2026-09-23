import { canManageZentrale, isAuthenticated, isZentralistOnDuty, serviceUnavailable, unauthorized, type AuthEnv } from './_auth'

interface Env extends AuthEnv {
  BEKLEIDUNG: R2Bucket
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return serviceUnavailable()
  if (!(await isAuthenticated(request, env))) return unauthorized()
  const allowed = await Promise.all([
    canManageZentrale(request, env),
    isZentralistOnDuty(request, env),
  ])
  if (!allowed.some(Boolean)) return new Response('Forbidden', { status: 403 })

  const eventId = request.headers.get('X-Event-Id') ?? ''
  const key = request.headers.get('X-File-Key') ?? ''
  if (!UUID.test(eventId) || !key.startsWith(`ereignis-dokumente/${eventId}/`)) {
    return new Response(JSON.stringify({ error: 'Ungültiges Ereignisdokument.' }), { status: 400 })
  }

  try {
    await env.BEKLEIDUNG.delete(key)
  } catch {
    return new Response(JSON.stringify({ error: 'Ereignisdokument konnte nicht gelöscht werden.' }), { status: 400 })
  }

  return new Response(JSON.stringify({ deleted: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
