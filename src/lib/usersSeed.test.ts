import { describe, expect, it } from 'vitest'
import {
  PARKAUFSICHT_SEED,
  STADTPOLIZEI_OFFICER_SEED,
  STADTPOLIZEI_SEED,
  USERS_SEED,
  bekleidungRolesFromSeed,
  findUserSeedByDienstnummer,
  isPolizistForRoster,
  parseSeedOfficerFlag,
  parseUsersSeed,
  seedOfficerAuthEmail,
} from './usersSeed'

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
    expect(seedOfficerAuthEmail(findUserSeedByDienstnummer('1')!)).toBe('hans-peter.schwendinger@dornbirn.at')
    expect(seedOfficerAuthEmail(findUserSeedByDienstnummer('3')!)).toBe('martin.feurstein2@dornbirn.at')
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

  it('markiert Sonja Dolliner als Nicht-Offizier, Organisation bleibt Stadtpolizei', () => {
    const sonja = findUserSeedByDienstnummer('24')
    expect(sonja).toMatchObject({
      vorname: 'Sonja',
      nachname: 'Dolliner',
      organisation: 'Stadtpolizei',
      bekleidung: 'user',
      einsatz_mt: 'user',
      officer: false,
    })
    expect(STADTPOLIZEI_OFFICER_SEED).toHaveLength(33)
    expect(STADTPOLIZEI_OFFICER_SEED.some(row => row.dienstnummer === '24')).toBe(false)
    expect(STADTPOLIZEI_SEED.filter(row => row.officer !== false)).toHaveLength(33)
    expect(STADTPOLIZEI_SEED.filter(row => row.officer === false)).toEqual([sonja])
  })

  it('liest officer: false aus der JSON-Zeile, sonst Default true', () => {
    expect(parseSeedOfficerFlag({})).toBe(true)
    expect(parseSeedOfficerFlag({ officer: true })).toBe(true)
    expect(parseSeedOfficerFlag({ officer: false })).toBe(false)
    expect(parseSeedOfficerFlag({ einsatz_roster: false })).toBe(false)
    const parsed = parseUsersSeed({
      officers: [{
        nachname: 'Dolliner',
        vorname: 'Sonja',
        dienstnummer: '24',
        organisation: 'Stadtpolizei',
        bekleidung: 'user',
        einsatz_mt: 'user',
        officer: false,
      }, {
        nachname: 'Gisinger',
        vorname: 'Andreas',
        dienstnummer: '2',
        organisation: 'Stadtpolizei',
        bekleidung: 'user',
        einsatz_mt: 'user',
      }],
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.file.officers[0].officer).toBe(false)
    expect(parsed.file.officers[0].organisation).toBe('Stadtpolizei')
    expect(parsed.file.officers[1].officer).toBe(true)
  })

  it('erkennt Polizei-Offiziere nur bei Stadtpolizei und officer !== false', () => {
    expect(isPolizistForRoster({ organisation: 'Stadtpolizei' })).toBe(true)
    expect(isPolizistForRoster({ organisation: '' })).toBe(true)
    expect(isPolizistForRoster({ organisation: 'Parkaufsicht' })).toBe(false)
    expect(isPolizistForRoster({ organisation: 'Stadtpolizei', officer: false })).toBe(false)
    expect(isPolizistForRoster({
      organisation: 'Stadtpolizei',
      name: 'Sonja Dolliner',
      dienstnummer: '24',
    })).toBe(false)
    expect(isPolizistForRoster({
      organisation: 'Stadtpolizei',
      vorname: 'Sonja',
      nachname: 'Dolliner',
    })).toBe(false)
    expect(isPolizistForRoster({
      organisation: 'Stadtpolizei',
      name: 'Andreas Gisinger',
      dienstnummer: '2',
    })).toBe(true)
    expect(isPolizistForRoster({ organisation: 'Parkaufsicht', dienstnummer: '24' })).toBe(false)
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
})
