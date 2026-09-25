import { LayoutDashboard, LayoutGrid } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { sidebarRoleLabels } from '../lib/authRoles'
import { genehmigerSection, meinBereichSection, type NavSection } from '../lib/sidebarSections'
import { PortalSidebarShell } from './PortalSidebar'

// Eigenes, schlankes Layout für die Genehmigungen-Kachel-Übersicht und ihre
// vier Bereichsseiten. Zeigt bewusst nur "Freigaben" im Genehmiger-Menü,
// genau wie jeder andere Bereich (Zentrale, Einsatzmittel, ...) - der
// Genehmiger soll seine gesamte Arbeit auf dieser einen Kachel-Übersicht
// erledigen, ohne dass die Sidebar mit Budgetverwaltung/Schuherstattungen
// (reine Bekleidung-Verwaltungswerkzeuge, kein Entscheidungs-Posteingang)
// eine zweite, konkurrierende Navigation aufmacht. Diese beiden sind stattdessen
// als Links auf der Bekleidung-Bereichsseite selbst verlinkt (siehe
// GenehmigungenBekleidung.tsx).
export default function GenehmigerLayout() {
  const { profile, isAdmin, isSachbearbeiter, isGenehmiger } = useAuth()

  const sections: NavSection[] = [
    meinBereichSection([
      { to: '/', label: 'Portal', icon: LayoutGrid },
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ]),
    ...genehmigerSection(isGenehmiger),
  ]

  const footerLine = [
    isAdmin ? null : profile?.dienstgrad,
    ...sidebarRoleLabels({ isAdmin, isSachbearbeiter, isGenehmiger }),
    profile?.dienstnummer ? `DNr. ${profile.dienstnummer}` : null,
  ].filter(Boolean).join(' · ')

  return <PortalSidebarShell areaTagline="Genehmigungen" mobileTitle="Genehmigungen" sections={sections} footerLine={footerLine} />
}
