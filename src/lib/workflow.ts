import type { OrderStatus } from './types'

export const AUTH_EMAIL_DOMAIN = 'dornbirn.at'
/** @deprecated Alias — Login-Domain ist dornbirn.at. */
export const LOCAL_AUTH_DOMAIN = AUTH_EMAIL_DOMAIN
export const USERNAME_RE = /^[a-z0-9._-]+$/
export const DN_PLACEHOLDER_USERNAME_RE = /^dn[0-9]+$/i

export function isDnPlaceholderUsername(value: string | null | undefined): boolean {
  return DN_PLACEHOLDER_USERNAME_RE.test((value ?? '').trim())
}

/** Login-E-Mail: volle Adresse bleibt, sonst Local-Part @dornbirn.at. Bestehende Admins mit voller E-Mail (auch anderer Domain). */
export function loginEmailFromInput(input: string): string {
  const trimmed = input.trim()
  return trimmed.includes('@') ? trimmed : `${trimmed.toLowerCase()}@${AUTH_EMAIL_DOMAIN}`
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
