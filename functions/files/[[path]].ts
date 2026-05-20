interface Env {
  BEKLEIDUNG: R2Bucket
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const key = (context.params.path as string[]).join('/')
  if (!key) return new Response('Not found', { status: 404 })

  const object = await context.env.BEKLEIDUNG.get(key)
  if (!object) return new Response('Not found', { status: 404 })

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'private, max-age=3600')

  return new Response(object.body, { headers })
}
