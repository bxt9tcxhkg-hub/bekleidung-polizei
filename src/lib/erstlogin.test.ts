import { describe, it, expect, vi } from 'vitest'
import {
  ERSTLOGIN_SESSION_EXPIRED,
  buildErstloginAuthMetadata,
  buildErstloginProfilePatch,
  ensureAuthSession,
  isAuthSessionMissingError,
  mapErstloginAuthError,
} from './erstlogin'
import { shouldForcePasswordChange, shouldForceUsernameSet } from './workflow'

describe('ensureAuthSession', () => {
  it('nutzt eine vorhandene Session ohne Refresh', async () => {
    const refreshSession = vi.fn()
    const ok = await ensureAuthSession({
      getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
      refreshSession,
    })
    expect(ok).toBe(true)
    expect(refreshSession).not.toHaveBeenCalled()
  })

  it('refresht wenn getSession leer ist und akzeptiert die neue Session', async () => {
    const ok = await ensureAuthSession({
      getSession: async () => ({ data: { session: null } }),
      refreshSession: async () => ({ data: { session: { access_token: 'neu' } } }),
    })
    expect(ok).toBe(true)
  })

  it('liefert false wenn auch der Refresh keine Session bringt', async () => {
    const ok = await ensureAuthSession({
      getSession: async () => ({ data: { session: null } }),
      refreshSession: async () => ({ data: { session: null } }),
    })
    expect(ok).toBe(false)
  })
})

describe('mapErstloginAuthError', () => {
  it('übersetzt Auth session missing ins Deutsche', () => {
    expect(isAuthSessionMissingError({ message: 'Auth session missing!' })).toBe(true)
    expect(isAuthSessionMissingError({ name: 'AuthSessionMissingError', message: 'Auth session missing!' })).toBe(true)
    expect(mapErstloginAuthError({ message: 'Auth session missing!' })).toBe(ERSTLOGIN_SESSION_EXPIRED)
    expect(mapErstloginAuthError({ name: 'AuthSessionMissingError' })).toBe(ERSTLOGIN_SESSION_EXPIRED)
  })

  it('lässt andere Auth-Fehlertexte durch', () => {
    expect(mapErstloginAuthError({ message: 'New password should be different from the old password.' }))
      .toBe('New password should be different from the old password.')
    expect(mapErstloginAuthError(null)).toBe('Konto konnte nicht eingerichtet werden.')
  })
})

describe('Erstlogin Restschritte nach Teilschreiben', () => {
  const beamter = { email: 'msoyucok@dornbirn.at' }

  it('Profil-Username schon gespeichert, Auth fehlgeschlagen → nur Passwort bleibt', () => {
    const username = 'msoyucok'
    expect(shouldForceUsernameSet({
      forceUsernameSet: false,
      username,
      ...beamter,
    })).toBe(false)
    expect(shouldForcePasswordChange({
      forcePasswordChange: true,
      username,
      ...beamter,
    })).toBe(true)
  })

  it('Auth erledigt, Profil-Username fehlt noch → nur PC-Name bleibt', () => {
    expect(shouldForcePasswordChange({
      forcePasswordChange: false,
      username: null,
      ...beamter,
    })).toBe(false)
    expect(shouldForceUsernameSet({
      forceUsernameSet: true,
      username: null,
      ...beamter,
    })).toBe(true)
  })

  it('Auth-Metadata-Flag allein öffnet den Username-Schritt nicht, wenn das Profil fertig ist', () => {
    expect(shouldForceUsernameSet({
      forceUsernameSet: false,
      username: 'msoyucok',
      ...beamter,
    })).toBe(false)
  })

  it('schließt den Username-Schritt wenn force_username_set false ist, auch ohne gespeicherten PC-Namen', () => {
    expect(shouldForceUsernameSet({
      forceUsernameSet: false,
      username: null,
      ...beamter,
    })).toBe(false)
    expect(shouldForceUsernameSet({
      forceUsernameSet: false,
      username: 'dn7',
      ...beamter,
    })).toBe(false)
  })
})

describe('Erstlogin Persistenz', () => {
  it('setzt beide Auth-Flags zurück', () => {
    expect(buildErstloginAuthMetadata()).toEqual({
      force_password_change: false,
      force_username_set: false,
    })
  })

  it('schreibt PC-Namen und force_username_set, force_password_change nur wenn die Spalte existiert', () => {
    expect(buildErstloginProfilePatch({ pcUsername: 'hschwendinger' })).toEqual({
      force_username_set: false,
      username: 'hschwendinger',
    })
    expect(buildErstloginProfilePatch({
      pcUsername: 'hschwendinger',
      profile: { force_username_set: true },
    })).toEqual({
      force_username_set: false,
      username: 'hschwendinger',
    })
    expect(buildErstloginProfilePatch({
      profile: { force_username_set: true, force_password_change: true },
    })).toEqual({
      force_username_set: false,
      force_password_change: false,
    })
  })
})
