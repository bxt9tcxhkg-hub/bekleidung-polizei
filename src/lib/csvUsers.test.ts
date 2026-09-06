import { describe, it, expect } from 'vitest'
import { parseCsvUsers, parseImportUsers, rowToUser, splitCsvLine } from './csvUsers'

describe('splitCsvLine', () => {
  it('trennt Semikolon-Felder', () => {
    expect(splitCsvLine('a;b;c', ';')).toEqual(['a', 'b', 'c'])
  })

  it('respektiert Anführungszeichen mit Semikolon im Feld', () => {
    expect(splitCsvLine('"Feld;mit;Trennzeichen";rest', ';')).toEqual(['Feld;mit;Trennzeichen', 'rest'])
  })

  it('entscape doppelte Anführungszeichen', () => {
    expect(splitCsvLine('"sag ""hallo""";x', ';')).toEqual(['sag "hallo"', 'x'])
  })
})

describe('parseCsvUsers / rowToUser', () => {
  const csv = `name;benutzername;dienstnummer;organisation;rollen
Max Mustermann;mmustermann;1234;Stadtpolizei;user
Maria Muster;mmuster;5678;Parkaufsicht;user|genehmiger
`

  it('parst die Dokumentations-Vorlage', () => {
    const users = parseImportUsers(csv)
    expect(users).toHaveLength(2)
    expect(users[0]).toMatchObject({
      name: 'Max Mustermann',
      username: 'mmustermann',
      dienstnummer: '1234',
      organisation: 'Stadtpolizei',
      roles: ['user'],
    })
    expect(users[1].organisation).toBe('Parkaufsicht')
    expect(users[1].roles).toEqual(['user', 'genehmiger'])
  })

  it('liefert [] bei zu wenigen Zeilen', () => {
    expect(parseCsvUsers('name;benutzername')).toEqual([])
  })

  it('ignoriert Zeilen ohne Name/Benutzername', () => {
    expect(rowToUser({ name: '', benutzername: 'x' })).toBeNull()
    expect(rowToUser({ name: 'A', username: 'a' })?.username).toBe('a')
  })

  it('erzeugt aus Vorname/Nachname/DN den Platzhalter-Login dn{DN}', () => {
    const user = rowToUser({ vorname: 'Stefanie', nachname: 'Albrecht', dienstnummer: '32' })
    expect(user).toMatchObject({
      name: 'Stefanie Albrecht',
      username: 'dn32',
      dienstnummer: '32',
      organisation: 'Stadtpolizei',
      roles: ['user', 'sachbearbeiter'],
      gender: 'female',
    })
  })

  it('setzt ET-Offizierszeilen immer auf Stadtpolizei, auch bei Parkaufsicht-Spalte', () => {
    const user = rowToUser({
      vorname: 'Hans-Peter',
      nachname: 'Schwendinger',
      dienstnummer: '1',
      organisation: 'Parkaufsicht',
    })
    expect(user?.organisation).toBe('Stadtpolizei')
    expect(user?.username).toBe('dn1')
  })

  it('leitet Parkaufsicht nicht aus park im Benutzernamen ab', () => {
    const user = rowToUser({ name: 'Parker Test', benutzername: 'parkert', dienstnummer: '99' })
    expect(user?.organisation).toBe('Stadtpolizei')
  })
})
