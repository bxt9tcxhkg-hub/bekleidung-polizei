import { canManageEinsatz, isAuthenticated, serviceUnavailable, unauthorized, type AuthEnv } from './_auth'
import { countUploadBytes, uploadSize } from './_upload'

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

  const encodedName = context.request.headers.get('X-File-Name')
  const contentType = context.request.headers.get('Content-Type') ?? ''
  const contentLength = uploadSize(context.request.headers)
  let fileName = ''
  try {
    fileName = decodeURIComponent(encodedName ?? '')
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültiger Dateiname.' }), { status: 400 })
  }
  if (!fileName || !context.request.body) {
    return new Response(JSON.stringify({ error: 'Keine Datei ausgewählt.' }), { status: 400 })
  }
  if (contentLength === null) {
    return new Response(JSON.stringify({ error: 'Ungültige Dateigröße (max. 100 MB). Bitte die Seite neu laden und erneut versuchen.' }), { status: 400 })
  }
  if (!ALLOWED_TYPES.has(contentType)) {
    return new Response(JSON.stringify({ error: 'Dieser Dateityp ist nicht erlaubt.' }), { status: 400 })
  }

  const extension = (fileName.split('.').pop() ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10)
  const key = `einsatz-unterlagen/${crypto.randomUUID()}.${extension}`
  // R2 requires a stream with known length. FixedLengthStream also rejects truncation.
  const fixed = new FixedLengthStream(contentLength)
  try {
    await Promise.all([
      context.request.body.pipeThrough(countUploadBytes(contentLength)).pipeTo(fixed.writable),
      context.env.BEKLEIDUNG.put(key, fixed.readable, { httpMetadata: { contentType } }),
    ])
  } catch {
    return new Response(JSON.stringify({ error: 'Upload fehlgeschlagen oder Datei unvollständig.' }), { status: 400 })
  }

  return new Response(JSON.stringify({ key, name: fileName }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
