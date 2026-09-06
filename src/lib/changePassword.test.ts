import { describe, it, expect, vi } from 'vitest'
import {
  AUTH_PASSWORD_MIN_LENGTH,
  CHANGE_PASSWORD_CURRENT_REQUIRED,
  CHANGE_PASSWORD_FAILED,
  CHANGE_PASSWORD_MISMATCH,
  CHANGE_PASSWORD_NO_ACCOUNT,
  CHANGE_PASSWORD_SAME_AS_CURRENT,
  CHANGE_PASSWORD_SESSION_EXPIRED,
  CHANGE_PASSWORD_TOO_SHORT,
  CHANGE_PASSWORD_WRONG_CURRENT,
  changeOwnPassword,
  isValidAuthPassword,
  mapChangePasswordAuthError,
  validateChangePassword,
  type ChangePasswordAuth,
} from './changePassword'

const validFields = {
  currentPassword: '123456',
  newPassword: '654321',
  confirmPassword: '654321',
}

function mockAuth(overrides: Partial<ChangePasswordAuth> = {}): ChangePasswordAuth {
  return {
    getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
    refreshSession: async () => ({ data: { session: { access_token: 'tok' } } }),
    getUser: async () => ({ data: { user: { email: 'max.mustermann@dornbirn.at' } } }),
    signInWithPassword: async () => ({ error: null }),
    updateUser: async () => ({ error: null }),
    ...overrides,
  }
}

describe('isValidAuthPassword / validateChangePassword', () => {
  it('akzeptiert die Auth-Mindestlänge 6 (Startpasswort 123456)', () => {
    expect(AUTH_PASSWORD_MIN_LENGTH).toBe(6)
    expect(isValidAuthPassword('123456')).toBe(true)
    expect(isValidAuthPassword('12345')).toBe(false)
    expect(validateChangePassword(validFields)).toEqual({ ok: true })
  })

  it('fordert aktuelles Passwort, Bestätigung und ein anderes neues Passwort', () => {
    expect(validateChangePassword({ ...validFields, currentPassword: '' }))
      .toEqual({ ok: false, error: CHANGE_PASSWORD_CURRENT_REQUIRED })
    expect(validateChangePassword({ ...validFields, newPassword: '12345', confirmPassword: '12345' }))
      .toEqual({ ok: false, error: CHANGE_PASSWORD_TOO_SHORT })
    expect(validateChangePassword({ ...validFields, confirmPassword: 'anders' }))
      .toEqual({ ok: false, error: CHANGE_PASSWORD_MISMATCH })
    expect(validateChangePassword({
      currentPassword: '123456',
      newPassword: '123456',
      confirmPassword: '123456',
    })).toEqual({ ok: false, error: CHANGE_PASSWORD_SAME_AS_CURRENT })
  })
})

describe('mapChangePasswordAuthError', () => {
  it('übersetzt Session- und Auth-Fehler ins Deutsche', () => {
    expect(mapChangePasswordAuthError({ name: 'AuthSessionMissingError' }))
      .toBe(CHANGE_PASSWORD_SESSION_EXPIRED)
    expect(mapChangePasswordAuthError({ message: 'New password should be different from the old password.' }))
      .toBe(CHANGE_PASSWORD_SAME_AS_CURRENT)
    expect(mapChangePasswordAuthError({ message: 'Password should be at least 6 characters.' }))
      .toBe(CHANGE_PASSWORD_TOO_SHORT)
    expect(mapChangePasswordAuthError({ message: 'Invalid login credentials' }))
      .toBe(CHANGE_PASSWORD_WRONG_CURRENT)
    expect(mapChangePasswordAuthError(null)).toBe(CHANGE_PASSWORD_FAILED)
  })
})

describe('changeOwnPassword', () => {
  it('meldet sich mit Session-E-Mail und aktuellem Passwort an, dann updateUser', async () => {
    const signInWithPassword = vi.fn(async () => ({ error: null }))
    const updateUser = vi.fn(async () => ({ error: null }))
    const result = await changeOwnPassword(
      mockAuth({ signInWithPassword, updateUser }),
      validFields,
    )
    expect(result).toEqual({ ok: true })
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'max.mustermann@dornbirn.at',
      password: '123456',
    })
    expect(updateUser).toHaveBeenCalledWith({ password: '654321' })
  })

  it('bricht bei falschem aktuellem Passwort vor updateUser ab', async () => {
    const updateUser = vi.fn(async () => ({ error: null }))
    const result = await changeOwnPassword(
      mockAuth({
        signInWithPassword: async () => ({ error: { message: 'Invalid login credentials' } }),
        updateUser,
      }),
      validFields,
    )
    expect(result).toEqual({ ok: false, error: CHANGE_PASSWORD_WRONG_CURRENT })
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('liefert Sitzungsfehler wenn weder Session noch Refresh vorhanden ist', async () => {
    const result = await changeOwnPassword(
      mockAuth({
        getSession: async () => ({ data: { session: null } }),
        refreshSession: async () => ({ data: { session: null } }),
      }),
      validFields,
    )
    expect(result).toEqual({ ok: false, error: CHANGE_PASSWORD_SESSION_EXPIRED })
  })

  it('lehnt fehlende Auth-E-Mail ab', async () => {
    const result = await changeOwnPassword(
      mockAuth({ getUser: async () => ({ data: { user: { email: null } } }) }),
      validFields,
    )
    expect(result).toEqual({ ok: false, error: CHANGE_PASSWORD_NO_ACCOUNT })
  })

  it('gibt Client-Validierung ohne Auth-Aufruf zurück', async () => {
    const signInWithPassword = vi.fn()
    const result = await changeOwnPassword(
      mockAuth({ signInWithPassword }),
      { ...validFields, confirmPassword: 'nein' },
    )
    expect(result).toEqual({ ok: false, error: CHANGE_PASSWORD_MISMATCH })
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('übersetzt updateUser-Fehler', async () => {
    const result = await changeOwnPassword(
      mockAuth({
        updateUser: async () => ({
          error: { message: 'New password should be different from the old password.' },
        }),
      }),
      validFields,
    )
    expect(result).toEqual({ ok: false, error: CHANGE_PASSWORD_SAME_AS_CURRENT })
  })
})
