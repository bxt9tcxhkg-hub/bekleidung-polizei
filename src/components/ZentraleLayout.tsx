import { BookOpen, Construction, LayoutGrid, MapPin, Radio, Search, ShieldAlert, UserRoundCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { sidebarRoleLabels } from '../lib/authRoles'
import { isAreaManager } from '../lib/portalEntitlements'
import { genehmigerSection, meinBereichSection, type NavSection } from '../lib/sidebarSections'
import { PortalSidebarShell } from './PortalSidebar'

export default function ZentraleLayout() {
  const { profile, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const isSachbearbeiterHere = isAreaManager(areaRoles, 'zentrale', operativeModeActive)

  const sections: NavSection[] = [
    meinBereichSection([
      { to: '/', label: 'Portal', icon: LayoutGrid },
      { to: '/zentrale', label: 'Zentrale', icon: Radio },
      { to: '/zentrale/av-bv-ev', label: 'BV/AV & EV', icon: ShieldAlert },
      { to: '/zentrale/personenhinweise', label: 'Personenhinweise', icon: UserRoundCheck },
      { to: '/zentrale/fahndungen', label: 'Fahndungen', icon: Search },
      { to: '/stammdaten/kontakte', label: 'Kontakte', icon: UserRoundCheck },
      { to: '/zentrale/unterlagen', label: 'Unterlagen', icon: BookOpen },
      { to: '/zentrale/strassenzustand', label: 'Straßenzustand', icon: MapPin },
      { to: '/zentrale/baustellen', label: 'Baustellen', icon: Construction },
    ]),
    ...genehmigerSection(isGenehmiger),
  ]

  const footerLine = [
    isStrictAdmin ? null : profile?.dienstgrad,
    ...sidebarRoleLabels({ isAdmin: isStrictAdmin, isSachbearbeiter: isSachbearbeiterHere, isGenehmiger }),
    profile?.dienstnummer ? `DNr. ${profile.dienstnummer}` : null,
  ].filter(Boolean).join(' · ')

  return <PortalSidebarShell areaTagline="Zentrale" mobileTitle="Zentrale" sections={sections} footerLine={footerLine} />
}
