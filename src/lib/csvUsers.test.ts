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
      email: 'Max.Mustermann@dornbirn.at',
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

  it('erzeugt aus Vorname/Nachname die Login-E-Mail @dornbirn.at', () => {
    const user = rowToUser({ vorname: 'Stefanie', nachname: 'Albrecht', dienstnummer: '32' })
    expect(user).toMatchObject({
      name: 'Stefanie Albrecht',
      email: 'Stefanie.Albrecht@dornbirn.at',
      username: 'stefanie.albrecht',
      dienstnummer: '32',
      organisation: 'Stadtpolizei',
      roles: ['user', 'sachbearbeiter'],
      gender: 'female',
    })
  })

  it('setzt ET-Offizierszeilen aus der Seed immer auf Stadtpolizei', () => {
    const user = rowToUser({
      vorname: 'Hans-Peter',
      nachname: 'Schwendinger',
      dienstnummer: '1',
      organisation: 'Parkaufsicht',
    })
    expect(user?.organisation).toBe('Stadtpolizei')
    expect(user?.email).toBe('Hans-Peter.Schwendinger@dornbirn.at')
    expect(user?.username).toBe('hans-peter.schwendinger')
  })

  it('setzt Parkaufsicht-Seedzeilen auf Parkaufsicht, auch ohne Org-Spalte', () => {
    const user = rowToUser({ vorname: 'Irmgard', nachname: 'Fässler', dienstnummer: '70' })
    expect(user).toMatchObject({
      email: 'Irmgard.Faessler@dornbirn.at',
      username: 'irmgard.faessler',
      organisation: 'Parkaufsicht',
      roles: ['user'],
      gender: 'female',
    })
  })

  it('setzt Feurstein Martin / DN 3 auf Martin.Feurstein2@dornbirn.at', () => {
    const user = rowToUser({ vorname: 'Martin', nachname: 'Feurstein', dienstnummer: '3' })
    expect(user?.email).toBe('Martin.Feurstein2@dornbirn.at')
    expect(user?.username).toBe('martin.feurstein2')
  })

  it('leitet Parkaufsicht nicht aus park im Benutzernamen ab', () => {
    const user = rowToUser({ name: 'Parker Test', benutzername: 'parkert', dienstnummer: '99' })
    expect(user?.organisation).toBe('Stadtpolizei')
  })
})
