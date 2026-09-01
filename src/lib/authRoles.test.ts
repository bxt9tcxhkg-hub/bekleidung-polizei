import { describe, it, expect } from 'vitest'
import { availableRolesFromFlags, flagsFromRoles } from './authRoles'

describe('flagsFromRoles', () => {
  it('unterscheidet Admin von Sachbearbeiter', () => {
    const sb = flagsFromRoles(['sachbearbeiter'])
    expect(sb.isAdmin).toBe(false)
    expect(sb.isSachbearbeiter).toBe(true)
    expect(sb.isAdmin).not.toBe(sb.isSachbearbeiter)

    const admin = flagsFromRoles(['admin'])
    expect(admin.isAdmin).toBe(true)
    expect(admin.isSachbearbeiter).toBe(true)
    expect(admin.isGenehmiger).toBe(true)
    expect(admin.isStrictAdmin).toBe(true)
  })

  it('gibt Admin in availableRoles aus', () => {
    expect(availableRolesFromFlags(flagsFromRoles(['admin']))).toContain('admin')
    expect(availableRolesFromFlags(flagsFromRoles(['sachbearbeiter']))).not.toContain('admin')
    expect(availableRolesFromFlags(flagsFromRoles(['user']))).toEqual(['user'])
  })
})
