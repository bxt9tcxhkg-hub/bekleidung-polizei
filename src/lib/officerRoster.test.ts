import { describe, expect, it } from 'vitest'
import {
  KNOWN_OFFICER_ROSTER,
  importUsersFromSeedJson,
  isJunkRosterRow,
  knownRosterImportUsers,
  planRosterEnsure,
  rosterRowToImportUser,
} from './officerRoster'

describe('Offiziersliste', () => {
  it('bildet den Login aus Vorname.Nachname@dornbirn.at, Username bleibt leer', () => {
    expect(rosterRowToImportUser({
      vorname: 'Hans-Peter',
      nachname: 'Schwendinger',
      dienstnummer: '1',
    })).toMatchObject({
      email: 'Hans-Peter.Schwendinger@dornbirn.at',
      username: null,
    })
    expect(rosterRowToImportUser({
      vorname: 'Martin',
      nachname: 'Feurstein',
      dienstnummer: '3',
    })?.email).toBe('Martin.Feurstein2@dornbirn.at')
  })

  it('verwirft Kopf- und Summenzeilen', () => {
    expect(isJunkRosterRow({ vorname: 'Vorname', nachname: 'Nachname', dienstnummer: '1' })).toBe(true)
    expect(isJunkRosterRow({ name: 'Summe', dienstnummer: '10' })).toBe(true)
    expect(isJunkRosterRow({ vorname: 'Heinz', nachname: 'Petternel', dienstnummer: '18' })).toBe(false)
    expect(isJunkRosterRow({ vorname: 'X', nachname: 'Y', dienstnummer: '' })).toBe(true)
  })

  it('legt bekannte Offiziere als Benutzer an, Stab nur wo Owner feststeht', () => {
    const users = knownRosterImportUsers()
    expect(KNOWN_OFFICER_ROSTER).toHaveLength(42)
    expect(users.find(u => u.dienstnummer === '1')?.roles).toEqual(['user', 'genehmiger'])
    expect(users.find(u => u.dienstnummer === '32')?.roles).toEqual(['user', 'sachbearbeiter'])
    expect(users.find(u => u.dienstnummer === '18')?.einsatzMtRole).toBe('sachbearbeiter')
    expect(users.find(u => u.dienstnummer === '7')?.roles).toEqual(['user', 'sachbearbeiter'])
    expect(users.find(u => u.dienstnummer === '37')?.roles).toEqual(['admin'])
    const stadt = users.filter(u => u.organisation === 'Stadtpolizei')
    expect(stadt).toHaveLength(34)
    expect(stadt.find(u => u.dienstnummer === '2')).toMatchObject({
      name: 'Andreas Gisinger',
      email: 'Andreas.Gisinger@dornbirn.at',
      username: null,
      roles: ['user'],
      einsatzMtRole: 'user',
    })
    expect(stadt.filter(u => u.roles.length === 1 && u.roles[0] === 'user' && u.einsatzMtRole === 'user')).toHaveLength(29)
    const park = users.filter(u => u.organisation === 'Parkaufsicht')
    expect(park).toHaveLength(8)
    expect(park.every(u => u.roles.every(role => role === 'user'))).toBe(true)
    expect(park.every(u => u.einsatzMtRole === 'user')).toBe(true)
    expect(users.find(u => u.dienstnummer === '70')?.gender).toBe('female')
    expect(users.find(u => u.dienstnummer === '65')?.gender).toBe('female')
    expect(users.find(u => u.dienstnummer === '14')?.gender).toBe('female')
    expect(users.find(u => u.dienstnummer === '17')?.gender).toBe('female')
    expect(users.find(u => u.dienstnummer === '22')?.gender).toBe('female')
    expect(users.find(u => u.dienstnummer === '23')?.gender).toBe('female')
    expect(users.find(u => u.dienstnummer === '24')?.gender).toBe('female')
    expect(users.find(u => u.dienstnummer === '31')?.gender).toBe('female')
    expect(users.find(u => u.dienstnummer === '21')?.gender).toBe('female')
    expect(users.every(u => u.username == null)).toBe(true)
    expect(users.every(u => !/^dn[0-9]+$/i.test(u.email))).toBe(true)
  })

  it('überspringt vorhandene Dienstnummern und plant nur neue', () => {
    const fenkart = rosterRowToImportUser({
      vorname: 'Matthias',
      nachname: 'Fenkart',
      dienstnummer: '7',
    })
    expect(fenkart?.username).toBeNull()
    expect(fenkart?.email).toBe('Matthias.Fenkart@dornbirn.at')
    const plan = planRosterEnsure(knownRosterImportUsers(), [
      { id: 'x', name: 'Fenkart Matthias', username: null, dienstnummer: '7' },
    ])
    expect(plan.already.map(u => u.dienstnummer)).toContain('7')
    expect(plan.create.map(u => u.dienstnummer)).not.toContain('7')
    expect(plan.create.map(u => u.email)).toContain('Hans-Peter.Schwendinger@dornbirn.at')
  })

  it('legt Parkaufsicht aus users-seed.json nur als Benutzer an', () => {
    const parsed = importUsersFromSeedJson(JSON.stringify({
      officers: [{
        nachname: 'Fässler',
        vorname: 'Irmgard',
        dienstnummer: '70',
        organisation: 'Parkaufsicht',
        bekleidung: 'genehmiger',
        einsatz_mt: 'sachbearbeiter',
      }],
    }))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.users).toHaveLength(1)
      expect(parsed.users[0].organisation).toBe('Parkaufsicht')
      expect(parsed.users[0].roles).toEqual(['user'])
      expect(parsed.users[0].einsatzMtRole).toBe('user')
    }
  })
})
