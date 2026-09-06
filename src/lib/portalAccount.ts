export type PortalAccountId = 'profil' | 'hilfe'

export type PortalAccountLink = {
  id: PortalAccountId
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
