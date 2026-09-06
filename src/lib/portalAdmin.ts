/**
 * Portal-Admin ist keine Benutzerrolle für operative Listen.
 * Admin verwaltet nur (Benutzerverwaltung, Login, Audit-Log).
 */

import { flagsFromRoles } from './authRoles'
import { isBoundAdminIdentity } from './workflow'

export type PortalAdminProfile = {
  admin?: boolean | null
  roles?: readonly string[] | null
  username?: string | null
  email?: string | null
}

/** Select für Offizierslisten in Einsatzmittel & Training (ohne Admin-Spalte). */
export const OFFICER_LIST_PROFILE_SELECT =
  'id,name,dienstnummer,username,active,organisation,roles' as const

/**
 * Portal-Admin: isStrictAdmin (roles enthält admin),
 * profiles.admin === true, oder gebundenes Admin-Konto
 * (admin / admin@stadtpolizei-dornbirn.local).
 */
export function isPortalAdminProfile(profile: PortalAdminProfile | null | undefined): boolean {
  if (!profile) return false
  if (profile.admin === true) return true
  if (flagsFromRoles(profile.roles ?? []).isStrictAdmin) return true
  return isBoundAdminIdentity({
    username: profile.username,
    email: profile.email,
  })
}

export function excludeAdminsFromOfficerList<T extends PortalAdminProfile>(rows: readonly T[]): T[] {
  return rows.filter(row => !isPortalAdminProfile(row))
}
