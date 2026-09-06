/**
 * Rollen kommen aus users-seed.json (Quelle der Wahrheit).
 * Muhammet Soyucok (DN 37) bleibt Admin, wenn er bereits Admin ist.
 */

import {
  bekleidungRolesFromProfiles,
  parseEinsatzMtRole,
  type EinsatzMtRole,
} from './portalEntitlements'
import {
  USERS_SEED,
  bekleidungRolesFromSeed,
  type UserSeedOfficer,
} from './usersSeed'

export type RoleMatrixStaffKind = 'genehmiger' | 'bekleidung_sb' | 'einsatz_sb' | 'admin'

export type RoleMatrixStaff = {
  names: readonly string[]
  dienstnummer: string
  kind: RoleMatrixStaffKind
  bekleidungRoles: readonly string[]
  einsatzMtRole: EinsatzMtRole
}

export const DEFAULT_OFFICER_BEKLEIDUNG_ROLES = ['user'] as const
export const DEFAULT_OFFICER_EINSATZ_MT_ROLE: EinsatzMtRole = 'user'

export function normalizeDienstnummer(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? ''
  if (!trimmed) return ''
  const stripped = trimmed.replace(/^0+/, '')
  return stripped || '0'
}

function staffKind(row: UserSeedOfficer): RoleMatrixStaffKind {
  if (row.bekleidung === 'admin' || row.einsatz_mt === 'admin') return 'admin'
  if (row.bekleidung === 'genehmiger') return 'genehmiger'
  if (row.bekleidung === 'sachbearbeiter') return 'bekleidung_sb'
  if (row.einsatz_mt === 'sachbearbeiter') return 'einsatz_sb'
  return 'bekleidung_sb'
}

export function roleMatrixStaff(): RoleMatrixStaff[] {
  return USERS_SEED
    .filter(row => row.bekleidung !== 'user' || row.einsatz_mt !== 'user')
    .map(row => ({
      names: [`${row.vorname} ${row.nachname}`, `${row.nachname} ${row.vorname}`],
      dienstnummer: normalizeDienstnummer(row.dienstnummer),
      kind: staffKind(row),
      bekleidungRoles: bekleidungRolesFromSeed(row.bekleidung),
      einsatzMtRole: row.einsatz_mt,
    }))
}

export function isProtectedAdmin(profile: {
  roles?: readonly string[] | null
}): boolean {
  return Boolean(profile.roles?.includes('admin'))
}

export function matchRoleMatrixStaff(profile: {
  name?: string | null
  dienstnummer?: string | null
}): RoleMatrixStaff | null {
  const staff = roleMatrixStaff()
  const dn = normalizeDienstnummer(profile.dienstnummer)
  if (dn) {
    const byDn = staff.find(row => row.dienstnummer === dn)
    if (byDn) return byDn
  }
  const hay = (profile.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!hay) return null
  const byName = staff.filter(row => row.names.some(name => {
    const needle = name.toLowerCase()
    return hay === needle || hay.includes(needle)
  }))
  if (byName.length === 1) return byName[0]
  return null
}

export type RoleMatrixProfile = {
  id: string
  name?: string | null
  dienstnummer?: string | null
  roles?: readonly string[] | null
  einsatzMtRole?: string | null
}

export type RoleMatrixAssignment = {
  profileId: string
  bekleidungRoles: string[]
  einsatzMtRole: EinsatzMtRole
  skipped: boolean
  reason: string
}

export function planRoleMatrixAssignment(profile: RoleMatrixProfile): RoleMatrixAssignment {
  if (isProtectedAdmin(profile)) {
    const bekleidung = bekleidungRolesFromProfiles(profile.roles ?? ['admin'])
    return {
      profileId: profile.id,
      bekleidungRoles: bekleidung.includes('admin') ? bekleidung : ['admin'],
      einsatzMtRole: parseEinsatzMtRole(profile.einsatzMtRole ? [profile.einsatzMtRole] : ['admin']) ?? 'admin',
      skipped: true,
      reason: 'Admin bleibt unverändert (kein Downgrade).',
    }
  }

  const staff = matchRoleMatrixStaff(profile)
  if (staff) {
    return {
      profileId: profile.id,
      bekleidungRoles: [...staff.bekleidungRoles],
      einsatzMtRole: staff.einsatzMtRole,
      skipped: false,
      reason: `users-seed ${staff.names[0]} DN ${staff.dienstnummer}.`,
    }
  }

  return {
    profileId: profile.id,
    bekleidungRoles: [...DEFAULT_OFFICER_BEKLEIDUNG_ROLES],
    einsatzMtRole: DEFAULT_OFFICER_EINSATZ_MT_ROLE,
    skipped: false,
    reason: 'Übrige Offiziere: Benutzer (Bekleidung + Einsatzmittel).',
  }
}
