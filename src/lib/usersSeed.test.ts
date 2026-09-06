import { describe, expect, it } from 'vitest'
import { USERS_SEED, bekleidungRolesFromSeed, findUserSeedByDienstnummer, parseUsersSeed } from './usersSeed'

describe('users-seed', () => {
  it('enthält die festgelegten Stab-Rollen und keine erfundenen Extra-Namen', () => {
    expect(USERS_SEED.map(row => `${row.dienstnummer}:${row.bekleidung}:${row.einsatz_mt}`)).toEqual([
      '1:genehmiger:user',
      '7:sachbearbeiter:user',
      '18:user:sachbearbeiter',
      '32:sachbearbeiter:user',
      '37:admin:admin',
    ])
    expect(findUserSeedByDienstnummer('07')?.nachname).toBe('Fenkart')
    expect(bekleidungRolesFromSeed('sachbearbeiter')).toEqual(['user', 'sachbearbeiter'])
  })

  it('lehnt unvollständige JSON-Zeilen ab', () => {
    expect(parseUsersSeed({ officers: [{ nachname: 'X' }] }).ok).toBe(false)
    expect(parseUsersSeed({ officers: [] }).ok).toBe(true)
  })
})
