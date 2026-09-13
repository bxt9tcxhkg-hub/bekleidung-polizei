import { LayoutGrid, Mail } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { sidebarRoleLabels } from '../lib/authRoles'
import { isAreaManager } from '../lib/portalEntitlements'
import { genehmigerSection, meinBereichSection, type NavSection } from '../lib/sidebarSections'
import { PortalSidebarShell } from './PortalSidebar'

export default function RsaRsbLayout() {
  const { profile, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const isSachbearbeiterHere = isStrictAdmin || isAreaManager(areaRoles, 'zentrale', operativeModeActive)

  const sections: NavSection[] = [
    meinBereichSection([
      { to: '/', label: 'Portal', icon: LayoutGrid },
      { to: '/rsa-rsb', label: 'RSa/RSb & Vernehmungen', icon: Mail },
    ]),
    ...genehmigerSection(isGenehmiger),
  ]

  const footerLine = [
    isStrictAdmin ? null : profile?.dienstgrad,
    ...sidebarRoleLabels({ isAdmin: isStrictAdmin, isSachbearbeiter: isSachbearbeiterHere, isGenehmiger }),
    profile?.dienstnummer ? `DNr. ${profile.dienstnummer}` : null,
  ].filter(Boolean).join(' · ')

  return <PortalSidebarShell areaTagline="RSa/RSb & Vernehmungen" mobileTitle="RSa/RSb" sections={sections} footerLine={footerLine} />
}
