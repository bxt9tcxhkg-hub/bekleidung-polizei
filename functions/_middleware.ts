interface Env {
  ASSETS: Fetcher
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const response = await context.next()
  if (response.status === 404) {
    return context.env.ASSETS.fetch(new URL('/index.html', context.request.url).toString())
  }
  return response
}
