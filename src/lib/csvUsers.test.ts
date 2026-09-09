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
      email: 'max.mustermann@dornbirn.at',
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

  it('ignoriert Zeilen ohne Name', () => {
    expect(rowToUser({ name: '', benutzername: 'x' })).toBeNull()
    expect(rowToUser({ name: 'A', username: 'a' })?.username).toBe('a')
  })

  it('übernimmt keinen DN-Platzhalter als Username', () => {
    const user = rowToUser({ vorname: 'Stefanie', nachname: 'Albrecht', dienstnummer: '32', benutzername: 'dn32' })
    expect(user?.email).toBe('stefanie.albrecht@dornbirn.at')
    expect(user?.username).toBeNull()
  })

  it('erzeugt aus Vorname/Nachname die Login-E-Mail @dornbirn.at', () => {
    const user = rowToUser({ vorname: 'Stefanie', nachname: 'Albrecht', dienstnummer: '32' })
    expect(user).toMatchObject({
      name: 'Stefanie Albrecht',
      email: 'stefanie.albrecht@dornbirn.at',
      username: null,
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
    expect(user?.email).toBe('hans-peter.schwendinger@dornbirn.at')
    expect(user?.username).toBeNull()
  })

  it('setzt Parkaufsicht-Seedzeilen auf Parkaufsicht, auch ohne Org-Spalte', () => {
    const user = rowToUser({ vorname: 'Irmgard', nachname: 'Fässler', dienstnummer: '70' })
    expect(user).toMatchObject({
      email: 'irmgard.faessler@dornbirn.at',
      username: null,
      organisation: 'Parkaufsicht',
      roles: ['user'],
      gender: 'female',
    })
  })

  it('setzt Feurstein Martin / DN 3 auf martin.feurstein2@dornbirn.at', () => {
    const user = rowToUser({ vorname: 'Martin', nachname: 'Feurstein', dienstnummer: '3' })
    expect(user?.email).toBe('martin.feurstein2@dornbirn.at')
    expect(user?.username).toBeNull()
  })

  it('leitet Parkaufsicht nicht aus park im Benutzernamen ab', () => {
    const user = rowToUser({ name: 'Parker Test', benutzername: 'parkert', dienstnummer: '99' })
    expect(user?.organisation).toBe('Stadtpolizei')
  })

  it('übernimmt Verwaltung als eigene Organisation', () => {
    const user = rowToUser({ name: 'Vera Verwaltung', benutzername: 'vverwaltung', dienstnummer: '999', organisation: 'Verwaltung' })
    expect(user?.organisation).toBe('Verwaltung')
  })
})
