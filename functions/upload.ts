import { canManageBekleidung, isAuthenticated, unauthorized, serviceUnavailable, type AuthEnv } from './_auth'

interface Env extends AuthEnv {
  BEKLEIDUNG: R2Bucket
  GEMINI_API_KEY: string
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!context.env.SUPABASE_URL || !context.env.SUPABASE_ANON_KEY) return serviceUnavailable()
  if (!(await isAuthenticated(context.request, context.env))) return unauthorized()
  if (!(await canManageBekleidung(context.request, context.env))) return new Response('Forbidden', { status: 403 })

  const formData = await context.request.formData()
  const file = formData.get('file') as File | null
  const rawFolder = (formData.get('folder') as string | null) ?? 'uploads'
  if (rawFolder !== 'vorrechnungen') return new Response('Ungültiger Dateiordner', { status: 400 })
  const folder = rawFolder

  if (!file || typeof file === 'string' || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
    return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 })
  }
  if (file.size > 20 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'Datei zu groß (max. 20 MB)' }), { status: 400 })
  }

  const ext = (file.name.split('.').pop() ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10)
  const key = `${folder}/${crypto.randomUUID()}.${ext}`
  const fileBuffer = await file.arrayBuffer()

  await context.env.BEKLEIDUNG.put(key, fileBuffer, {
    httpMetadata: { contentType: file.type },
  })

  let analysis = null
  if (file.type === 'application/pdf' && context.env.GEMINI_API_KEY) {
    try {
      const base64 = arrayBufferToBase64(fileBuffer)
      const geminiRes = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': context.env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: 'application/pdf', data: base64 } },
                { text: `Analysiere diese Vorrechnung/Rechnung und extrahiere die Informationen als JSON. Antworte NUR mit validem JSON:
{
  "rechnungsnummer": "string oder null",
  "gesamtbetrag": 123.45,
  "positionen": [
    {
      "artikelnummer": "string oder leerer String",
      "bezeichnung": "string",
      "menge": 1,
      "einzelpreis": 12.34
    }
  ]
}` }
              ]
            }],
            generationConfig: { temperature: 0 }
          })
        }
      )
      if (geminiRes.ok) {
        const geminiData = await geminiRes.json() as any
        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        const match = text.match(/\{[\s\S]*\}/)
        if (match) analysis = JSON.parse(match[0])
      }
    } catch {
      // Analyse fehlgeschlagen — Upload trotzdem erfolgreich
    }
  }

  return new Response(JSON.stringify({ key, name: file.name, analysis }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
