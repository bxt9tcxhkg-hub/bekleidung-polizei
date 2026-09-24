interface Env {
  ASSETS: Fetcher
}

function isDocumentNavigation(request: Request) {
  if (request.method !== 'GET') return false

  const destination = request.headers.get('Sec-Fetch-Dest')
  if (destination) return destination === 'document'

  return request.headers.get('Accept')?.includes('text/html') ?? false
}

function preventStaleHtml(response: Response) {
  if (!response.headers.get('Content-Type')?.includes('text/html')) return response

  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-cache')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const response = await context.next()
  if (response.status !== 404) return preventStaleHtml(response)

  // Nur echte Seitennavigationen erhalten den SPA-Einstieg. Fehlende JS-,
  // CSS- oder Bilddateien müssen 404 bleiben, statt als index.html mit
  // falschem MIME-Typ beantwortet zu werden.
  if (!isDocumentNavigation(context.request)) return response

  const indexResponse = await context.env.ASSETS.fetch(new URL('/index.html', context.request.url).toString())
  return preventStaleHtml(indexResponse)
}
