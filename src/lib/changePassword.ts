/** Passwort ändern auf Mein Profil: Reauth mit aktuellem Passwort, dann updateUser. */

import {
  ensureAuthSession,
  isAuthSessionMissingError,
  type AuthSessionApi,
} from './erstlogin'

/** Hosted Auth / GoTrue: `[auth] minimum_password_length = 6` (Startpasswort 123456). */
export const AUTH_PASSWORD_MIN_LENGTH = 6

export const CHANGE_PASSWORD_SESSION_EXPIRED =
  'Sitzung abgelaufen. Bitte neu anmelden und erneut versuchen.'

export const CHANGE_PASSWORD_WRONG_CURRENT = 'Aktuelles Passwort ist falsch.'

export const CHANGE_PASSWORD_TOO_SHORT = 'Neues Passwort muss mindestens 6 Zeichen haben.'

export const CHANGE_PASSWORD_MISMATCH = 'Passwörter stimmen nicht überein.'

export const CHANGE_PASSWORD_SAME_AS_CURRENT =
  'Neues Passwort muss sich vom aktuellen unterscheiden.'

export const CHANGE_PASSWORD_CURRENT_REQUIRED = 'Aktuelles Passwort ist Pflicht.'

export const CHANGE_PASSWORD_NO_ACCOUNT = 'Kein Konto gefunden. Bitte neu anmelden.'

export const CHANGE_PASSWORD_FAILED = 'Passwort konnte nicht geändert werden.'

export type ChangePasswordFields = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export type ChangePasswordResult = { ok: true } | { ok: false; error: string }

export function isValidAuthPassword(pw: string): boolean {
  return pw.length >= AUTH_PASSWORD_MIN_LENGTH
}

export function validateChangePassword(fields: ChangePasswordFields): ChangePasswordResult {
  if (!fields.currentPassword) return { ok: false, error: CHANGE_PASSWORD_CURRENT_REQUIRED }
  if (!isValidAuthPassword(fields.newPassword)) return { ok: false, error: CHANGE_PASSWORD_TOO_SHORT }
  if (fields.newPassword !== fields.confirmPassword) return { ok: false, error: CHANGE_PASSWORD_MISMATCH }
  if (fields.currentPassword === fields.newPassword) {
    return { ok: false, error: CHANGE_PASSWORD_SAME_AS_CURRENT }
  }
  return { ok: true }
}

export function mapChangePasswordAuthError(
  error: { message?: string; name?: string } | null | undefined,
): string {
  if (isAuthSessionMissingError(error)) return CHANGE_PASSWORD_SESSION_EXPIRED
  const message = error?.message?.trim() ?? ''
  if (/different from the old password/i.test(message)) return CHANGE_PASSWORD_SAME_AS_CURRENT
  if (/at least 6 characters|least 6/i.test(message)) return CHANGE_PASSWORD_TOO_SHORT
  if (/invalid login credentials|invalid.*password|email or password/i.test(message)) {
    return CHANGE_PASSWORD_WRONG_CURRENT
  }
  return message || CHANGE_PASSWORD_FAILED
}

export type ChangePasswordAuth = AuthSessionApi & {
  getUser: () => Promise<{ data: { user: { email?: string | null } | null } }>
  signInWithPassword: (creds: {
    email: string
    password: string
  }) => Promise<{ error: { message?: string; name?: string } | null }>
  updateUser: (attrs: {
    password: string
  }) => Promise<{ error: { message?: string; name?: string } | null }>
}

/**
 * Bestätigt das aktuelle Passwort per signInWithPassword (Session-E-Mail),
 * danach supabase.auth.updateUser({ password }).
 */
export async function changeOwnPassword(
  auth: ChangePasswordAuth,
  fields: ChangePasswordFields,
): Promise<ChangePasswordResult> {
  const validated = validateChangePassword(fields)
  if (!validated.ok) return validated

  const sessionOk = await ensureAuthSession(auth)
  if (!sessionOk) return { ok: false, error: CHANGE_PASSWORD_SESSION_EXPIRED }

  const { data: { user } } = await auth.getUser()
  const email = user?.email?.trim()
  if (!email) return { ok: false, error: CHANGE_PASSWORD_NO_ACCOUNT }

  const { error: signErr } = await auth.signInWithPassword({
    email,
    password: fields.currentPassword,
  })
  if (signErr) return { ok: false, error: CHANGE_PASSWORD_WRONG_CURRENT }

  const { error: updErr } = await auth.updateUser({ password: fields.newPassword })
  if (updErr) return { ok: false, error: mapChangePasswordAuthError(updErr) }
  return { ok: true }
}
