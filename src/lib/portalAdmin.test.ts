import { describe, expect, it } from 'vitest'
import { ADMIN_AUTH_EMAIL } from './workflow'
import { excludeAdminsFromOfficerList, isPortalAdminProfile } from './portalAdmin'

describe('isPortalAdminProfile', () => {
  it('erkennt isStrictAdmin über roles', () => {
    expect(isPortalAdminProfile({ roles: ['admin'] })).toBe(true)
    expect(isPortalAdminProfile({ roles: ['user', 'admin'] })).toBe(true)
    expect(isPortalAdminProfile({ roles: ['sachbearbeiter'] })).toBe(false)
    expect(isPortalAdminProfile({ roles: ['user'] })).toBe(false)
    expect(isPortalAdminProfile({ roles: ['user', 'sachbearbeiter', 'genehmiger'] })).toBe(false)
  })

  it('erkennt profiles.admin === true', () => {
    expect(isPortalAdminProfile({ admin: true, roles: ['user'] })).toBe(true)
    expect(isPortalAdminProfile({ admin: false, roles: ['user'] })).toBe(false)
    expect(isPortalAdminProfile({ admin: null, roles: ['user'] })).toBe(false)
  })

  it('erkennt das gebundene Admin-Konto', () => {
    expect(isPortalAdminProfile({ username: 'admin' })).toBe(true)
    expect(isPortalAdminProfile({ username: 'Admin' })).toBe(true)
    expect(isPortalAdminProfile({ email: ADMIN_AUTH_EMAIL })).toBe(true)
    expect(isPortalAdminProfile({ email: ADMIN_AUTH_EMAIL.toUpperCase() })).toBe(true)
    expect(isPortalAdminProfile({ username: 'hschwendinger' })).toBe(false)
    expect(isPortalAdminProfile({ email: 'hans-peter.schwendinger@dornbirn.at' })).toBe(false)
  })

  it('lehnt leere oder fehlende Profile ab', () => {
    expect(isPortalAdminProfile(null)).toBe(false)
    expect(isPortalAdminProfile(undefined)).toBe(false)
    expect(isPortalAdminProfile({})).toBe(false)
  })
})

describe('excludeAdminsFromOfficerList', () => {
  it('entfernt Portal-Admins und behält Benutzer sowie Sachbearbeiter', () => {
    const rows = [
      { id: 'admin-flag', name: 'Portal Admin', admin: true, organisation: 'Stadtpolizei' },
      { id: 'admin-role', name: 'Muhammet', roles: ['admin'], organisation: 'Stadtpolizei' },
      { id: 'admin-user', name: 'Admin', username: 'admin', organisation: 'Stadtpolizei' },
      { id: 'user', name: 'Anna', roles: ['user'], organisation: 'Stadtpolizei' },
      { id: 'sb', name: 'Heinz', roles: ['user', 'sachbearbeiter'], organisation: 'Stadtpolizei' },
      { id: 'park', name: 'Irmgard', roles: ['user'], organisation: 'Parkaufsicht' },
    ]
    expect(excludeAdminsFromOfficerList(rows).map(row => row.id)).toEqual(['user', 'sb', 'park'])
  })

  it('ändert die Reihenfolge der verbleibenden Zeilen nicht', () => {
    const rows = [
      { id: 'b', roles: ['user'] },
      { id: 'admin', username: 'admin' },
      { id: 'a', roles: ['sachbearbeiter'] },
    ]
    expect(excludeAdminsFromOfficerList(rows).map(row => row.id)).toEqual(['b', 'a'])
  })
})
