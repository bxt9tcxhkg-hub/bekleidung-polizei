import { describe, it, expect } from 'vitest'
import {
  loginEmailFromInput,
  decideSubmitStatus,
  previousOrderStatus,
  nextIssueStatus,
  receivedNextStatus,
  isValidInitialPassword,
  filterAssignableRoles,
  canAccessPortalBenutzer,
  canCreateUsers,
  canDeactivateUsers,
  USERNAME_RE,
  isDnPlaceholderUsername,
  sanitizePcUsername,
} from './workflow'

describe('loginEmailFromInput', () => {
  it('hängt dornbirn.at an Local-Parts ohne @', () => {
    expect(loginEmailFromInput('mmustermann')).toBe('mmustermann@dornbirn.at')
    expect(loginEmailFromInput('  Max.User  ')).toBe('max.user@dornbirn.at')
    expect(loginEmailFromInput('Hans-Peter.Schwendinger')).toBe('hans-peter.schwendinger@dornbirn.at')
  })

  it('lässt volle E-Mail-Adressen unverändert (trim), auch bestehende Admins', () => {
    expect(loginEmailFromInput('name@beispiel.at')).toBe('name@beispiel.at')
    expect(loginEmailFromInput('Hans-Peter.Schwendinger@dornbirn.at')).toBe('Hans-Peter.Schwendinger@dornbirn.at')
    expect(loginEmailFromInput('admin@stadtpolizei-dornbirn.local')).toBe('admin@stadtpolizei-dornbirn.local')
  })
})

describe('decideSubmitStatus', () => {
  it('liefert null bei leerem Warenkorb', () => {
    expect(decideSubmitStatus(100, 0, 350)).toBeNull()
  })

  it('genehmigt wenn used + cart das Budget nicht überschreitet', () => {
    expect(decideSubmitStatus(200, 150, 350)).toBe('approved')
    expect(decideSubmitStatus(0, 350, 350)).toBe('approved')
  })

  it('fordert Freigabe wenn used + cart über dem Budget liegt', () => {
    expect(decideSubmitStatus(200, 151, 350)).toBe('pending_approval')
  })
})

describe('previousOrderStatus', () => {
  it('setzt Schneider-Aufträge von ready_for_issue auf at_tailor zurück', () => {
    expect(previousOrderStatus('ready_for_issue', true)).toBe('at_tailor')
    expect(previousOrderStatus('ready_for_issue', false)).toBe('ordered_supplier')
  })

  it('folgt der dokumentierten Kette rückwärts', () => {
    expect(previousOrderStatus('ordered_supplier', false)).toBe('approved')
    expect(previousOrderStatus('at_tailor', true)).toBe('ordered_supplier')
    expect(previousOrderStatus('issued', false)).toBe('ready_for_issue')
    expect(previousOrderStatus('partially_issued', false)).toBe('ready_for_issue')
    expect(previousOrderStatus('cancelled', false)).toBe('approved')
    expect(previousOrderStatus('pending', false)).toBeNull()
    expect(previousOrderStatus('approved', false)).toBeNull()
  })
})

describe('nextIssueStatus / receivedNextStatus', () => {
  it('unterscheidet Teil- und Vollausgabe', () => {
    expect(nextIssueStatus(1, 3)).toBe('partially_issued')
    expect(nextIssueStatus(3, 3)).toBe('issued')
  })

  it('leitet Wareneingang über Schneider wenn nötig', () => {
    expect(receivedNextStatus(true)).toBe('at_tailor')
    expect(receivedNextStatus(false)).toBe('ready_for_issue')
  })
})

describe('isValidInitialPassword / USERNAME_RE', () => {
  it('prüft Passwortregeln wie das Benutzerformular', () => {
    expect(isValidInitialPassword('Abcdefg1')).toBe(true)
    expect(isValidInitialPassword('short1A')).toBe(false)
    expect(isValidInitialPassword('abcdefgh')).toBe(false)
    expect(isValidInitialPassword('ABCDEFGH1')).toBe(true)
    expect(isValidInitialPassword('abcdefg1')).toBe(false)
  })

  it('validiert Benutzernamen', () => {
    expect(USERNAME_RE.test('mmustermann')).toBe(true)
    expect(USERNAME_RE.test('max.user-1')).toBe(true)
    expect(USERNAME_RE.test('Max')).toBe(false)
    expect(USERNAME_RE.test('user name')).toBe(false)
    expect(USERNAME_RE.test('stadt\\user')).toBe(false)
    expect(isDnPlaceholderUsername('dn7')).toBe(true)
    expect(isDnPlaceholderUsername('dn32')).toBe(true)
    expect(isDnPlaceholderUsername('DN3')).toBe(true)
    expect(isDnPlaceholderUsername('hans-peter.schwendinger')).toBe(false)
    expect(isDnPlaceholderUsername(null)).toBe(false)
  })

  it('nimmt vom PC-Anmeldenamen nur den sAMAccountName', () => {
    expect(sanitizePcUsername('HSCHWENDINGER')).toBe('hschwendinger')
    expect(sanitizePcUsername('STADT\\hschwendinger')).toBe('hschwendinger')
    expect(sanitizePcUsername('  stadt\\HSchwendinger  ')).toBe('hschwendinger')
    expect(USERNAME_RE.test(sanitizePcUsername('STADT\\hschwendinger'))).toBe(true)
  })
})

describe('filterAssignableRoles', () => {
  it('verhindert Admin-Vergabe durch Nicht-Admins', () => {
    expect(filterAssignableRoles(['sachbearbeiter'], ['user', 'admin'])).toEqual(['user'])
  })

  it('erlaubt Genehmiger nur Admin/Genehmiger', () => {
    expect(filterAssignableRoles(['sachbearbeiter'], ['genehmiger'])).toEqual(['user'])
    expect(filterAssignableRoles(['genehmiger'], ['genehmiger'])).toEqual(['genehmiger'])
    expect(filterAssignableRoles(['admin'], ['admin', 'genehmiger'])).toEqual(['admin', 'genehmiger'])
  })

  it('erlaubt Genehmiger die Vergabe von Sachbearbeiter (Bekleidung)', () => {
    expect(filterAssignableRoles(['genehmiger'], ['user', 'sachbearbeiter'])).toEqual(['user', 'sachbearbeiter'])
    expect(filterAssignableRoles(['approver'], ['sachbearbeiter'])).toEqual(['sachbearbeiter'])
    expect(filterAssignableRoles(['genehmiger'], ['admin'])).toEqual(['user'])
  })
})

describe('canCreateUsers / canDeactivateUsers', () => {
  it('erlaubt Anlegen für Sachbearbeiter, Genehmiger und Admin', () => {
    expect(canCreateUsers(['sachbearbeiter'])).toBe(true)
    expect(canCreateUsers(['genehmiger'])).toBe(true)
    expect(canCreateUsers(['approver'])).toBe(true)
    expect(canCreateUsers(['admin'])).toBe(true)
    expect(canCreateUsers(['user'])).toBe(false)
    expect(canCreateUsers([])).toBe(false)
  })

  it('erlaubt Deaktivieren nur Genehmiger und Admin, nicht Sachbearbeiter allein', () => {
    expect(canDeactivateUsers(['sachbearbeiter'])).toBe(false)
    expect(canDeactivateUsers(['user', 'sachbearbeiter'])).toBe(false)
    expect(canDeactivateUsers(['genehmiger'])).toBe(true)
    expect(canDeactivateUsers(['approver'])).toBe(true)
    expect(canDeactivateUsers(['admin'])).toBe(true)
    expect(canDeactivateUsers(['user'])).toBe(false)
  })

  it('öffnet die Portal-Benutzerverwaltung für Admin und Genehmiger, nicht für SB allein', () => {
    expect(canAccessPortalBenutzer(['admin'])).toBe(true)
    expect(canAccessPortalBenutzer(['genehmiger'])).toBe(true)
    expect(canAccessPortalBenutzer(['approver'])).toBe(true)
    expect(canAccessPortalBenutzer(['sachbearbeiter'])).toBe(false)
    expect(canAccessPortalBenutzer(['user'])).toBe(false)
  })
})
