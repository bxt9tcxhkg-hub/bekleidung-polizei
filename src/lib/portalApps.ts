export type PortalAppStatus = 'active' | 'coming_soon'

export type PortalAppId = 'bekleidung' | 'einsatz_mt'

type PortalAppBase = {
  id: PortalAppId
  title: string
  /** Kurztext; bei coming_soon leer lassen — kein erfundener Funktionsumfang. */
  description: string
}

export type ActivePortalApp = PortalAppBase & {
  status: 'active'
  path: string
}

export type ComingSoonPortalApp = PortalAppBase & {
  status: 'coming_soon'
  path: null
}

export type PortalApp = ActivePortalApp | ComingSoonPortalApp

/**
 * Portal-Kacheln. Sichtbarkeit je Entitlement (siehe portalEntitlements):
 * Bekleidung bei bekleidung-Recht, Einsatzmittel & Training bei einsatz_mt-Recht.
 * Admin sieht immer beide. Eine Kachel einsatz_mt, zwei Unterbereiche in /einsatz.
 */
export const PORTAL_APPS: readonly PortalApp[] = [
  {
    id: 'bekleidung',
    title: 'Bekleidung',
    description: 'Bestellung und Verwaltung der Dienstbekleidung',
    path: '/dashboard',
    status: 'active',
  },
  {
    id: 'einsatz_mt',
    title: 'Einsatzmittel & Training',
    description: '',
    path: '/einsatz',
    status: 'active',
  },
]

export function isActivePortalApp(app: PortalApp): app is ActivePortalApp {
  return app.status === 'active'
}

export function isComingSoonPortalApp(app: PortalApp): app is ComingSoonPortalApp {
  return app.status === 'coming_soon'
}

export function activePortalApps(apps: readonly PortalApp[] = PORTAL_APPS): ActivePortalApp[] {
  return apps.filter(isActivePortalApp)
}

export function comingSoonPortalApps(apps: readonly PortalApp[] = PORTAL_APPS): ComingSoonPortalApp[] {
  return apps.filter(isComingSoonPortalApp)
}
