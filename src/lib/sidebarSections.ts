import { CheckSquare, Clock3, Footprints, Wallet } from 'lucide-react'

// Bausteine für die Seitenmenüs aller Bereiche (Vorlage: Bekleidung) - siehe
// components/PortalSidebar.tsx für die eigentliche Render-Komponente. Als
// eigene .ts-Datei ausgelagert, weil react-refresh/only-export-components
// verlangt, dass eine Komponentendatei ausschließlich Komponenten exportiert.

export interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  /** Bleibt auch auf verschachtelten Routen aktiv markiert (z. B. /fuhrpark/:id unter "Fahrzeuge"). Default: nur exakte Übereinstimmung. */
  isActive?: (pathname: string) => boolean
  /** Kleines Zusatz-Icon am Zeilenende, z. B. Hinweis auf eine zusätzliche Berechtigung innerhalb derselben Seite. */
  badge?: React.ElementType
}

export interface NavSection {
  key: string
  label: string
  color: string
  items: NavItem[]
}

export const SECTION_META = {
  user: { label: 'Mein Bereich', color: 'text-blue-300' },
  sachbearbeiter: { label: 'Sachbearbeiter', color: 'text-orange-300' },
  genehmiger: { label: 'Genehmiger', color: 'text-green-300' },
} as const

/** Portalweite Genehmiger-Werkzeuge - überall gleich erreichbar, unabhängig davon, in welchem Bereich man sich gerade befindet. */
export const GENEHMIGER_ITEMS: NavItem[] = [
  { to: '/genehmigungen', label: 'Freigaben', icon: CheckSquare },
  { to: '/budgets', label: 'Budgetverwaltung', icon: Wallet },
  { to: '/schuherstattungen', label: 'Schuherstattungen', icon: Footprints },
  // Eigene Seite (Ueberstunden.tsx), nicht Teil von Approvals.tsx - dort steht
  // sowohl die eigene Meldung als auch (nur für Genehmiger sichtbar) der
  // Abschnitt "Zu entscheiden". Ohne diesen Eintrag war der Entscheidungsteil
  // nur über den identisch benannten "Mein Bereich"-Link erreichbar, obwohl
  // "Genehmigungen" (Freigaben) genau das für alle anderen Antragsarten bündelt.
  { to: '/ueberstunden', label: 'Überstundenmeldungen', icon: Clock3 },
]

/** Baut den Genehmiger-Abschnitt (nur sichtbar, wenn isGenehmiger) - optional mit bereichseigenen Zusatzpunkten. */
export function genehmigerSection(isGenehmiger: boolean, extraItems: NavItem[] = []): NavSection[] {
  if (!isGenehmiger) return []
  return [{ key: 'genehmiger', ...SECTION_META.genehmiger, items: [...GENEHMIGER_ITEMS, ...extraItems] }]
}

export function meinBereichSection(items: NavItem[]): NavSection {
  return { key: 'user', ...SECTION_META.user, items }
}

export function sachbearbeiterSection(show: boolean, items: NavItem[]): NavSection[] {
  return show ? [{ key: 'sachbearbeiter', ...SECTION_META.sachbearbeiter, items }] : []
}
