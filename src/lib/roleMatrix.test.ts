import { describe, expect, it } from 'vitest'
import {
  MATTHIAS_BEKLEIDUNG_SB,
  MATTHIAS_CANDIDATES,
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

  it('sperrt nur Schwendinger, Albrecht und Petternel; Matthias bleibt Parameter', () => {
    expect(MATTHIAS_BEKLEIDUNG_SB).toBeNull()
    expect(MATTHIAS_CANDIDATES.fenkart_7.dienstnummer).toBe('7')
    expect(MATTHIAS_CANDIDATES.wiesner_16.dienstnummer).toBe('16')
    expect(matchRoleMatrixStaff({ dienstnummer: '1' })?.kind).toBe('genehmiger')
    expect(matchRoleMatrixStaff({ name: 'Stefanie Albrecht', dienstnummer: '32' })?.bekleidungRoles)
      .toEqual(['user', 'sachbearbeiter'])
    expect(matchRoleMatrixStaff({ name: 'Heinz Petternel', dienstnummer: '18' })?.einsatzMtRole)
      .toBe('sachbearbeiter')
    expect(matchRoleMatrixStaff({ name: 'Fenkart Matthias', dienstnummer: '7' })).toBeNull()
    expect(matchRoleMatrixStaff({ name: 'Wiesner', dienstnummer: '16' })).toBeNull()
  })

  it('setzt Matthias nur wenn der Owner-Parameter gesetzt ist', () => {
    expect(matchRoleMatrixStaff({ dienstnummer: '7' }, 'fenkart_7')?.kind).toBe('bekleidung_sb')
    expect(matchRoleMatrixStaff({ dienstnummer: '16' }, 'fenkart_7')).toBeNull()
    expect(matchRoleMatrixStaff({ dienstnummer: '16' }, 'wiesner_16')?.kind).toBe('bekleidung_sb')
    expect(matchRoleMatrixStaff({ dienstnummer: '7' }, 'wiesner_16')).toBeNull()
  })

  it('lässt vorhandene Admins unverändert und setzt übrige auf Benutzer', () => {
    expect(isProtectedAdmin({ roles: ['admin'] })).toBe(true)
    expect(isProtectedAdmin({ roles: ['user'] })).toBe(false)
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
    expect(fenkart.bekleidungRoles).toEqual(['user'])
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
