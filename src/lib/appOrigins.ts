/** App-Origins für CORS (create-user) und ähnliche Browser-Aufrufe. Nie `*`. */
export const STATIC_APP_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
  'https://bekleidung-polizei.pages.dev',
] as const

const PREVIEW_HOST_SUFFIX = '.bekleidung-polizei.pages.dev'

export function isAllowedAppOrigin(origin: string, extraOrigins: string[] = []): boolean {
  if (!origin) return false
  if ((STATIC_APP_ORIGINS as readonly string[]).includes(origin)) return true
  if (extraOrigins.includes(origin)) return true
  try {
    const u = new URL(origin)
    return u.protocol === 'https:' && u.hostname.endsWith(PREVIEW_HOST_SUFFIX)
  } catch {
    return false
  }
}

export function corsHeadersForOrigin(
  origin: string | null | undefined,
  extraOrigins: string[] = [],
): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  if (origin && isAllowedAppOrigin(origin, extraOrigins)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}
