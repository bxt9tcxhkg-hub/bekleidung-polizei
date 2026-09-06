/** Erstlogin («Konto einrichten»): Session-Prüfung und Fehlermeldung. */

export const ERSTLOGIN_SESSION_EXPIRED =
  'Sitzung abgelaufen. Bitte neu anmelden und Erstlogin erneut versuchen.'

export type SessionLike = object | null | undefined

export type AuthSessionApi = {
  getSession: () => Promise<{ data: { session: SessionLike } }>
  refreshSession: () => Promise<{ data: { session: SessionLike } }>
}

/** Vor jedem Erstlogin-Write: vorhandene Session nutzen, sonst einmal refreshen. */
export async function ensureAuthSession(auth: AuthSessionApi): Promise<boolean> {
  const { data: { session } } = await auth.getSession()
  if (session) return true
  const { data: { session: refreshed } } = await auth.refreshSession()
  return Boolean(refreshed)
}

export function isAuthSessionMissingError(
  error: { message?: string; name?: string } | null | undefined,
): boolean {
  if (!error) return false
  const name = error.name ?? ''
  const message = error.message ?? ''
  return name === 'AuthSessionMissingError' || /session missing/i.test(message)
}

export function mapErstloginAuthError(
  error: { message?: string; name?: string } | null | undefined,
): string {
  if (isAuthSessionMissingError(error)) return ERSTLOGIN_SESSION_EXPIRED
  const message = error?.message?.trim()
  return message || 'Konto konnte nicht eingerichtet werden.'
}
