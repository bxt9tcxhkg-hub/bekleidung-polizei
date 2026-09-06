import { describe, expect, it } from 'vitest'
import {
  ROLE_MATRIX_NOT_BEKLEIDUNG_SB,
  isProtectedAdmin,
  matchRoleMatrixStaff,
  normalizeDienstnummer,
  planRoleMatrixAssignment,
} from './roleMatrix'

describe('Rollenmatrix', () => {
  it('normalisiert Dienstnummern ohne führende Nullen', () => {
    expect(normalizeDienstnummer('07')).toBe('7')
    expect(normalizeDienstnummer(' 32 ')).toBe('32')
    expect(normalizeDienstnummer('')).toBe('')
  })

  it('ordnet Stab-Rollen den bestätigten Personen zu', () => {
    expect(matchRoleMatrixStaff({ dienstnummer: '1' })?.kind).toBe('genehmiger')
    expect(matchRoleMatrixStaff({ name: 'Fenkart Matthias', dienstnummer: '7' })?.kind).toBe('bekleidung_sb')
    expect(matchRoleMatrixStaff({ name: 'Stefanie Albrecht', dienstnummer: '32' })?.bekleidungRoles)
      .toEqual(['user', 'sachbearbeiter'])
    expect(matchRoleMatrixStaff({ name: 'Heinz Petternel', dienstnummer: '18' })?.einsatzMtRole)
      .toBe('sachbearbeiter')
    expect(ROLE_MATRIX_NOT_BEKLEIDUNG_SB).toContain('Wiesner')
  })

  it('stuft Wiesner nicht als Bekleidung-SB ein, wenn DN fehlt', () => {
    expect(matchRoleMatrixStaff({ name: 'Wiesner Matthias' })).toBeNull()
  })

  it('lässt Admin Soyucok unverändert und setzt übrige auf Benutzer', () => {
    expect(isProtectedAdmin({ dienstnummer: '37', roles: ['admin'] })).toBe(true)
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
    expect(fenkart.einsatzMtRole).toBe('user')

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
