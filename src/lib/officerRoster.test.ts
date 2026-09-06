import { describe, expect, it } from 'vitest'
import {
  KNOWN_OFFICER_ROSTER,
  importUsersFromSeedJson,
  isJunkRosterRow,
  knownRosterImportUsers,
  planRosterEnsure,
  rosterRowToImportUser,
  usernameFromDienstnummer,
} from './officerRoster'

describe('Offiziersliste', () => {
  it('bildet den Login aus der Dienstnummer ohne erfundene E-Mail', () => {
    expect(usernameFromDienstnummer('07')).toBe('dn7')
    expect(usernameFromDienstnummer('32')).toBe('dn32')
  })

  it('verwirft Kopf- und Summenzeilen', () => {
    expect(isJunkRosterRow({ vorname: 'Vorname', nachname: 'Nachname', dienstnummer: '1' })).toBe(true)
    expect(isJunkRosterRow({ name: 'Summe', dienstnummer: '10' })).toBe(true)
    expect(isJunkRosterRow({ vorname: 'Heinz', nachname: 'Petternel', dienstnummer: '18' })).toBe(false)
    expect(isJunkRosterRow({ vorname: 'X', nachname: 'Y', dienstnummer: '' })).toBe(true)
  })

  it('legt bekannte Offiziere als Benutzer an, Stab nur wo Owner feststeht', () => {
    const users = knownRosterImportUsers()
    expect(KNOWN_OFFICER_ROSTER).toHaveLength(13)
    expect(users.find(u => u.dienstnummer === '1')?.roles).toEqual(['user', 'genehmiger'])
    expect(users.find(u => u.dienstnummer === '32')?.roles).toEqual(['user', 'sachbearbeiter'])
    expect(users.find(u => u.dienstnummer === '18')?.einsatzMtRole).toBe('sachbearbeiter')
    expect(users.find(u => u.dienstnummer === '7')?.roles).toEqual(['user', 'sachbearbeiter'])
    expect(users.find(u => u.dienstnummer === '37')?.roles).toEqual(['admin'])
    expect(users.filter(u => u.organisation === 'Stadtpolizei')).toHaveLength(5)
    const park = users.filter(u => u.organisation === 'Parkaufsicht')
    expect(park).toHaveLength(8)
    expect(park.every(u => u.roles.every(role => role === 'user'))).toBe(true)
    expect(park.every(u => u.einsatzMtRole === 'user')).toBe(true)
    expect(users.find(u => u.dienstnummer === '70')?.gender).toBe('female')
    expect(users.find(u => u.dienstnummer === '65')?.gender).toBe('female')
  })

  it('überspringt vorhandene Dienstnummern und plant nur neue', () => {
    const fenkart = rosterRowToImportUser({
      vorname: 'Matthias',
      nachname: 'Fenkart',
      dienstnummer: '7',
    })
    expect(fenkart?.username).toBe('dn7')
    const plan = planRosterEnsure(knownRosterImportUsers(), [
      { id: 'x', name: 'Fenkart Matthias', username: 'dn7', dienstnummer: '7' },
    ])
    expect(plan.already.map(u => u.dienstnummer)).toContain('7')
    expect(plan.create.map(u => u.dienstnummer)).not.toContain('7')
    expect(plan.create.map(u => u.username)).toContain('dn1')
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
