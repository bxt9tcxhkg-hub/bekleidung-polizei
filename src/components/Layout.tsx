import {
  LayoutDashboard, LayoutGrid, ShoppingCart, ShoppingBag, Package,
  CalendarRange, Warehouse, BarChart3, BookOpen,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { sidebarRoleLabels } from '../lib/authRoles'
import { genehmigerSection, meinBereichSection, sachbearbeiterSection, type NavSection } from '../lib/sidebarSections'
import { PortalSidebarShell } from './PortalSidebar'

export default function Layout() {
  const { profile, isAdmin, isSachbearbeiter, isGenehmiger } = useAuth()

  const sections: NavSection[] = [
    meinBereichSection([
      { to: '/', label: 'Portal', icon: LayoutGrid },
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/warenkorb', label: 'Bekleidung bestellen', icon: ShoppingCart },
      { to: '/meine-bestellungen', label: 'Meine Bestellungen', icon: ShoppingBag },
    ]),
    ...sachbearbeiterSection(isSachbearbeiter, [
      { to: '/bestellungen', label: 'Bestellungen', icon: Package },
      { to: '/lager', label: 'Lagerverwaltung', icon: Warehouse },
      { to: '/analyse', label: 'Analyse', icon: BarChart3 },
      { to: '/grundausstattung', label: 'Grundausstattung', icon: BookOpen },
      { to: '/produkte', label: 'Produkte', icon: Package },
      { to: '/quartale', label: 'Quartale', icon: CalendarRange },
    ]),
    // Analyse steht schon im Sachbearbeiter-Abschnitt - hier nur zusätzlich, falls jemand ausschließlich Genehmiger ist.
    ...genehmigerSection(isGenehmiger, !isSachbearbeiter ? [{ to: '/analyse', label: 'Analyse', icon: BarChart3 }] : []),
  ]

  const footerLine = [
    isAdmin ? null : profile?.dienstgrad,
    ...sidebarRoleLabels({ isAdmin, isSachbearbeiter, isGenehmiger }),
    profile?.dienstnummer ? `DNr. ${profile.dienstnummer}` : null,
  ].filter(Boolean).join(' · ')

  return <PortalSidebarShell mobileTitle="Stadtpolizei Dornbirn" sections={sections} footerLine={footerLine} />
}
