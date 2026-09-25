import { LayoutDashboard, LayoutGrid } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { sidebarRoleLabels } from '../lib/authRoles'
import { GENEHMIGER_BEKLEIDUNG_ITEMS, genehmigerSection, meinBereichSection, type NavSection } from '../lib/sidebarSections'
import { PortalSidebarShell } from './PortalSidebar'

// Eigenes, schlankes Layout für die portalweiten Genehmiger-Seiten (Freigaben,
// Budgetverwaltung, Schuherstattungen). Liefen diese Seiten bislang unter dem
// Bekleidung-Layout mit, zeigte "Mein Bereich" dort fälschlich Bekleidung-
// Bestellfunktionen ("Bekleidung bestellen", "Meine Bestellungen"), die mit
// der bereichsübergreifenden Prüfung nichts zu tun haben - "Freigaben"
// bündelt z. B. auch offene Einsatzmittel- und Schulungs-Fälle.
// GENEHMIGER_BEKLEIDUNG_ITEMS (Budgetverwaltung/Schuherstattungen) werden hier
// bewusst als Zusatzpunkte eingehängt statt über GENEHMIGER_ITEMS - sonst
// würden sie in JEDEM Bereich (Zentrale, Einsatzmittel, ...) im Genehmiger-Menü
// auftauchen, obwohl sie reine Bekleidung-Themen sind.
export default function GenehmigerLayout() {
  const { profile, isAdmin, isSachbearbeiter, isGenehmiger } = useAuth()

  const sections: NavSection[] = [
    meinBereichSection([
      { to: '/', label: 'Portal', icon: LayoutGrid },
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ]),
    ...genehmigerSection(isGenehmiger, GENEHMIGER_BEKLEIDUNG_ITEMS),
  ]

  const footerLine = [
    isAdmin ? null : profile?.dienstgrad,
    ...sidebarRoleLabels({ isAdmin, isSachbearbeiter, isGenehmiger }),
    profile?.dienstnummer ? `DNr. ${profile.dienstnummer}` : null,
  ].filter(Boolean).join(' · ')

  return <PortalSidebarShell areaTagline="Genehmigungen" mobileTitle="Genehmigungen" sections={sections} footerLine={footerLine} />
}
