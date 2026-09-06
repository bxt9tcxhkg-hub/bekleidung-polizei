import { describe, it, expect } from 'vitest'
import {
  resolveLoginEmail,
  resolveLoginEmailForAuth,
  lookupUsernameAuthEmail,
  LOGIN_EMAIL_REQUIRED_ERROR,
  LOGIN_USERNAME_UNKNOWN_ERROR,
  ADMIN_AUTH_EMAIL,
  ADMIN_LOGIN_USERNAME,
  isBoundAdminIdentity,
  isBoundAdminLoginInput,
  isUsernameLoginResult,
  shouldForcePasswordChange,
  shouldForceUsernameSet,
  decideSubmitStatus,
  previousOrderStatus,
  nextIssueStatus,
  receivedNextStatus,
  isValidInitialPassword,
  isValidPersonalPassword,
  filterAssignableRoles,
  canAccessPortalBenutzer,
  canCreateUsers,
  canDeactivateUsers,
  canResetUserPassword,
  USERNAME_RE,
  isDnPlaceholderUsername,
  sanitizePcUsername,
} from './workflow'

describe('resolveLoginEmail', () => {
  it('lehnt leere und ungültige Eingaben ab', () => {
    for (const input of ['', '   ', 'user@', '@dornbirn.at', 'stadt\\', 'Name Mit Leerzeichen']) {
      expect(resolveLoginEmail(input)).toEqual({
        ok: false,
        error: LOGIN_EMAIL_REQUIRED_ERROR,
      })
    }
  })

  it('erkennt PC-Benutzernamen (sAMAccountName, Domäne abstreifen)', () => {
    expect(resolveLoginEmail('msoyucok')).toEqual({ ok: true, username: 'msoyucok' })
    expect(resolveLoginEmail('  MSOYUCOK  ')).toEqual({ ok: true, username: 'msoyucok' })
    expect(resolveLoginEmail('STADT\\msoyucok')).toEqual({ ok: true, username: 'msoyucok' })
    expect(resolveLoginEmail('mmustermann')).toEqual({ ok: true, username: 'mmustermann' })
    expect(resolveLoginEmail('max.user-1')).toEqual({ ok: true, username: 'max.user-1' })
    expect(isUsernameLoginResult(resolveLoginEmail('msoyucok'))).toBe(true)
  })

  it('lehnt dn-Platzhalter als Login-Namen ab', () => {
    expect(resolveLoginEmail('dn7')).toEqual({
      ok: false,
      error: LOGIN_USERNAME_UNKNOWN_ERROR,
    })
    expect(resolveLoginEmail('DN32')).toEqual({
      ok: false,
      error: LOGIN_USERNAME_UNKNOWN_ERROR,
    })
  })

  it('nimmt volle E-Mail-Adressen (trim, klein), auch bestehende Admins', () => {
    expect(resolveLoginEmail('name@beispiel.at')).toEqual({ ok: true, email: 'name@beispiel.at' })
    expect(resolveLoginEmail('  Hans-Peter.Schwendinger@dornbirn.at  ')).toEqual({
      ok: true,
      email: 'hans-peter.schwendinger@dornbirn.at',
    })
    expect(resolveLoginEmail('Martin.Feurstein2@dornbirn.at')).toEqual({
      ok: true,
      email: 'martin.feurstein2@dornbirn.at',
    })
    expect(resolveLoginEmail(ADMIN_AUTH_EMAIL)).toEqual({ ok: true, email: ADMIN_AUTH_EMAIL })
    expect(ADMIN_AUTH_EMAIL).toBe('admin@stadtpolizei-dornbirn.local')
  })

  it('schreibt Nicht-Admin-E-Mails klein, damit gemischte Schreibweise Auth trifft', () => {
    expect(resolveLoginEmail('Hans-Peter.Schwendinger@DORNBIRN.AT')).toEqual({
      ok: true,
      email: 'hans-peter.schwendinger@dornbirn.at',
    })
    expect(resolveLoginEmail('JULIAN.MUELLER@dornbirn.at')).toEqual({
      ok: true,
      email: 'julian.mueller@dornbirn.at',
    })
    expect(resolveLoginEmail('  Martin.Feurstein2@Dornbirn.AT  ')).toEqual({
      ok: true,
      email: 'martin.feurstein2@dornbirn.at',
    })
    expect(resolveLoginEmail('admin')).toEqual({ ok: true, email: ADMIN_AUTH_EMAIL })
    expect(resolveLoginEmail('ADMIN@STADTPOLIZEI-DORNBIRN.LOCAL')).toEqual({
      ok: true,
      email: ADMIN_AUTH_EMAIL,
    })
  })

  it('löst nur den gebundenen Admin-Benutzernamen auf', () => {
    expect(isBoundAdminLoginInput('Admin')).toBe(true)
    expect(isBoundAdminLoginInput(' admin ')).toBe(true)
    expect(isBoundAdminLoginInput('administrator')).toBe(false)
    expect(resolveLoginEmail('admin')).toEqual({ ok: true, email: ADMIN_AUTH_EMAIL })
    expect(resolveLoginEmail('  ADMIN  ')).toEqual({ ok: true, email: ADMIN_AUTH_EMAIL })
    expect(ADMIN_LOGIN_USERNAME).toBe('admin')
    expect(isUsernameLoginResult(resolveLoginEmail('admin'))).toBe(false)
  })
})

describe('resolveLoginEmailForAuth / lookupUsernameAuthEmail', () => {
  it('lässt E-Mail und Admin ohne Lookup durch', async () => {
    const lookup = async () => {
      throw new Error('Lookup darf bei E-Mail/Admin nicht laufen')
    }
    expect(await resolveLoginEmailForAuth('Muhammet.Soyucok@dornbirn.at', lookup)).toEqual({
      ok: true,
      email: 'muhammet.soyucok@dornbirn.at',
    })
    expect(await resolveLoginEmailForAuth('admin', lookup)).toEqual({
      ok: true,
      email: ADMIN_AUTH_EMAIL,
    })
  })

  it('löst PC-Benutzernamen über den Lookup zur Auth-E-Mail auf', async () => {
    const lookup = async (username: string) => {
      expect(username).toBe('msoyucok')
      return 'muhammet.soyucok@dornbirn.at'
    }
    expect(await resolveLoginEmailForAuth('MSOYUCOK', lookup)).toEqual({
      ok: true,
      email: 'muhammet.soyucok@dornbirn.at',
    })
    expect(await resolveLoginEmailForAuth('STADT\\msoyucok', lookup)).toEqual({
      ok: true,
      email: 'muhammet.soyucok@dornbirn.at',
    })
  })

  it('meldet unbekannten Benutzernamen auf Deutsch', async () => {
    expect(await resolveLoginEmailForAuth('unbekannt', async () => null)).toEqual({
      ok: false,
      error: LOGIN_USERNAME_UNKNOWN_ERROR,
    })
    expect(await resolveLoginEmailForAuth('dn7', async () => 'x@dornbirn.at')).toEqual({
      ok: false,
      error: LOGIN_USERNAME_UNKNOWN_ERROR,
    })
  })

  it('ruft lookup_login_email mit bereinigtem Username auf', async () => {
    const rpc = async (fn: 'lookup_login_email', args: { p_username: string }) => {
      expect(fn).toBe('lookup_login_email')
      expect(args.p_username).toBe('msoyucok')
      return { data: 'Muhammet.Soyucok@DORNBIRN.AT', error: null }
    }
    expect(await lookupUsernameAuthEmail({ rpc }, 'STADT\\MSOYUCOK')).toBe(
      'muhammet.soyucok@dornbirn.at',
    )
  })

  it('liefert null bei RPC-Fehler, leerem oder ungültigem Ergebnis', async () => {
    expect(await lookupUsernameAuthEmail({
      rpc: async () => ({ data: null, error: { message: 'boom' } }),
    }, 'msoyucok')).toBeNull()
    expect(await lookupUsernameAuthEmail({
      rpc: async () => ({ data: '', error: null }),
    }, 'msoyucok')).toBeNull()
    expect(await lookupUsernameAuthEmail({
      rpc: async () => ({ data: 'kein-email', error: null }),
    }, 'msoyucok')).toBeNull()
    expect(await lookupUsernameAuthEmail({
      rpc: async () => ({ data: 'x@dornbirn.at', error: null }),
    }, 'dn7')).toBeNull()
  })
})

describe('bound Admin Erstlogin', () => {
  it('erkennt das gebundene Admin-Konto', () => {
    expect(isBoundAdminIdentity({ username: 'admin' })).toBe(true)
    expect(isBoundAdminIdentity({ email: ADMIN_AUTH_EMAIL })).toBe(true)
    expect(isBoundAdminIdentity({ email: 'hans-peter.schwendinger@dornbirn.at' })).toBe(false)
    expect(isBoundAdminIdentity({ username: 'hschwendinger' })).toBe(false)
  })

  it('nimmt dem gebundenen Admin kein Passwort- oder Username-Erstlogin ab', () => {
    expect(shouldForcePasswordChange({
      forcePasswordChange: true,
      username: 'admin',
      email: ADMIN_AUTH_EMAIL,
    })).toBe(false)
    expect(shouldForceUsernameSet({
      forceUsernameSet: true,
      username: 'admin',
      email: ADMIN_AUTH_EMAIL,
    })).toBe(false)
  })

  it('lässt Erstlogin für Beamte unverändert', () => {
    expect(shouldForcePasswordChange({
      forcePasswordChange: true,
      email: 'hans-peter.schwendinger@dornbirn.at',
    })).toBe(true)
    expect(shouldForceUsernameSet({
      forceUsernameSet: true,
      username: null,
      email: 'hans-peter.schwendinger@dornbirn.at',
    })).toBe(true)
    expect(shouldForceUsernameSet({
      username: '',
      email: 'irmgard.faessler@dornbirn.at',
    })).toBe(true)
    expect(shouldForceUsernameSet({
      username: 'hschwendinger',
      email: 'hans-peter.schwendinger@dornbirn.at',
    })).toBe(false)
    expect(shouldForceUsernameSet({
      username: 'dn7',
      email: 'hans-peter.schwendinger@dornbirn.at',
    })).toBe(true)
    expect(shouldForceUsernameSet({
      forceUsernameSet: false,
      username: '',
      email: 'irmgard.faessler@dornbirn.at',
    })).toBe(true)
    expect(shouldForceUsernameSet({
      forceUsernameSet: false,
      username: 'dn7',
      email: 'hans-peter.schwendinger@dornbirn.at',
    })).toBe(true)
  })

  it('hält den Username-Schritt nicht offen, wenn das Profil den PC-Namen schon hat', () => {
    expect(shouldForceUsernameSet({
      forceUsernameSet: false,
      username: 'msoyucok',
      email: 'msoyucok@dornbirn.at',
    })).toBe(false)
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
  it('prüft die persönliche Passwortregel (Erstlogin-Modal), nicht das Startpasswort', () => {
    expect(isValidPersonalPassword('Abcdefg1')).toBe(true)
    expect(isValidInitialPassword('Abcdefg1')).toBe(true)
    expect(isValidPersonalPassword('123456')).toBe(false)
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

  it('erlaubt Startpasswort-Reset nur Genehmiger und Admin', () => {
    expect(canResetUserPassword(['admin'])).toBe(true)
    expect(canResetUserPassword(['genehmiger'])).toBe(true)
    expect(canResetUserPassword(['approver'])).toBe(true)
    expect(canResetUserPassword(['sachbearbeiter'])).toBe(false)
    expect(canResetUserPassword(['user'])).toBe(false)
  })

  it('öffnet die Portal-Benutzerverwaltung für Admin und Genehmiger, nicht für SB allein', () => {
    expect(canAccessPortalBenutzer(['admin'])).toBe(true)
    expect(canAccessPortalBenutzer(['genehmiger'])).toBe(true)
    expect(canAccessPortalBenutzer(['approver'])).toBe(true)
    expect(canAccessPortalBenutzer(['sachbearbeiter'])).toBe(false)
    expect(canAccessPortalBenutzer(['user'])).toBe(false)
  })
})
