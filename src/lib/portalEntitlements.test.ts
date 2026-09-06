import { describe, it, expect } from 'vitest'
import type { PortalApp } from './portalApps'
import {
  AREA_ROLES,
  bekleidungRolesFromProfiles,
  canonicalizeRoleName,
  defaultEinsatzMtRoleForNewUser,
  hasAreaEntitlement,
  highestAreaRole,
  isAllowedAreaRole,
  parseEinsatzMtRole,
  profilesRolesFromBekleidung,
  rolesForArea,
  sortAreaRoles,
  visiblePortalApps,
} from './portalEntitlements'

describe('Bereichsrollen', () => {
  it('erlaubt Bekleidung die bestehenden vier Rollen inkl. Genehmiger', () => {
    expect([...AREA_ROLES.bekleidung]).toEqual(['user', 'sachbearbeiter', 'genehmiger', 'admin'])
  })

  it('erlaubt Einsatzmittel & Training nur Benutzer, Sachbearbeiter, Admin', () => {
    expect([...AREA_ROLES.einsatz_mt]).toEqual(['user', 'sachbearbeiter', 'admin'])
    expect(isAllowedAreaRole('einsatz_mt', 'genehmiger')).toBe(false)
    expect(isAllowedAreaRole('einsatz_mt', 'admin')).toBe(true)
  })

  it('sortiert Rollen user < sachbearbeiter < genehmiger < admin', () => {
    expect(sortAreaRoles(['admin', 'user', 'genehmiger', 'sachbearbeiter'])).toEqual([
      'user',
      'sachbearbeiter',
      'genehmiger',
      'admin',
    ])
  })

  it('mappt approver auf genehmiger', () => {
    expect(canonicalizeRoleName('approver')).toBe('genehmiger')
    expect(bekleidungRolesFromProfiles(['user', 'approver'])).toEqual(['user', 'genehmiger'])
  })
})

describe('Sync profiles.roles ↔ bekleidung', () => {
  it('übernimmt mehrere Bekleidungsrollen unverändert (SB + Genehmiger)', () => {
    expect(bekleidungRolesFromProfiles(['user', 'sachbearbeiter', 'genehmiger'])).toEqual([
      'user',
      'sachbearbeiter',
      'genehmiger',
    ])
    expect(profilesRolesFromBekleidung(['genehmiger', 'sachbearbeiter', 'user'])).toEqual([
      'user',
      'sachbearbeiter',
      'genehmiger',
    ])
  })

  it('fällt bei leerer oder unbekannter Liste auf user zurück', () => {
    expect(bekleidungRolesFromProfiles([])).toEqual(['user'])
    expect(bekleidungRolesFromProfiles(['unbekannt'])).toEqual(['user'])
  })

  it('filtert einsatz_mt-fremde Namen aus profiles.roles nicht als Bekleidung', () => {
    expect(bekleidungRolesFromProfiles(['user', 'admin'])).toEqual(['user', 'admin'])
  })
})

describe('einsatz_mt Rolle', () => {
  it('nimmt die höchste erlaubte Rolle', () => {
    expect(parseEinsatzMtRole(['user', 'sachbearbeiter'])).toBe('sachbearbeiter')
    expect(parseEinsatzMtRole(['admin'])).toBe('admin')
    expect(highestAreaRole(['user', 'admin'])).toBe('admin')
  })

  it('liefert null ohne Zeile / ohne erlaubte Rolle', () => {
    expect(parseEinsatzMtRole(null)).toBeNull()
    expect(parseEinsatzMtRole([])).toBeNull()
    expect(parseEinsatzMtRole(['genehmiger'])).toBeNull()
  })

  it('setzt Default für neue Benutzer auf user (Lesen)', () => {
    expect(defaultEinsatzMtRoleForNewUser()).toBe('user')
  })
})

describe('hasAreaEntitlement / visiblePortalApps', () => {
  const apps: readonly PortalApp[] = [
    { id: 'bekleidung', title: 'Bekleidung', description: 'x', path: '/dashboard', status: 'active' },
    { id: 'einsatz_mt', title: 'Einsatzmittel & Training', description: '', path: '/einsatz', status: 'active' },
  ]

  it('gibt Admin immer alle Bereiche', () => {
    expect(hasAreaEntitlement({ area: 'einsatz_mt', isStrictAdmin: true, rows: [] })).toBe(true)
    expect(visiblePortalApps(apps, { isStrictAdmin: true, rows: [] }).map(a => a.id)).toEqual([
      'bekleidung',
      'einsatz_mt',
    ])
  })

  it('blendet Einsatz ohne Zeile aus, Bekleidung nur mit Zeile', () => {
    const rows = [{ area: 'bekleidung', roles: ['user'] }]
    expect(hasAreaEntitlement({ area: 'bekleidung', isStrictAdmin: false, rows })).toBe(true)
    expect(hasAreaEntitlement({ area: 'einsatz_mt', isStrictAdmin: false, rows })).toBe(false)
    expect(visiblePortalApps(apps, { isStrictAdmin: false, rows }).map(a => a.id)).toEqual(['bekleidung'])
  })

  it('zeigt Einsatz-Kachel bei einsatz_mt-Recht', () => {
    const rows = [
      { area: 'bekleidung', roles: ['user'] },
      { area: 'einsatz_mt', roles: ['user'] },
    ]
    expect(visiblePortalApps(apps, { isStrictAdmin: false, rows }).map(a => a.id)).toEqual([
      'bekleidung',
      'einsatz_mt',
    ])
  })

  it('fällt ohne Tabelle auf Bekleidung sichtbar / Einsatz unsichtbar zurück', () => {
    expect(hasAreaEntitlement({ area: 'bekleidung', isStrictAdmin: false, rows: null })).toBe(true)
    expect(hasAreaEntitlement({ area: 'einsatz_mt', isStrictAdmin: false, rows: null })).toBe(false)
    expect(visiblePortalApps(apps, { isStrictAdmin: false, rows: null }).map(a => a.id)).toEqual(['bekleidung'])
  })

  it('liest Rollen einer Area aus der Zeilenliste', () => {
    expect(rolesForArea([{ area: 'einsatz_mt', roles: ['sachbearbeiter'] }], 'einsatz_mt')).toEqual([
      'sachbearbeiter',
    ])
    expect(rolesForArea([], 'bekleidung')).toEqual([])
  })
})
