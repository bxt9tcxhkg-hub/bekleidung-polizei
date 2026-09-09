import { canManageEinsatz, isAuthenticated, serviceUnavailable, unauthorized, type AuthEnv } from './_auth'

interface Env extends AuthEnv {
  BEKLEIDUNG: R2Bucket
}

const MAX_FILE_SIZE = 100 * 1024 * 1024

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

  const encodedName = context.request.headers.get('X-File-Name')
  const contentType = context.request.headers.get('Content-Type') ?? ''
  const contentLength = Number(context.request.headers.get('Content-Length') ?? '')
  let fileName = ''
  try {
    fileName = decodeURIComponent(encodedName ?? '')
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiger Dateiname.' }), { status: 400 })
  }
  if (!fileName || !context.request.body) {
    return new Response(JSON.stringify({ error: 'Keine Datei ausgewählt.' }), { status: 400 })
  }
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
    return new Response(JSON.stringify({ error: 'Dateigröße konnte nicht geprüft werden.' }), { status: 400 })
  }
  if (contentLength > MAX_FILE_SIZE) {
    return new Response(JSON.stringify({ error: 'Datei zu groß (max. 100 MB).' }), { status: 400 })
  }
  if (!ALLOWED_TYPES.has(contentType)) {
    return new Response(JSON.stringify({ error: 'Dieser Dateityp ist nicht erlaubt.' }), { status: 400 })
  }

  const extension = (fileName.split('.').pop() ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10)
  const key = `einsatz-unterlagen/${crypto.randomUUID()}.${extension}`
  await context.env.BEKLEIDUNG.put(key, context.request.body, {
    httpMetadata: { contentType },
  })

  return new Response(JSON.stringify({ key, name: fileName }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
