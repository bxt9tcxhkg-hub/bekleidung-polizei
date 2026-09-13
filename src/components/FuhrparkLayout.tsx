import { AlertTriangle, Car, LayoutGrid } from 'lucide-react'
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
        isActive: pathname => pathname === '/fuhrpark' || (pathname.startsWith('/fuhrpark/') && pathname !== '/fuhrpark/offen'),
      },
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
