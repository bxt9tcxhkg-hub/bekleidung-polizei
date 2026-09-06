import { describe, it, expect } from 'vitest'
import { isValidInitialPassword, isValidPersonalPassword } from './workflow'
import {
  DEFAULT_START_PASSWORD,
  START_PASSWORD_REQUIRED_MESSAGE,
  buildResetPasswordRequest,
  canResetUserPassword,
  generateRandomInitialPassword,
  isValidStartPassword,
  resolveImportStartPassword,
  shouldKeepForceUsernameSet,
} from './startPassword'

describe('canResetUserPassword', () => {
  it('erlaubt Admin und Genehmiger, nicht Sachbearbeiter allein', () => {
    expect(canResetUserPassword(['admin'])).toBe(true)
    expect(canResetUserPassword(['genehmiger'])).toBe(true)
    expect(canResetUserPassword(['approver'])).toBe(true)
    expect(canResetUserPassword(['sachbearbeiter'])).toBe(false)
    expect(canResetUserPassword(['user'])).toBe(false)
  })
})

describe('shouldKeepForceUsernameSet', () => {
  it('hält das Flag wenn Username fehlt oder dn{N} ist', () => {
    expect(shouldKeepForceUsernameSet(null)).toBe(true)
    expect(shouldKeepForceUsernameSet('')).toBe(true)
    expect(shouldKeepForceUsernameSet('   ')).toBe(true)
    expect(shouldKeepForceUsernameSet('dn7')).toBe(true)
    expect(shouldKeepForceUsernameSet('DN32')).toBe(true)
  })

  it('hält das Flag wenn es am Profil noch gesetzt ist', () => {
    expect(shouldKeepForceUsernameSet('hschwendinger', true)).toBe(true)
  })

  it('lässt gültige PC-Namen in Ruhe', () => {
    expect(shouldKeepForceUsernameSet('hschwendinger')).toBe(false)
    expect(shouldKeepForceUsernameSet('hschwendinger', false)).toBe(false)
  })
})

describe('isValidStartPassword / DEFAULT_START_PASSWORD', () => {
  it('akzeptiert das Owner-Startpasswort 123456 und andere nicht-leere Werte', () => {
    expect(DEFAULT_START_PASSWORD).toBe('123456')
    expect(isValidStartPassword('123456')).toBe(true)
    expect(isValidStartPassword(' 123456 ')).toBe(true)
    expect(isValidStartPassword('abc')).toBe(true)
    expect(isValidStartPassword('')).toBe(false)
    expect(isValidStartPassword('   ')).toBe(false)
  })

  it('unterscheidet Startpasswort von der persönlichen Passwortregel', () => {
    expect(isValidPersonalPassword('123456')).toBe(false)
    expect(isValidInitialPassword('123456')).toBe(false)
    expect(isValidPersonalPassword('Abcdefg1')).toBe(true)
  })
})

describe('resolveImportStartPassword', () => {
  it('verwendet das gemeinsame Startpasswort 123456 für jede Zeile', () => {
    const resolved = resolveImportStartPassword({ mode: 'shared', startPassword: DEFAULT_START_PASSWORD })
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.passwordFor(0)).toBe('123456')
    expect(resolved.passwordFor(1)).toBe('123456')
    expect(resolved.passwordFor(9)).toBe('123456')
  })

  it('trimmt das gemeinsame Startpasswort', () => {
    const resolved = resolveImportStartPassword({ mode: 'shared', startPassword: '  123456  ' })
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.passwordFor(0)).toBe('123456')
  })

  it('lehnt nur ein leeres gemeinsames Startpasswort ab', () => {
    expect(resolveImportStartPassword({ mode: 'shared', startPassword: '' })).toEqual({
      ok: false,
      error: START_PASSWORD_REQUIRED_MESSAGE,
    })
    expect(resolveImportStartPassword({ mode: 'shared', startPassword: '   ' })).toEqual({
      ok: false,
      error: START_PASSWORD_REQUIRED_MESSAGE,
    })
  })

  it('würfelt nur bei explizitem Zufallsmodus pro Person', () => {
    let n = 0
    const resolved = resolveImportStartPassword(
      { mode: 'random', startPassword: '' },
      () => `Rand${n++}A1xx`,
    )
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.passwordFor(0)).toBe('Rand0A1xx')
    expect(resolved.passwordFor(1)).toBe('Rand1A1xx')
  })
})

describe('generateRandomInitialPassword', () => {
  it('erfüllt die persönliche Passwortregel (Zufallsmodus)', () => {
    const pw = generateRandomInitialPassword()
    expect(pw).toHaveLength(10)
    expect(isValidPersonalPassword(pw)).toBe(true)
  })
})

describe('buildResetPasswordRequest', () => {
  it('baut den create-user Reset-Body mit dem eingegebenen Startpasswort', () => {
    expect(buildResetPasswordRequest('user-1', DEFAULT_START_PASSWORD)).toEqual({
      action: 'reset_password',
      user_id: 'user-1',
      initial_password: '123456',
    })
    expect(buildResetPasswordRequest('user-1', '  123456  ').initial_password).toBe('123456')
  })
})
