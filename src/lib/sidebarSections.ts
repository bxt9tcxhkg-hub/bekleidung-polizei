import { CheckSquare, Footprints, Wallet } from 'lucide-react'

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

/** Portalweite Genehmiger-Werkzeuge - überall gleich erreichbar, unabhängig davon, in welchem Bereich man sich gerade befindet.
 * "Freigaben" ist die einzige Entscheidungs-Warteschlange (bündelt inzwischen auch die
 * Überstundenmeldungen, siehe Approvals.tsx) - Budgetverwaltung/Schuherstattungen sind
 * bewusst reine Verwaltungs-/Historien-Werkzeuge ohne eigene Entscheidungsfunktion mehr
 * (die wurde aus ShoeRefunds.tsx entfernt, um nicht zwei Orte für dieselbe Entscheidung
 * zu haben). Ein eigener Link zu Ueberstunden.tsx gehört nicht hierher - die eigene
 * Meldung erfassen kann jede/r, das ist keine Genehmiger-exklusive Funktion (siehe
 * Portal.tsx, Kachel "Überstundenmeldung" unter "Mein Bereich"). */
export const GENEHMIGER_ITEMS: NavItem[] = [
  { to: '/genehmigungen', label: 'Freigaben', icon: CheckSquare },
  { to: '/budgets', label: 'Budgetverwaltung', icon: Wallet },
  { to: '/schuherstattungen', label: 'Schuherstattungen', icon: Footprints },
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
