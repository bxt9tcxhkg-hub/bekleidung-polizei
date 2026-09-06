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
    expect(USERS_SEED.every(row => row.organisation === 'Stadtpolizei')).toBe(true)
  })

  it('erzwingt Stadtpolizei auch wenn die JSON-Zeile Parkaufsicht setzt', () => {
    const parsed = parseUsersSeed({
      officers: [{
        nachname: 'Test',
        vorname: 'Anna',
        dienstnummer: '99',
        organisation: 'Parkaufsicht',
        bekleidung: 'user',
        einsatz_mt: 'user',
      }],
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.file.officers[0].organisation).toBe('Stadtpolizei')
    }
  })

  it('lehnt unvollständige JSON-Zeilen ab', () => {
    expect(parseUsersSeed({ officers: [{ nachname: 'X' }] }).ok).toBe(false)
    expect(parseUsersSeed({ officers: [] }).ok).toBe(true)
  })
})
