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

/** Auth-Metadata nach erfolgreichem Erstlogin: beide Flags zurücksetzen. */
export function buildErstloginAuthMetadata(): Record<string, unknown> {
  return {
    force_password_change: false,
    force_username_set: false,
  }
}

export type ErstloginProfilePatch = {
  force_username_set: false
  username?: string
  force_password_change?: false
}

/**
 * Profil-Update nach erfolgreichem Auth-Write.
 * `force_password_change` nur, wenn die Spalte am geladenen Profil existiert.
 */
export function buildErstloginProfilePatch(input: {
  pcUsername?: string
  profile?: object | null
}): ErstloginProfilePatch {
  const patch: ErstloginProfilePatch = {
    force_username_set: false,
  }
  if (input.pcUsername) patch.username = input.pcUsername
  if (input.profile && 'force_password_change' in input.profile) {
    patch.force_password_change = false
  }
  return patch
}
