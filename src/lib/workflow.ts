import type { OrderStatus } from './types'

export const AUTH_EMAIL_DOMAIN = 'dornbirn.at'
/** @deprecated Alias — Login-Domain ist dornbirn.at. */
export const LOCAL_AUTH_DOMAIN = AUTH_EMAIL_DOMAIN
export const USERNAME_RE = /^[a-z0-9._-]+$/
export const DN_PLACEHOLDER_USERNAME_RE = /^dn[0-9]+$/i

/** Historisches Admin-Auth-Konto (nicht vorname.nachname@dornbirn.at). */
export const ADMIN_LOGIN_USERNAME = 'admin'
export const ADMIN_AUTH_EMAIL = 'admin@stadtpolizei-dornbirn.local'

export const LOGIN_EMAIL_REQUIRED_ERROR =
  'Bitte Stadt-E-Mail (vorname.nachname@dornbirn.at) oder PC-Benutzernamen eingeben.'

export const LOGIN_IDENTIFIER_REQUIRED_ERROR = LOGIN_EMAIL_REQUIRED_ERROR

export const LOGIN_USERNAME_UNKNOWN_ERROR =
  'Unbekannter Benutzername. Bitte den PC-Anmeldenamen oder die Stadt-E-Mail prüfen.'

const LOGIN_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ResolveLoginEmailResult =
  | { ok: true; email: string }
  | { ok: true; username: string }
  | { ok: false; error: string }

export type UsernameEmailLookup = (username: string) => Promise<string | null>

/** Minimaler RPC-Client für die anonyme Username→E-Mail-Auflösung. */
export type LoginEmailRpcClient = {
  rpc: (
    fn: 'lookup_login_email',
    args: { p_username: string },
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>
}

export function isDnPlaceholderUsername(value: string | null | undefined): boolean {
  return DN_PLACEHOLDER_USERNAME_RE.test((value ?? '').trim())
}

export function isBoundAdminLoginInput(input: string): boolean {
  return input.trim().toLowerCase() === ADMIN_LOGIN_USERNAME
}

export function isBoundAdminIdentity(input: {
  email?: string | null
  username?: string | null
}): boolean {
  const email = (input.email ?? '').trim().toLowerCase()
  const username = (input.username ?? '').trim().toLowerCase()
  return email === ADMIN_AUTH_EMAIL.toLowerCase() || username === ADMIN_LOGIN_USERNAME
}

/** Login: volle E-Mail, PC-Benutzername (Lookup nötig) oder gebundenes Admin-Konto. */
export function resolveLoginEmail(input: string): ResolveLoginEmailResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, error: LOGIN_IDENTIFIER_REQUIRED_ERROR }
  }
  if (isBoundAdminLoginInput(trimmed)) {
    return { ok: true, email: ADMIN_AUTH_EMAIL }
  }
  if (LOGIN_EMAIL_RE.test(trimmed)) {
    return { ok: true, email: trimmed.toLowerCase() }
  }
  const username = sanitizePcUsername(trimmed)
  if (!username || !USERNAME_RE.test(username)) {
    return { ok: false, error: LOGIN_IDENTIFIER_REQUIRED_ERROR }
  }
  if (isDnPlaceholderUsername(username)) {
    return { ok: false, error: LOGIN_USERNAME_UNKNOWN_ERROR }
  }
  return { ok: true, username }
}

export function isUsernameLoginResult(
  result: ResolveLoginEmailResult,
): result is { ok: true; username: string } {
  return result.ok && 'username' in result
}

/** profiles.username → auth.users.email über SECURITY DEFINER RPC (auch ohne Session). */
export async function lookupUsernameAuthEmail(
  client: LoginEmailRpcClient,
  username: string,
): Promise<string | null> {
  const sanitized = sanitizePcUsername(username)
  if (!sanitized || !USERNAME_RE.test(sanitized) || isDnPlaceholderUsername(sanitized)) {
    return null
  }
  const { data, error } = await client.rpc('lookup_login_email', { p_username: sanitized })
  if (error || typeof data !== 'string') return null
  const email = data.trim().toLowerCase()
  return LOGIN_EMAIL_RE.test(email) ? email : null
}

/** Login-Submit: E-Mail/Admin lokal, PC-Namen über Lookup zur Auth-E-Mail. */
export async function resolveLoginEmailForAuth(
  input: string,
  lookupUsernameEmail: UsernameEmailLookup,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const resolved = resolveLoginEmail(input)
  if (!resolved.ok) return resolved
  if (!isUsernameLoginResult(resolved)) {
    return { ok: true, email: resolved.email }
  }
  const email = await lookupUsernameEmail(resolved.username)
  if (!email) {
    return { ok: false, error: LOGIN_USERNAME_UNKNOWN_ERROR }
  }
  return { ok: true, email: email.trim().toLowerCase() }
}

export function shouldForcePasswordChange(input: {
  forcePasswordChange?: boolean | null
  email?: string | null
  username?: string | null
}): boolean {
  if (isBoundAdminIdentity(input)) return false
  return input.forcePasswordChange === true
}

export function shouldForceUsernameSet(input: {
  forceUsernameSet?: boolean | null
  username?: string | null
  email?: string | null
}): boolean {
  if (isBoundAdminIdentity(input)) return false
  const username = (input.username ?? '').trim()
  if (!username || isDnPlaceholderUsername(username)) return true
  return input.forceUsernameSet === true
}

/**
 * Windows/PC-Anmeldename: nur sAMAccountName, ohne Domäne.
 * `STADT\\hschwendinger` → `hschwendinger`. Kleinbuchstaben für USERNAME_RE.
 */
export function sanitizePcUsername(input: string): string {
  const trimmed = input.trim()
  const withoutDomain = trimmed.includes('\\') ? (trimmed.split('\\').pop() ?? '') : trimmed
  return withoutDomain.trim().toLowerCase()
}

/** Gleiche Budget-Entscheidung wie submit_cart() in der Datenbank. */
export function decideSubmitStatus(used: number, cart: number, total: number): 'approved' | 'pending_approval' | null {
  if (cart === 0) return null
  return used + cart > total ? 'pending_approval' : 'approved'
}

export function previousOrderStatus(status: OrderStatus, needsTailoring: boolean): OrderStatus | null {
  switch (status) {
    case 'ordered_supplier':
      return 'approved'
    case 'at_tailor':
      return 'ordered_supplier'
    case 'ready_for_issue':
      return needsTailoring ? 'at_tailor' : 'ordered_supplier'
    case 'partially_issued':
    case 'issued':
      return 'ready_for_issue'
    case 'cancelled':
      return 'approved'
    default:
      return null
  }
}

export function nextIssueStatus(quantityIssued: number, available: number): 'partially_issued' | 'issued' {
  return quantityIssued < available ? 'partially_issued' : 'issued'
}

export function receivedNextStatus(needsTailoring: boolean): 'at_tailor' | 'ready_for_issue' {
  return needsTailoring ? 'at_tailor' : 'ready_for_issue'
}

/** Persönliches Passwort nach Erstlogin (ChangePasswordModal): 8+ / Zahl / Großbuchstabe. */
export function isValidPersonalPassword(pw: string): boolean {
  return pw.length >= 8 && /[0-9]/.test(pw) && /[A-Z]/.test(pw)
}

/** Alias — dasselbe wie isValidPersonalPassword (nicht das einfache Startpasswort). */
export function isValidInitialPassword(pw: string): boolean {
  return isValidPersonalPassword(pw)
}

export function filterAssignableRoles(callerRoles: string[], requested: string[]): string[] {
  const isAdmin = callerRoles.includes('admin')
  const isGenehmiger = isAdmin || callerRoles.includes('genehmiger') || callerRoles.includes('approver')
  const isSachbearbeiter = isAdmin || callerRoles.includes('sachbearbeiter')
  const out = requested.filter((r) => {
    if (r === 'admin') return isAdmin
    if (r === 'genehmiger') return isGenehmiger
    if (r === 'sachbearbeiter') return isSachbearbeiter || isGenehmiger
    return true
  })
  return out.length > 0 ? out : ['user']
}

/** Anlegen: Sachbearbeiter und Genehmiger. Admin bleibt alle Bereiche. */
export function canCreateUsers(callerRoles: string[]): boolean {
  return (
    callerRoles.includes('admin') ||
    callerRoles.includes('sachbearbeiter') ||
    callerRoles.includes('genehmiger') ||
    callerRoles.includes('approver')
  )
}

/** Entfernen = deaktivieren (active=false). Nur Genehmiger; Admin bleibt alle Bereiche. */
export function canDeactivateUsers(callerRoles: string[]): boolean {
  return (
    callerRoles.includes('admin') ||
    callerRoles.includes('genehmiger') ||
    callerRoles.includes('approver')
  )
}

/** Startpasswort setzen/zurücksetzen: Admin und Genehmiger, nicht Sachbearbeiter allein. */
export function canResetUserPassword(callerRoles: string[]): boolean {
  return canDeactivateUsers(callerRoles)
}

/** Portal-Benutzerverwaltung: Admin oder Bekleidungs-Genehmiger. */
export function canAccessPortalBenutzer(callerRoles: string[]): boolean {
  return (
    callerRoles.includes('admin') ||
    callerRoles.includes('genehmiger') ||
    callerRoles.includes('approver')
  )
}
