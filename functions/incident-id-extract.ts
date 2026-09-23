import { bearerHeaders, isAuthenticated, serviceUnavailable, unauthorized, type AuthEnv } from './_auth'

interface MarkdownResult {
  format: 'markdown' | 'text' | 'error'
  data?: string
  error?: string
}

interface AiBinding {
  toMarkdown(input: { name: string; blob: Blob }): Promise<MarkdownResult>
}

interface Env extends AuthEnv {
  BEKLEIDUNG: R2Bucket
  AI: AiBinding
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function mrzDate(value: string): string | null {
  if (!/^\d{6}$/.test(value)) return null
  const yy = Number(value.slice(0, 2))
  const mm = Number(value.slice(2, 4))
  const dd = Number(value.slice(4, 6))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  const nowYY = new Date().getFullYear() % 100
  const year = yy > nowYY ? 1900 + yy : 2000 + yy
  return String(dd).padStart(2, '0') + '.' + String(mm).padStart(2, '0') + '.' + year
}

function cleanName(value: string): string {
  return value.replace(/</g, ' ').replace(/\s+/g, ' ').trim()
}

function parseMrz(text: string): Record<string, string> {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.toUpperCase().replace(/[^A-Z0-9<]/g, ''))
    .filter(line => line.includes('<') && line.length >= 28)

  // TD1 identity card: 3 x 30 chars.
  for (let i = 0; i + 2 < lines.length; i++) {
    const a = lines[i].slice(0, 30)
    const b = lines[i + 1].slice(0, 30)
    const d = lines[i + 2].slice(0, 30)
    if ((a.startsWith('I') || a.startsWith('A') || a.startsWith('C')) && /^\d{6}/.test(b)) {
      const parts = d.split('<<')
      const geburtsdatum = mrzDate(b.slice(0, 6))
      const dokumentnummer = cleanName(a.slice(5, 14))
      return {
        ...(parts[0] ? { nachname: cleanName(parts[0]) } : {}),
        ...(parts[1] ? { vorname: cleanName(parts.slice(1).join(' ')) } : {}),
        ...(geburtsdatum ? { geburtsdatum } : {}),
        ...(dokumentnummer ? { dokumentnummer } : {}),
      }
    }
  }

  // TD3 passport: 2 x 44 chars.
  for (let i = 0; i + 1 < lines.length; i++) {
    const a = lines[i]
    const b = lines[i + 1]
    if (a.startsWith('P<') && a.length >= 40 && b.length >= 40) {
      const names = a.slice(5).split('<<')
      const geburtsdatum = mrzDate(b.slice(13, 19))
      const dokumentnummer = cleanName(b.slice(0, 9))
      return {
        ...(names[0] ? { nachname: cleanName(names[0]) } : {}),
        ...(names[1] ? { vorname: cleanName(names.slice(1).join(' ')) } : {}),
        ...(geburtsdatum ? { geburtsdatum } : {}),
        ...(dokumentnummer ? { dokumentnummer } : {}),
      }
    }
  }
  return {}
}

function fallbackFields(text: string): Record<string, string> {
  const compact = text.replace(/\r/g, '')
  const date = compact.match(/(?:geburtsdatum|date of birth|birth)\s*[:\-]?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/i)?.[1]
    ?? compact.match(/\b(\d{1,2}\.\d{1,2}\.\d{4})\b/)?.[1]
  const doc = compact.match(/(?:dokument(?:nummer)?|document no\.?|ausweisnummer|passport no\.?)\s*[:\-]?\s*([A-Z0-9-]{5,20})/i)?.[1]
  return {
    ...(date ? { geburtsdatum: date.replace(/\//g, '.') } : {}),
    ...(doc ? { dokumentnummer: doc } : {}),
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!context.env.SUPABASE_URL || !context.env.SUPABASE_ANON_KEY) return serviceUnavailable()
  if (!(await isAuthenticated(context.request, context.env))) return unauthorized()
  if (!context.env.AI) return new Response(JSON.stringify({ error: 'Dokumenterkennung ist nicht konfiguriert.' }), { status: 503 })

  const incidentId = context.request.headers.get('X-Incident-Id') ?? ''
  const documentId = context.request.headers.get('X-Document-Id') ?? ''
  if (!UUID.test(incidentId) || !UUID.test(documentId)) {
    return new Response(JSON.stringify({ error: 'Ungültige Einsatz- oder Dokument-ID.' }), { status: 400 })
  }

  const headers = bearerHeaders(context.request, context.env)
  if (!headers) return unauthorized()
  const lookup = await fetch(
    `${context.env.SUPABASE_URL}/rest/v1/einsatz_dokumente?select=id,file_key,file_name,art&incident_id=eq.${encodeURIComponent(incidentId)}&id=eq.${encodeURIComponent(documentId)}&source=eq.streife&art=eq.ausweis&limit=1`,
    { headers },
  )
  if (!lookup.ok) return unauthorized()
  const rows = await lookup.json() as Array<{ id: string; file_key: string; file_name: string; art: string }>
  const doc = rows[0]
  if (!doc) return new Response(JSON.stringify({ error: 'Ausweisdokument nicht gefunden.' }), { status: 404 })

  const object = await context.env.BEKLEIDUNG.get(doc.file_key)
  if (!object) return new Response(JSON.stringify({ error: 'Datei nicht gefunden.' }), { status: 404 })

  try {
    const type = object.httpMetadata?.contentType ?? 'application/octet-stream'
    const converted = await context.env.AI.toMarkdown({
      name: doc.file_name,
      blob: new Blob([await object.arrayBuffer()], { type }),
    })
    if (converted.format === 'error' || !converted.data) {
      return new Response(JSON.stringify({ error: converted.error || 'Ausweis konnte nicht gelesen werden.' }), { status: 422 })
    }
    const fields = { ...fallbackFields(converted.data), ...parseMrz(converted.data) }
    return Response.json({ fields, text: converted.data })
  } catch {
    return new Response(JSON.stringify({ error: 'Ausweisdaten konnten nicht automatisch gelesen werden.' }), { status: 422 })
  }
}
