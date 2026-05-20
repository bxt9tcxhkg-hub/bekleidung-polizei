interface Env {
  BEKLEIDUNG: R2Bucket
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const formData = await context.request.formData()
    const file = formData.get('file') as File | null
    const folder = (formData.get('folder') as string) || 'misc'

    if (!file) return new Response('No file provided', { status: 400 })

    const ext = file.name.split('.').pop() ?? 'bin'
    const key = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`

    await context.env.BEKLEIDUNG.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: file.name },
    })

    return Response.json({ key, name: file.name })
  } catch (e) {
    return new Response('Upload failed', { status: 500 })
  }
}
