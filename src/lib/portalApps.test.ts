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
  it('führt Bekleidung als aktive App für alle Angemeldeten', () => {
    const bekleidung = PORTAL_APPS.find(app => app.id === 'bekleidung')
    expect(bekleidung).toBeDefined()
    expect(bekleidung?.status).toBe('active')
    if (bekleidung && isActivePortalApp(bekleidung)) {
      expect(bekleidung.path).toBe('/dashboard')
    }
  })

  it('führt Einsatztraining und Einsatzmittel als coming_soon ohne Pfad', () => {
    for (const id of ['einsatztraining', 'einsatzmittel'] as const) {
      const app = PORTAL_APPS.find(a => a.id === id)
      expect(app).toBeDefined()
      expect(app?.status).toBe('coming_soon')
      if (app && isComingSoonPortalApp(app)) {
        expect(app.path).toBeNull()
      }
    }
  })
})

describe('activePortalApps / comingSoonPortalApps', () => {
  const mixed: readonly PortalApp[] = [
    { id: 'bekleidung', title: 'Bekleidung', description: 'aktiv', path: '/dashboard', status: 'active' },
    { id: 'einsatztraining', title: 'Einsatztraining', description: '', path: null, status: 'coming_soon' },
    { id: 'einsatzmittel', title: 'Einsatzmittel', description: '', path: null, status: 'coming_soon' },
  ]

  it('filtert nur aktive Apps mit Pfad', () => {
    const active = activePortalApps(mixed)
    expect(active).toHaveLength(1)
    expect(active.every(isActivePortalApp)).toBe(true)
    expect(active.map(app => app.id)).toEqual(['bekleidung'])
    expect(active[0].path).toBe('/dashboard')
  })

  it('filtert nur coming_soon Apps ohne Navigation', () => {
    const soon = comingSoonPortalApps(mixed)
    expect(soon).toHaveLength(2)
    expect(soon.every(isComingSoonPortalApp)).toBe(true)
    expect(soon.every(app => app.path === null)).toBe(true)
    expect(soon.map(app => app.id)).toEqual(['einsatztraining', 'einsatzmittel'])
  })

  it('wendet denselben Filter auf den Konfig-Stub an', () => {
    expect(activePortalApps().map(app => app.id)).toEqual(['bekleidung'])
    expect(comingSoonPortalApps().map(app => app.id)).toEqual(['einsatztraining', 'einsatzmittel'])
    expect(activePortalApps().length + comingSoonPortalApps().length).toBe(PORTAL_APPS.length)
  })
})
