import { describe, expect, it } from 'vitest'
import { dienstplanGruppe, istAdminProfil, istAutomatischEinteilbar, kurznamen, sortiereNachDienstplanGruppe } from './dienstplanRoster'

describe('dienstplanGruppe', () => {
  it('erkennt Kommando anhand der Dienstnummer', () => {
    expect(dienstplanGruppe('1')).toBe('kommando') // Schwendinger Hans-Peter
    expect(dienstplanGruppe('2')).toBe('kommando') // Gisinger Andreas
    expect(dienstplanGruppe('3')).toBe('kommando') // Feurstein Martin
  })

  it('erkennt Dienstführung anhand der Dienstnummer', () => {
    expect(dienstplanGruppe('25')).toBe('dienstfuehrung') // Aukenthaler
    expect(dienstplanGruppe('27')).toBe('dienstfuehrung') // Hummer
    expect(dienstplanGruppe('28')).toBe('dienstfuehrung') // Ellensohn
    expect(dienstplanGruppe('35')).toBe('dienstfuehrung') // Nenning
  })

  it('ordnet alle anderen der Gruppe "einsatz" zu', () => {
    expect(dienstplanGruppe('29')).toBe('einsatz') // Schwendinger Dietmar - anderer Vorname, nicht Kommando
    expect(dienstplanGruppe(null)).toBe('einsatz')
  })
})

describe('istAutomatischEinteilbar', () => {
  it('ist false für Kommando', () => {
    expect(istAutomatischEinteilbar('1')).toBe(false)
  })

  it('ist true für Dienstführung und alle übrigen', () => {
    expect(istAutomatischEinteilbar('25')).toBe(true)
    expect(istAutomatischEinteilbar('99')).toBe(true)
  })
})

describe('sortiereNachDienstplanGruppe', () => {
  it('stellt Kommando voran, dann Dienstführung, dann den Rest - je Block alphabetisch', () => {
    const personen = [
      { name: 'Zerbst', dienstnummer: '99' },
      { name: 'Nenning', dienstnummer: '35' },
      { name: 'Feurstein', dienstnummer: '3' },
      { name: 'Aukenthaler', dienstnummer: '25' },
      { name: 'Gisinger', dienstnummer: '2' },
      { name: 'Anders', dienstnummer: '50' },
    ]
    const sortiert = sortiereNachDienstplanGruppe(personen).map(person => person.name)
    expect(sortiert).toEqual(['Feurstein', 'Gisinger', 'Aukenthaler', 'Nenning', 'Anders', 'Zerbst'])
  })

  it('verändert die übergebene Liste nicht', () => {
    const personen = [{ name: 'B', dienstnummer: null }, { name: 'A', dienstnummer: null }]
    const original = [...personen]
    sortiereNachDienstplanGruppe(personen)
    expect(personen).toEqual(original)
  })
})

describe('istAdminProfil', () => {
  it('erkennt admin in der roles-Liste', () => {
    expect(istAdminProfil(['admin'])).toBe(true)
    expect(istAdminProfil(['user', 'admin'])).toBe(true)
  })

  it('ist false ohne admin-Rolle', () => {
    expect(istAdminProfil(['user'])).toBe(false)
    expect(istAdminProfil([])).toBe(false)
    expect(istAdminProfil(null)).toBe(false)
    expect(istAdminProfil(undefined)).toBe(false)
  })
})

describe('kurznamen', () => {
  it('zeigt nur den Nachnamen, wenn er eindeutig ist', () => {
    const personen = [
      { id: 'a', name: 'Andreas Gisinger' },
      { id: 'b', name: 'Bernhard Nenning' },
    ]
    const ergebnis = kurznamen(personen)
    expect(ergebnis.get('a')).toBe('Gisinger')
    expect(ergebnis.get('b')).toBe('Nenning')
  })

  it('ergänzt bei Namensgleichheit den Anfangsbuchstaben des Vornamens', () => {
    const personen = [
      { id: 'a', name: 'Hans-Peter Schwendinger' },
      { id: 'b', name: 'Dietmar Schwendinger' },
      { id: 'c', name: 'Andreas Gisinger' },
    ]
    const ergebnis = kurznamen(personen)
    expect(ergebnis.get('a')).toBe('Schwendinger H.')
    expect(ergebnis.get('b')).toBe('Schwendinger D.')
    expect(ergebnis.get('c')).toBe('Gisinger')
  })
})
