import { describe, it, expect } from 'vitest'
import { PORTAL_APPS } from './portalApps'
import { PORTAL_ACCOUNT_LINKS } from './portalAccount'

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
