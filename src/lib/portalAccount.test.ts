import { describe, it, expect } from 'vitest'
import { PORTAL_APPS } from './portalApps'
import { PORTAL_ACCOUNT_LINKS, PORTAL_ADMIN_LINKS, visiblePortalAdminLinks } from './portalAccount'

describe('PORTAL_ACCOUNT_LINKS', () => {
  it('führt Mein Profil und Hilfe unter den bestehenden Pfaden', () => {
    expect(PORTAL_ACCOUNT_LINKS.map(link => link.id)).toEqual(['profil', 'hilfe'])
    expect(PORTAL_ACCOUNT_LINKS.find(link => link.id === 'profil')).toMatchObject({
      to: '/profil',
      label: 'Mein Profil',
    })
    expect(PORTAL_ACCOUNT_LINKS.find(link => link.id === 'hilfe')).toMatchObject({
      to: '/hilfe',
      label: 'Hilfe',
    })
  })

  it('ist kein Portal-App-Eintrag (keine Bereichs-Kachel)', () => {
    const appIds = PORTAL_APPS.map(app => app.id)
    expect(appIds).not.toContain('profil')
    expect(appIds).not.toContain('hilfe')
  })
})

describe('PORTAL_ADMIN_LINKS', () => {
  it('führt Audit-Log unter dem bestehenden Pfad', () => {
    expect(PORTAL_ADMIN_LINKS).toEqual([
      {
        id: 'auditlog',
        to: '/auditlog',
        label: 'Audit-Log',
        description: 'Protokoll aller Systemaktionen',
      },
    ])
  })

  it('ist nur für Admin sichtbar, nicht für Sachbearbeiter oder Genehmiger', () => {
    expect(visiblePortalAdminLinks(true).map(link => link.id)).toEqual(['auditlog'])
    expect(visiblePortalAdminLinks(false)).toEqual([])
  })

  it('ist kein Portal-App-Eintrag', () => {
    expect(PORTAL_APPS.map(app => app.id)).not.toContain('auditlog')
  })
})
