export type PortalAccountId = 'profil' | 'hilfe'
export type PortalAdminId = 'auditlog'

export type PortalAccountLink = {
  id: PortalAccountId
  to: string
  label: string
  description: string
}

export type PortalAdminLink = {
  id: PortalAdminId
  to: string
  label: string
  description: string
}

/**
 * Portal-Einträge ausserhalb der Fach-Apps.
 * Pfade bleiben /profil und /hilfe; Einstieg ist das Portal, nicht Bekleidung.
 */
export const PORTAL_ACCOUNT_LINKS: readonly PortalAccountLink[] = [
  {
    id: 'profil',
    to: '/profil',
    label: 'Mein Profil',
    description: 'Persönliche Daten bearbeiten',
  },
  {
    id: 'hilfe',
    to: '/hilfe',
    label: 'Hilfe',
    description: 'Anfragen an die Verwaltung',
  },
]

/**
 * Nur Admin (isAdmin / isStrictAdmin). Nicht für Sachbearbeiter oder Genehmiger.
 * Pfad bleibt /auditlog; Einstieg ist das Portal, nicht Bekleidung.
 */
export const PORTAL_ADMIN_LINKS: readonly PortalAdminLink[] = [
  {
    id: 'auditlog',
    to: '/auditlog',
    label: 'Audit-Log',
    description: 'Protokoll aller Systemaktionen',
  },
]

export function visiblePortalAdminLinks(isAdmin: boolean): readonly PortalAdminLink[] {
  return isAdmin ? PORTAL_ADMIN_LINKS : []
}
