import { supabase } from './supabase'
import type { AppErrorSource, Database } from './types'

export type { AppErrorSource }

export const APP_ERROR_MESSAGE_MAX = 500
export const APP_ERROR_STACK_MAX = 4000
export const APP_ERROR_PATH_MAX = 300
export const APP_ERROR_USER_AGENT_MAX = 300

const REDACTED = '[REDACTED]'
const DEDUP_MS = 2000

type AppErrorInsert = Database['public']['Tables']['app_errors']['Insert']

const reportedObjects = new WeakSet<object>()
const recentKeys = new Map<string, number>()
let handlersInstalled = false

export function truncateText(value: string, max: number): string {
  if (max <= 0) return ''
  return value.length <= max ? value : value.slice(0, max)
}

/** Entfernt Passwörter, Bearer-Tokens und JWT-ähnliche Zeichenketten. */
export function redactSecrets(value: string): string {
  return value
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, REDACTED)
    .replace(/Bearer\s+\S+/gi, `Bearer ${REDACTED}`)
    .replace(
      /([?&](?:password|passwd|pwd|token|secret|access_token|refresh_token|id_token|api[_-]?key|apikey)=)[^&]*/gi,
      `$1${REDACTED}`,
    )
    .replace(
      /((?:password|passwd|pwd|token|secret|access_token|refresh_token|id_token|api[_-]?key|apikey)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s&]+)/gi,
      `$1${REDACTED}`,
    )
}

export function sanitizeErrorText(value: string, max: number): string {
  return truncateText(redactSecrets(value).replace(/\0/g, ''), max)
}

export function buildAppErrorInsert(input: {
  message: string
  stack?: string | null
  source: AppErrorSource
  path: string
  userAgent?: string | null
  userId?: string | null
  roleSnapshot?: readonly string[]
}): AppErrorInsert {
  const message = sanitizeErrorText(input.message, APP_ERROR_MESSAGE_MAX) || 'Unbekannter Fehler'
  const rawStack = input.stack ?? ''
  const stack = rawStack ? sanitizeErrorText(rawStack, APP_ERROR_STACK_MAX) || null : null
  const path = sanitizeErrorText(input.path, APP_ERROR_PATH_MAX) || '/'
  const rawAgent = input.userAgent ?? ''
  const userAgent = rawAgent ? sanitizeErrorText(rawAgent, APP_ERROR_USER_AGENT_MAX) || null : null
  const roleSnapshot = (input.roleSnapshot ?? [])
    .map(role => sanitizeErrorText(role, 64))
    .filter(role => role.length > 0)

  return {
    user_id: input.userId ?? null,
    role_snapshot: roleSnapshot,
    path,
    message,
    stack,
    source: input.source,
    user_agent: userAgent,
  }
}

function asReportableObject(value: unknown): object | undefined {
  return typeof value === 'object' && value !== null ? value : undefined
}

function shouldSkipDuplicate(key: string, reportable: object | undefined): boolean {
  const now = Date.now()
  if (reportable && reportedObjects.has(reportable)) return true
  if (reportable) reportedObjects.add(reportable)

  const previous = recentKeys.get(key)
  if (previous !== undefined && now - previous < DEDUP_MS) return true
  recentKeys.set(key, now)

  for (const [seen, at] of recentKeys) {
    if (now - at >= DEDUP_MS) recentKeys.delete(seen)
  }
  return false
}

async function persistAppError(input: {
  message: string
  stack?: string | null
  source: AppErrorSource
  path: string
  userAgent?: string | null
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let roleSnapshot: string[] = []
    const { data: profile } = await supabase
      .from('profiles')
      .select('roles')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.roles) roleSnapshot = profile.roles

    const row = buildAppErrorInsert({
      message: input.message,
      stack: input.stack,
      source: input.source,
      path: input.path,
      userAgent: input.userAgent,
      userId: user.id,
      roleSnapshot,
    })
    const { error } = await supabase.from('app_errors').insert(row)
    if (error) console.error('Fehlerprotokoll fehlgeschlagen:', error.message)
  } catch {
    // Fire-and-forget: Protokoll darf die UI nie blockieren.
  }
}

/**
 * Schreibt einen Laufzeitfehler nach public.app_errors (nur eigenes Supabase).
 * Fire-and-forget: niemals awaiten, niemals die UI blockieren.
 */
export function reportAppError(input: {
  message: string
  stack?: string | null
  source: AppErrorSource
  error?: unknown
}): void {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/'
  const reportable = asReportableObject(input.error)
  if (shouldSkipDuplicate(`${path}\n${input.message}`, reportable)) return

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null
  void persistAppError({
    message: input.message,
    stack: input.stack,
    source: input.source,
    path,
    userAgent,
  })
}

/** Installiert window.onerror und unhandledrejection genau einmal. */
export function installGlobalErrorHandlers(): void {
  if (handlersInstalled || typeof window === 'undefined') return
  handlersInstalled = true

  window.addEventListener('error', (event: ErrorEvent) => {
    try {
      if (!event.message) return
      const err = event.error instanceof Error ? event.error : undefined
      reportAppError({
        message: event.message,
        stack: err?.stack ?? null,
        source: 'window',
        error: err ?? event,
      })
    } catch {
      // Handler darf selbst keinen Fehler werfen.
    }
  })

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    try {
      const reason = event.reason
      const err = reason instanceof Error ? reason : undefined
      const message = err?.message
        ?? (typeof reason === 'string' ? reason : 'Unbehandelte Promise-Ablehnung')
      reportAppError({
        message,
        stack: err?.stack ?? null,
        source: 'unhandledrejection',
        error: err ?? asReportableObject(reason),
      })
    } catch {
      // Handler darf selbst keinen Fehler werfen.
    }
  })
}
