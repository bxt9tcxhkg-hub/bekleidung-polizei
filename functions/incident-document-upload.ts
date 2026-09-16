import { isAuthenticated, serviceUnavailable, unauthorized, type AuthEnv } from './_auth'
import { countUploadBytes, uploadSize } from './_upload'

interface Env extends AuthEnv {
  BEKLEIDUNG: R2Bucket
}

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!context.env.SUPABASE_URL || !context.env.SUPABASE_ANON_KEY) return serviceUnavailable()
  if (!(await isAuthenticated(context.request, context.env))) return unauthorized()

  const incidentId = context.request.headers.get('X-Incident-Id') ?? ''
  if (!UUID.test(incidentId)) {
    return new Response(JSON.stringify({ error: 'Ungültiger Einsatz.' }), { status: 400 })
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
    return new Response(JSON.stringify({ error: 'Ungültige Dateigröße (max. 20 MB).' }), { status: 400 })
  }
  if (contentLength > 20_000_000) {
    return new Response(JSON.stringify({ error: 'Datei zu groß (max. 20 MB).' }), { status: 400 })
  }
  if (!ALLOWED_TYPES.has(contentType) && !contentType.startsWith('image/')) {
    return new Response(JSON.stringify({ error: 'Nur PDF oder Bild (Ausweis, Auszug).' }), { status: 400 })
  }

  const extension = (fileName.split('.').pop() ?? 'bin').replace(/[^A-Za-z0-9]/g, '').slice(0, 10)
  const key = `einsatz-dokumente/${incidentId}/${crypto.randomUUID()}.${extension}`
  const fixed = new FixedLengthStream(contentLength)
  try {
    await Promise.all([
      context.request.body.pipeThrough(countUploadBytes(contentLength)).pipeTo(fixed.writable),
      context.env.BEKLEIDUNG.put(key, fixed.readable, { httpMetadata: { contentType } }),
    ])
  } catch {
    return new Response(JSON.stringify({ error: 'Upload fehlgeschlagen.' }), { status: 400 })
  }

  return new Response(JSON.stringify({ key, name: fileName, size: contentLength, type: contentType }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
