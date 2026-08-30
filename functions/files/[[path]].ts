import { isAuthenticated, unauthorized, serviceUnavailable, type AuthEnv } from '../_auth'

interface Env extends AuthEnv {
  BEKLEIDUNG: R2Bucket
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!context.env.SUPABASE_URL || !context.env.SUPABASE_ANON_KEY) return serviceUnavailable()
  if (!(await isAuthenticated(context.request, context.env))) return unauthorized()

  const key = (context.params['path'] as string[]).join('/')

  const object = await context.env.BEKLEIDUNG.get(key)
  if (!object) {
    return new Response('Not found', { status: 404 })
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)

  return new Response(object.body, { headers })
}
