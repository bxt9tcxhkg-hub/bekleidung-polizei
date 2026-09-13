import { BellRing, BookOpen, Building2, Contact, FileClock, KeyRound, LayoutGrid, Radio, Search, ShieldAlert, UserRoundCheck, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { sidebarRoleLabels } from '../lib/authRoles'
import { isAreaManager } from '../lib/portalEntitlements'
import { genehmigerSection, meinBereichSection, type NavSection } from '../lib/sidebarSections'
import { PortalSidebarShell } from './PortalSidebar'

export default function ZentraleLayout() {
  const { profile, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const isSachbearbeiterHere = isAreaManager(areaRoles, 'zentrale')

  const sections: NavSection[] = [
    meinBereichSection([
      { to: '/', label: 'Portal', icon: LayoutGrid },
      { to: '/zentrale', label: 'Zentrale', icon: Radio },
      { to: '/zentrale/av-bv-ev', label: 'AV/BV & EV', icon: ShieldAlert },
      { to: '/zentrale/personenhinweise', label: 'Personenhinweise', icon: UserRoundCheck },
      { to: '/zentrale/fahndungen', label: 'Fahndungen', icon: Search },
      { to: '/zentrale/rsa-rsb', label: 'RSa/RSb', icon: FileClock },
      { to: '/zentrale/schluessel', label: 'Schlüssel', icon: KeyRound },
      { to: '/zentrale/kontakte', label: 'Kontakte', icon: Contact },
      { to: '/zentrale/alarmierung', label: 'Alarmierung', icon: BellRing },
      { to: '/zentrale/unterlagen', label: 'Unterlagen', icon: BookOpen },
      { to: '/zentrale/personen', label: 'Personen', icon: Users },
      { to: '/zentrale/objekte', label: 'Objekte', icon: Building2 },
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
