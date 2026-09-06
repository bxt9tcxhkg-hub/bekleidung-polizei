import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  PARKAUFSICHT_SEED,
  STADTPOLIZEI_SEED,
  USERS_SEED,
  bekleidungRolesFromSeed,
  findUserSeedByDienstnummer,
  parseUsersSeed,
} from './usersSeed'

const here = dirname(fileURLToPath(import.meta.url))

describe('users-seed', () => {
  it('enthält die festgelegten Stab-Rollen und keine erfundenen Extra-Namen', () => {
    const staff = STADTPOLIZEI_SEED.filter(row => row.bekleidung !== 'user' || row.einsatz_mt !== 'user')
    expect(staff.map(row => `${row.dienstnummer}:${row.bekleidung}:${row.einsatz_mt}`)).toEqual([
      '1:genehmiger:user',
      '7:sachbearbeiter:user',
      '18:user:sachbearbeiter',
      '32:sachbearbeiter:user',
      '37:admin:admin',
    ])
    expect(findUserSeedByDienstnummer('07')?.nachname).toBe('Fenkart')
    expect(bekleidungRolesFromSeed('sachbearbeiter')).toEqual(['user', 'sachbearbeiter'])
    expect(STADTPOLIZEI_SEED.every(row => row.organisation === 'Stadtpolizei')).toBe(true)
    expect(STADTPOLIZEI_SEED).toHaveLength(34)
    expect(STADTPOLIZEI_SEED.map(row => `${row.dienstnummer}:${row.nachname}:${row.vorname}`)).toEqual([
      '1:Schwendinger:Hans-Peter',
      '2:Gisinger:Andreas',
      '3:Feurstein:Martin',
      '7:Fenkart:Matthias',
      '8:Klien:Thomas',
      '9:Greber:Elias',
      '11:Bachmann:Andreas',
      '12:Steidl:Alexander',
      '13:Einetter:Robert',
      '14:Huber:Jessica',
      '15:Kaschka:Otto',
      '16:Wiesner:Matthias',
      '17:Aydinli:Melissa',
      '18:Petternel:Heinz',
      '19:Borihan:Direnc',
      '20:Müller:Julian',
      '21:Herburger:Stefanie',
      '22:Sonderegger:Lea',
      '23:Dreher:Jeanine',
      '24:Dolliner:Sonja',
      '25:Aukenthaler:Silvano',
      '26:Bäuchl:Aaron',
      '27:Hummer:Hannes',
      '28:Ellensohn:Jörg',
      '29:Schwendinger:Dietmar',
      '30:Wibmer:David',
      '31:Schwendinger:Verona',
      '32:Albrecht:Stefanie',
      '33:Kaiser:Philipp',
      '34:Alge-Faißt:Ludwig',
      '35:Nenning:Bernhard',
      '36:Rusch:Johannes',
      '37:Soyucok:Muhammet',
      '38:Hiller:Gabriel',
    ])
    const rankAndFile = STADTPOLIZEI_SEED.filter(row => row.bekleidung === 'user' && row.einsatz_mt === 'user')
    expect(rankAndFile).toHaveLength(29)
    expect(['4', '5', '6', '10'].every(dn => !STADTPOLIZEI_SEED.some(row => row.dienstnummer === dn))).toBe(true)
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
    expect(USERS_SEED).toHaveLength(42)
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

  it('hält src/data und supabase/seed synchron', () => {
    const app = readFileSync(resolve(here, '../data/users-seed.json'), 'utf8')
    const supabase = readFileSync(resolve(here, '../../supabase/seed/users-seed.json'), 'utf8')
    expect(app).toBe(supabase)
  })
})
