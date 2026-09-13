import { AlertTriangle, Car, CalendarDays, FileText, LayoutGrid, Sparkles, Wrench } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { sidebarRoleLabels } from '../lib/authRoles'
import { isAreaManager } from '../lib/portalEntitlements'
import { genehmigerSection, meinBereichSection, sachbearbeiterSection, type NavItem, type NavSection } from '../lib/sidebarSections'
import { PortalSidebarShell } from './PortalSidebar'

const OFFENE_PUNKTE_ITEM: NavItem = { to: '/fuhrpark/offen', label: 'Offene Punkte', icon: AlertTriangle }

export default function FuhrparkLayout() {
  const { profile, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const isSachbearbeiterHere = isStrictAdmin || isAreaManager(areaRoles, 'fuhrpark', operativeModeActive)

  const sections: NavSection[] = [
    meinBereichSection([
      { to: '/', label: 'Portal', icon: LayoutGrid },
      {
        to: '/fuhrpark',
        label: 'Fahrzeuge',
        icon: Car,
        isActive: pathname => pathname === '/fuhrpark' || (pathname.startsWith('/fuhrpark/') && !['/fuhrpark/offen', '/fuhrpark/maengel', '/fuhrpark/pflege', '/fuhrpark/werkstatt', '/fuhrpark/fristen', '/fuhrpark/dokumente'].includes(pathname)),
      },
      // Vormals Tabs auf der einzelnen Fahrzeugseite - jetzt fahrzeugübergreifend hier, wie der Rest der Anwendung.
      { to: '/fuhrpark/maengel', label: 'Offene Mängel', icon: AlertTriangle },
      { to: '/fuhrpark/pflege', label: 'Reinigung & Pflege', icon: Sparkles },
      { to: '/fuhrpark/werkstatt', label: 'Werkstatt & Termine', icon: Wrench },
      { to: '/fuhrpark/fristen', label: 'Fristen', icon: CalendarDays },
      { to: '/fuhrpark/dokumente', label: 'Dokumente', icon: FileText },
    ]),
    ...sachbearbeiterSection(isSachbearbeiterHere, [OFFENE_PUNKTE_ITEM]),
    // "Offene Punkte" nur zusätzlich für Genehmiger anzeigen, die nicht ohnehin schon den Sachbearbeiter-Abschnitt sehen.
    ...genehmigerSection(isGenehmiger, isSachbearbeiterHere ? [] : [OFFENE_PUNKTE_ITEM]),
  ]

  const footerLine = [
    isStrictAdmin ? null : profile?.dienstgrad,
    ...sidebarRoleLabels({ isAdmin: isStrictAdmin, isSachbearbeiter: isSachbearbeiterHere, isGenehmiger }),
    profile?.dienstnummer ? `DNr. ${profile.dienstnummer}` : null,
  ].filter(Boolean).join(' · ')

  return <PortalSidebarShell areaTagline="Fuhrpark & Fahrzeuge" mobileTitle="Fuhrpark & Fahrzeuge" sections={sections} footerLine={footerLine} />
}
