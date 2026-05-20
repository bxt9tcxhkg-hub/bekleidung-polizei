interface Env {
  BEKLEIDUNG: R2Bucket
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const formData = await context.request.formData()
  const file = formData.get('file') as File | null
  const folder = (formData.get('folder') as string | null) ?? 'uploads'

  if (!file) {
    return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? ''
  const key = `${folder}/${crypto.randomUUID()}.${ext}`

  await context.env.BEKLEIDUNG.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  })

  return new Response(JSON.stringify({ key, name: file.name }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
