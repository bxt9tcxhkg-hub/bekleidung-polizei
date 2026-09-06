import { describe, expect, it } from 'vitest'
import {
  PARKAUFSICHT_SEED,
  STADTPOLIZEI_SEED,
  USERS_SEED,
  bekleidungRolesFromSeed,
  findUserSeedByDienstnummer,
  parseUsersSeed,
} from './usersSeed'

describe('users-seed', () => {
  it('enthält die festgelegten Stab-Rollen und keine erfundenen Extra-Namen', () => {
    expect(STADTPOLIZEI_SEED.map(row => `${row.dienstnummer}:${row.bekleidung}:${row.einsatz_mt}`)).toEqual([
      '1:genehmiger:user',
      '7:sachbearbeiter:user',
      '18:user:sachbearbeiter',
      '32:sachbearbeiter:user',
      '37:admin:admin',
    ])
    expect(findUserSeedByDienstnummer('07')?.nachname).toBe('Fenkart')
    expect(bekleidungRolesFromSeed('sachbearbeiter')).toEqual(['user', 'sachbearbeiter'])
    expect(STADTPOLIZEI_SEED.every(row => row.organisation === 'Stadtpolizei')).toBe(true)
  })

  it('nimmt die acht Parkaufsicht-Personen nur als Bekleidung-Benutzer', () => {
    expect(PARKAUFSICHT_SEED).toHaveLength(8)
    expect(PARKAUFSICHT_SEED.map(row => `${row.nachname}:${row.dienstnummer}`)).toEqual([
      'Fässler:70',
      'Fitz:90',
      'Griß:40',
      'Kalfa:75',
      'Kusche:55',
      'Mandracchia:50',
      'Ploder:65',
      'Schrotter:95',
    ])
    expect(PARKAUFSICHT_SEED.every(row => row.organisation === 'Parkaufsicht')).toBe(true)
    expect(PARKAUFSICHT_SEED.every(row => row.bekleidung === 'user')).toBe(true)
    expect(PARKAUFSICHT_SEED.every(row => row.einsatz_mt === 'user')).toBe(true)
    expect(USERS_SEED).toHaveLength(13)
  })

  it('respektiert Parkaufsicht in der JSON-Zeile und senkt keine höheren Rollen herbei', () => {
    const parsed = parseUsersSeed({
      officers: [{
        nachname: 'Fässler',
        vorname: 'Irmgard',
        dienstnummer: '70',
        organisation: 'Parkaufsicht',
        bekleidung: 'sachbearbeiter',
        einsatz_mt: 'admin',
      }],
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.file.officers[0].organisation).toBe('Parkaufsicht')
      expect(parsed.file.officers[0].bekleidung).toBe('user')
      expect(parsed.file.officers[0].einsatz_mt).toBe('user')
    }
  })

  it('lehnt unvollständige JSON-Zeilen ab', () => {
    expect(parseUsersSeed({ officers: [{ nachname: 'X' }] }).ok).toBe(false)
    expect(parseUsersSeed({ officers: [] }).ok).toBe(true)
  })
})
