/**
 * Owner-Rollenmatrix 2026-09-06.
 * Fest: Schwendinger Genehmiger, Albrecht Bekleidung-SB, Petternel Einsatz-SB.
 * Matthias (Fenkart DN 7 oder Wiesner DN 16) ist Owner-Parameter — solange
 * ungesetzt bekommt keiner von beiden Sachbearbeiter.
 * Muhammet Soyucok (DN 37) bleibt Admin, wenn er Admin ist — kein Downgrade.
 */

import {
  bekleidungRolesFromProfiles,
  parseEinsatzMtRole,
  type EinsatzMtRole,
} from './portalEntitlements'

export type RoleMatrixStaffKind = 'genehmiger' | 'bekleidung_sb' | 'einsatz_sb'

export type RoleMatrixStaff = {
  names: readonly string[]
  dienstnummer: string
  kind: RoleMatrixStaffKind
  bekleidungRoles: readonly string[]
  einsatzMtRole: EinsatzMtRole
}

export type MatthiasBekleidungSb = null | 'fenkart_7' | 'wiesner_16'

/** Owner entscheidet Fenkart DN 7 oder Wiesner DN 16. null = noch nicht gesetzt. */
export const MATTHIAS_BEKLEIDUNG_SB: MatthiasBekleidungSb = null

export const MATTHIAS_CANDIDATES: Record<Exclude<MatthiasBekleidungSb, null>, {
  names: readonly string[]
  dienstnummer: string
}> = {
  fenkart_7: { names: ['Fenkart Matthias', 'Matthias Fenkart'], dienstnummer: '7' },
  wiesner_16: { names: ['Wiesner'], dienstnummer: '16' },
}

export const LOCKED_ROLE_MATRIX_STAFF: readonly RoleMatrixStaff[] = [
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
    names: ['Heinz Petternel'],
    dienstnummer: '18',
    kind: 'einsatz_sb',
    bekleidungRoles: ['user'],
    einsatzMtRole: 'sachbearbeiter',
  },
]

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

function nameMatchesStaff(profileName: string, names: readonly string[]): boolean {
  const hay = normalizeName(profileName)
  if (!hay) return false
  return names.some(name => {
    const needle = normalizeName(name)
    return hay === needle || hay.includes(needle)
  })
}

export function roleMatrixStaff(
  matthias: MatthiasBekleidungSb = MATTHIAS_BEKLEIDUNG_SB,
): RoleMatrixStaff[] {
  const staff = [...LOCKED_ROLE_MATRIX_STAFF]
  if (matthias && MATTHIAS_CANDIDATES[matthias]) {
    const candidate = MATTHIAS_CANDIDATES[matthias]
    staff.push({
      names: candidate.names,
      dienstnummer: candidate.dienstnummer,
      kind: 'bekleidung_sb',
      bekleidungRoles: ['user', 'sachbearbeiter'],
      einsatzMtRole: 'user',
    })
  }
  return staff
}

export function isProtectedAdmin(profile: {
  roles?: readonly string[] | null
}): boolean {
  return Boolean(profile.roles?.includes('admin'))
}

export function matchRoleMatrixStaff(
  profile: { name?: string | null; dienstnummer?: string | null },
  matthias: MatthiasBekleidungSb = MATTHIAS_BEKLEIDUNG_SB,
): RoleMatrixStaff | null {
  const staff = roleMatrixStaff(matthias)
  const dn = normalizeDienstnummer(profile.dienstnummer)
  if (dn) {
    const byDn = staff.find(row => row.dienstnummer === dn)
    if (byDn) return byDn
  }
  const byName = staff.filter(row => nameMatchesStaff(profile.name ?? '', row.names))
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

export function planRoleMatrixAssignment(
  profile: RoleMatrixProfile,
  matthias: MatthiasBekleidungSb = MATTHIAS_BEKLEIDUNG_SB,
): RoleMatrixAssignment {
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

  const staff = matchRoleMatrixStaff(profile, matthias)
  if (staff) {
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
