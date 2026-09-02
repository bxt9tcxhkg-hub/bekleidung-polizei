import { describe, it, expect } from 'vitest'
import { availableRolesFromFlags, flagsFromRoles, sidebarRoleLabels } from './authRoles'

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

describe('sidebarRoleLabels', () => {
  it('listet für Admin alle Bereiche inklusive Sachbearbeiter', () => {
    const flags = flagsFromRoles(['admin'])
    expect(flags.isSachbearbeiter).toBe(true)
    expect(sidebarRoleLabels(flags)).toEqual(['Admin', 'Sachbearbeiter', 'Genehmiger', 'Benutzer'])
    expect(sidebarRoleLabels(flags).join(' · ')).toBe('Admin · Sachbearbeiter · Genehmiger · Benutzer')
  })

  it('listet für reinen Sachbearbeiter nur Sachbearbeiter und Benutzer', () => {
    expect(sidebarRoleLabels(flagsFromRoles(['sachbearbeiter']))).toEqual(['Sachbearbeiter', 'Benutzer'])
  })

  it('listet für reinen Genehmiger nur Genehmiger und Benutzer', () => {
    expect(sidebarRoleLabels(flagsFromRoles(['genehmiger']))).toEqual(['Genehmiger', 'Benutzer'])
    expect(sidebarRoleLabels(flagsFromRoles(['approver']))).toEqual(['Genehmiger', 'Benutzer'])
  })

  it('listet für Benutzer nur Benutzer', () => {
    expect(sidebarRoleLabels(flagsFromRoles(['user']))).toEqual(['Benutzer'])
    expect(sidebarRoleLabels(flagsFromRoles([]))).toEqual(['Benutzer'])
  })

  it('listet kombinierte Sachbearbeiter- und Genehmiger-Rolle ohne Admin', () => {
    expect(sidebarRoleLabels(flagsFromRoles(['sachbearbeiter', 'genehmiger']))).toEqual([
      'Sachbearbeiter',
      'Genehmiger',
      'Benutzer',
    ])
  })
})
