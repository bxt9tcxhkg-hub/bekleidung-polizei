import { describe, expect, it } from 'vitest'
import {
  isProtectedAdmin,
  matchRoleMatrixStaff,
  normalizeDienstnummer,
  planRoleMatrixAssignment,
  roleMatrixStaff,
} from './roleMatrix'

describe('Rollenmatrix aus users-seed', () => {
  it('normalisiert Dienstnummern ohne führende Nullen', () => {
    expect(normalizeDienstnummer('07')).toBe('7')
    expect(normalizeDienstnummer(' 32 ')).toBe('32')
    expect(normalizeDienstnummer('')).toBe('')
  })

  it('nimmt Fenkart DN 7 als Bekleidung-SB und die übrigen Stab-Rollen aus dem Seed', () => {
    expect(matchRoleMatrixStaff({ dienstnummer: '1' })?.kind).toBe('genehmiger')
    expect(matchRoleMatrixStaff({ dienstnummer: '7' })?.kind).toBe('bekleidung_sb')
    expect(matchRoleMatrixStaff({ name: 'Stefanie Albrecht', dienstnummer: '32' })?.bekleidungRoles)
      .toEqual(['user', 'sachbearbeiter'])
    expect(matchRoleMatrixStaff({ name: 'Heinz Petternel', dienstnummer: '18' })?.einsatzMtRole)
      .toBe('sachbearbeiter')
    expect(roleMatrixStaff().some(row => row.dienstnummer === '7')).toBe(true)
    expect(matchRoleMatrixStaff({ dienstnummer: '70', name: 'Irmgard Fässler' })).toBeNull()
  })

  it('lässt vorhandene Admins unverändert und setzt Unbekannte auf Benutzer', () => {
    expect(isProtectedAdmin({ roles: ['admin'] })).toBe(true)
    const admin = planRoleMatrixAssignment({
      id: 'a',
      name: 'Muhammet Soyucok',
      dienstnummer: '37',
      roles: ['admin'],
      einsatzMtRole: 'admin',
    })
    expect(admin.skipped).toBe(true)
    expect(admin.bekleidungRoles).toContain('admin')

    const fenkart = planRoleMatrixAssignment({
      id: 'f',
      name: 'Fenkart Matthias',
      dienstnummer: '7',
      roles: ['user'],
    })
    expect(fenkart.bekleidungRoles).toEqual(['user', 'sachbearbeiter'])

    const other = planRoleMatrixAssignment({
      id: 'o',
      name: 'Max Muster',
      dienstnummer: '99',
      roles: ['sachbearbeiter'],
    })
    expect(other.bekleidungRoles).toEqual(['user'])
    expect(other.einsatzMtRole).toBe('user')
  })
})
