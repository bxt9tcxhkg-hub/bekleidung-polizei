/**
 * Owner-Rollenmatrix 2026-09-06.
 * Nur diese namentlich genannten Personen bekommen Stab-Rollen.
 * Muhammet Soyucok (DN 37) bleibt Admin, wenn er Admin ist — kein Downgrade.
 * Alle übrigen vorhandenen Profile: Bekleidung Benutzer + einsatz_mt Benutzer.
 * Es werden keine Profile angelegt.
 */

import {
  bekleidungRolesFromProfiles,
  parseEinsatzMtRole,
  type EinsatzMtRole,
} from './portalEntitlements'

export type RoleMatrixStaffKind = 'genehmiger' | 'bekleidung_sb' | 'einsatz_sb' | 'admin_keep'

export type RoleMatrixStaff = {
  names: readonly string[]
  dienstnummer: string
  kind: RoleMatrixStaffKind
  bekleidungRoles: readonly string[]
  einsatzMtRole: EinsatzMtRole
}

export const ROLE_MATRIX_STAFF: readonly RoleMatrixStaff[] = [
  {
    names: ['Hans-Peter Schwendinger', 'Hans Peter Schwendinger', 'Hans Peter'],
    dienstnummer: '1',
    kind: 'genehmiger',
    bekleidungRoles: ['user', 'genehmiger'],
    einsatzMtRole: 'user',
  },
  {
    names: ['Stefanie Albrecht'],
    dienstnummer: '32',
    kind: 'bekleidung_sb',
    bekleidungRoles: ['user', 'sachbearbeiter'],
    einsatzMtRole: 'user',
  },
  {
    names: ['Fenkart Matthias', 'Matthias Fenkart'],
    dienstnummer: '7',
    kind: 'bekleidung_sb',
    bekleidungRoles: ['user', 'sachbearbeiter'],
    einsatzMtRole: 'user',
  },
  {
    names: ['Heinz Petternel'],
    dienstnummer: '18',
    kind: 'einsatz_sb',
    bekleidungRoles: ['user'],
    einsatzMtRole: 'sachbearbeiter',
  },
  {
    names: ['Muhammet Soyucok'],
    dienstnummer: '37',
    kind: 'admin_keep',
    bekleidungRoles: ['admin'],
    einsatzMtRole: 'admin',
  },
]

/** Bekleidung-SB ist Fenkart Matthias DN 7, nicht Wiesner. */
export const ROLE_MATRIX_NOT_BEKLEIDUNG_SB = ['Wiesner'] as const

export const DEFAULT_OFFICER_BEKLEIDUNG_ROLES = ['user'] as const
export const DEFAULT_OFFICER_EINSATZ_MT_ROLE: EinsatzMtRole = 'user'

export function normalizeDienstnummer(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? ''
  if (!trimmed) return ''
  const stripped = trimmed.replace(/^0+/, '')
  return stripped || '0'
}

function normalizeName(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function nameMatchesStaff(profileName: string, staff: RoleMatrixStaff): boolean {
  const hay = normalizeName(profileName)
  if (!hay) return false
  return staff.names.some(name => {
    const needle = normalizeName(name)
    return hay === needle || hay.includes(needle)
  })
}

export function isProtectedAdmin(profile: {
  name?: string | null
  dienstnummer?: string | null
  roles?: readonly string[] | null
}): boolean {
  if (profile.roles?.includes('admin')) return true
  const staff = ROLE_MATRIX_STAFF.find(row => row.kind === 'admin_keep')
  if (!staff) return false
  const dn = normalizeDienstnummer(profile.dienstnummer)
  return dn === staff.dienstnummer || nameMatchesStaff(profile.name ?? '', staff)
}

export function matchRoleMatrixStaff(profile: {
  name?: string | null
  dienstnummer?: string | null
}): RoleMatrixStaff | null {
  const dn = normalizeDienstnummer(profile.dienstnummer)
  if (dn) {
    const byDn = ROLE_MATRIX_STAFF.find(row => row.dienstnummer === dn)
    if (byDn) return byDn
  }
  const byName = ROLE_MATRIX_STAFF.filter(row => nameMatchesStaff(profile.name ?? '', row))
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
    const einsatz = parseEinsatzMtRole(profile.einsatzMtRole ? [profile.einsatzMtRole] : ['admin']) ?? 'admin'
    return {
      profileId: profile.id,
      bekleidungRoles: bekleidung.includes('admin') ? bekleidung : ['admin'],
      einsatzMtRole: einsatz === 'admin' ? 'admin' : 'admin',
      skipped: true,
      reason: 'Admin bleibt unverändert (Muhammet Soyucok DN 37).',
    }
  }

  const staff = matchRoleMatrixStaff(profile)
  if (staff && staff.kind !== 'admin_keep') {
    return {
      profileId: profile.id,
      bekleidungRoles: [...staff.bekleidungRoles],
      einsatzMtRole: staff.einsatzMtRole,
      skipped: false,
      reason: `Rollenmatrix ${staff.names[0]} DN ${staff.dienstnummer}.`,
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
