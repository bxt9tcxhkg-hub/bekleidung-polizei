import { describe, expect, it } from 'vitest'
import {
  KNOWN_OFFICER_ROSTER,
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
    expect(KNOWN_OFFICER_ROSTER).toHaveLength(5)
    expect(users.find(u => u.dienstnummer === '1')?.roles).toEqual(['user', 'genehmiger'])
    expect(users.find(u => u.dienstnummer === '32')?.roles).toEqual(['user', 'sachbearbeiter'])
    expect(users.find(u => u.dienstnummer === '18')?.einsatzMtRole).toBe('sachbearbeiter')
    expect(users.find(u => u.dienstnummer === '7')?.roles).toEqual(['user', 'sachbearbeiter'])
    expect(users.find(u => u.dienstnummer === '37')?.roles).toEqual(['admin'])
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
})
