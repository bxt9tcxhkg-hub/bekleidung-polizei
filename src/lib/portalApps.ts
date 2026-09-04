export type PortalAppStatus = 'active' | 'coming_soon'

export type PortalAppId = 'bekleidung' | 'einsatztraining' | 'einsatzmittel'

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
 * Konfig-Stub: welche Apps im Portal sichtbar sind.
 * Keine Rollenmatrix — Bekleidung ist für alle Angemeldeten aktiv.
 * Entitlements kann der Owner später nachliefern.
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
    id: 'einsatztraining',
    title: 'Einsatztraining',
    description: '',
    path: null,
    status: 'coming_soon',
  },
  {
    id: 'einsatzmittel',
    title: 'Einsatzmittel',
    description: '',
    path: null,
    status: 'coming_soon',
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
