import { canManageEinsatz, isAuthenticated, serviceUnavailable, unauthorized, type AuthEnv } from './_auth'

interface Env extends AuthEnv {
  BEKLEIDUNG: R2Bucket
}

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
])

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!context.env.SUPABASE_URL || !context.env.SUPABASE_ANON_KEY) return serviceUnavailable()
  if (!(await isAuthenticated(context.request, context.env))) return unauthorized()
  if (!(await canManageEinsatz(context.request, context.env))) {
    return new Response(JSON.stringify({ error: 'Nur Sachbearbeiter oder Admins dürfen Unterlagen hochladen.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const formData = await context.request.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return new Response(JSON.stringify({ error: 'Keine Datei ausgewählt.' }), { status: 400 })
  }
  if (file.size > 20 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'Datei zu groß (max. 20 MB).' }), { status: 400 })
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return new Response(JSON.stringify({ error: 'Dieser Dateityp ist nicht erlaubt.' }), { status: 400 })
  }

  const extension = (file.name.split('.').pop() ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10)
  const key = `einsatz-unterlagen/${crypto.randomUUID()}.${extension}`
  await context.env.BEKLEIDUNG.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  })

  return new Response(JSON.stringify({ key, name: file.name }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
