import { describe, it, expect } from 'vitest'
import {
  PORTAL_APPS,
  activePortalApps,
  comingSoonPortalApps,
  isActivePortalApp,
  isComingSoonPortalApp,
  type PortalApp,
} from './portalApps'

describe('PORTAL_APPS', () => {
  it('führt Bekleidung als aktive App', () => {
    const bekleidung = PORTAL_APPS.find(app => app.id === 'bekleidung')
    expect(bekleidung).toBeDefined()
    expect(bekleidung?.status).toBe('active')
    if (bekleidung && isActivePortalApp(bekleidung)) {
      expect(bekleidung.path).toBe('/dashboard')
    }
  })

  it('führt eine aktive Kachel Einsatzmittel & Training nach /einsatz', () => {
    const app = PORTAL_APPS.find(a => a.id === 'einsatz_mt')
    expect(app).toBeDefined()
    expect(app?.title).toBe('Einsatzmittel & Training')
    expect(app?.status).toBe('active')
    if (app && isActivePortalApp(app)) {
      expect(app.path).toBe('/einsatz')
    }
    expect(PORTAL_APPS.map(a => a.id)).toEqual(['bekleidung', 'einsatz_mt'])
  })
})

describe('activePortalApps / comingSoonPortalApps', () => {
  const mixed: readonly PortalApp[] = [
    { id: 'bekleidung', title: 'Bekleidung', description: 'aktiv', path: '/dashboard', status: 'active' },
    { id: 'einsatz_mt', title: 'Einsatzmittel & Training', description: '', path: '/einsatz', status: 'active' },
  ]

  it('filtert nur aktive Apps mit Pfad', () => {
    const active = activePortalApps(mixed)
    expect(active).toHaveLength(2)
    expect(active.every(isActivePortalApp)).toBe(true)
    expect(active.map(app => app.id)).toEqual(['bekleidung', 'einsatz_mt'])
  })

  it('filtert coming_soon Apps ohne Navigation', () => {
    const withSoon: readonly PortalApp[] = [
      ...mixed,
      { id: 'einsatz_mt', title: 'folgt-test', description: '', path: null, status: 'coming_soon' },
    ]
    const soon = comingSoonPortalApps(withSoon)
    expect(soon).toHaveLength(1)
    expect(soon.every(isComingSoonPortalApp)).toBe(true)
  })

  it('wendet denselben Filter auf die Portal-Konfig an', () => {
    expect(activePortalApps().map(app => app.id)).toEqual(['bekleidung', 'einsatz_mt'])
    expect(comingSoonPortalApps()).toEqual([])
    expect(activePortalApps().length + comingSoonPortalApps().length).toBe(PORTAL_APPS.length)
  })
})
