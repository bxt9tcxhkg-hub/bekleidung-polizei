import { describe, it, expect } from 'vitest'
import { planAuthStateChange, showsAuthLoading } from './authStateChange'

describe('planAuthStateChange', () => {
  it('lädt das Profil nur bei SIGNED_IN / INITIAL_SESSION mit Spinner', () => {
    expect(planAuthStateChange({ event: 'SIGNED_IN', hasUser: true, userId: 'u1' })).toBe('full-reload')
    expect(planAuthStateChange({ event: 'INITIAL_SESSION', hasUser: true, userId: 'u1' })).toBe('full-reload')
    expect(showsAuthLoading('full-reload')).toBe(true)
  })

  it('überspringt SIGNED_IN / INITIAL_SESSION wenn das Profil für denselben User schon da ist', () => {
    expect(planAuthStateChange({
      event: 'SIGNED_IN',
      hasUser: true,
      userId: 'u1',
      loadedForUserId: 'u1',
    })).toBe('none')
    expect(planAuthStateChange({
      event: 'INITIAL_SESSION',
      hasUser: true,
      userId: 'u1',
      loadedForUserId: 'u1',
    })).toBe('none')
  })

  it('lädt bei anderem User nach SIGNED_IN neu', () => {
    expect(planAuthStateChange({
      event: 'SIGNED_IN',
      hasUser: true,
      userId: 'u2',
      loadedForUserId: 'u1',
    })).toBe('full-reload')
  })

  it('setzt TOKEN_REFRESHED nicht auf loading (kein Remount / kein Refresh-Loop)', () => {
    expect(planAuthStateChange({ event: 'TOKEN_REFRESHED', hasUser: true, userId: 'u1' })).toBe('none')
    expect(showsAuthLoading('none')).toBe(false)
  })

  it('aktualisiert das Profil nach USER_UPDATED ohne Spinner', () => {
    expect(planAuthStateChange({ event: 'USER_UPDATED', hasUser: true, userId: 'u1' })).toBe('soft-reload')
    expect(showsAuthLoading('soft-reload')).toBe(false)
  })

  it('räumt bei SIGNED_OUT oder fehlender Session auf', () => {
    expect(planAuthStateChange({ event: 'SIGNED_OUT', hasUser: false })).toBe('clear')
    expect(planAuthStateChange({ event: 'TOKEN_REFRESHED', hasUser: false })).toBe('clear')
    expect(planAuthStateChange({ event: 'USER_UPDATED', hasUser: false })).toBe('clear')
  })

  it('ignoriert sonstige Events ohne Spinner', () => {
    expect(planAuthStateChange({ event: 'PASSWORD_RECOVERY', hasUser: true, userId: 'u1' })).toBe('none')
    expect(showsAuthLoading('clear')).toBe(false)
  })
})
