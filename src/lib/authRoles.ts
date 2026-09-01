export type AppRole = 'user' | 'sachbearbeiter' | 'genehmiger' | 'admin'

export type RoleFlags = {
  isAdmin: boolean
  isSachbearbeiter: boolean
  isGenehmiger: boolean
  isStrictAdmin: boolean
}

/** Admin ist eine eigene Rolle; Admin bleibt alle Bereiche (SB- und Genehmiger-Gates). */
export function flagsFromRoles(roles: readonly string[]): RoleFlags {
  const isAdmin = roles.includes('admin')
  const isSachbearbeiter = isAdmin || roles.includes('sachbearbeiter')
  const isGenehmiger = isAdmin || roles.includes('genehmiger') || roles.includes('approver')
  return { isAdmin, isSachbearbeiter, isGenehmiger, isStrictAdmin: isAdmin }
}

export function availableRolesFromFlags(flags: RoleFlags): AppRole[] {
  const out: AppRole[] = ['user']
  if (flags.isSachbearbeiter) out.push('sachbearbeiter')
  if (flags.isGenehmiger) out.push('genehmiger')
  if (flags.isAdmin) out.push('admin')
  return out
}
