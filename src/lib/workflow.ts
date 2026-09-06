import type { OrderStatus } from './types'

export const LOCAL_AUTH_DOMAIN = 'stadtpolizei-dornbirn.local'
export const USERNAME_RE = /^[a-z0-9._-]+$/

/** Baut die Login-E-Mail wie Login.tsx: Benutzername → Platzhalter-Adresse. */
export function loginEmailFromInput(input: string): string {
  const trimmed = input.trim()
  return trimmed.includes('@') ? trimmed : `${trimmed.toLowerCase()}@${LOCAL_AUTH_DOMAIN}`
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

export function isValidInitialPassword(pw: string): boolean {
  return pw.length >= 8 && /[0-9]/.test(pw) && /[A-Z]/.test(pw)
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

/** Portal-Benutzerverwaltung: Admin oder Bekleidungs-Genehmiger. */
export function canAccessPortalBenutzer(callerRoles: string[]): boolean {
  return (
    callerRoles.includes('admin') ||
    callerRoles.includes('genehmiger') ||
    callerRoles.includes('approver')
  )
}
