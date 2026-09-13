import { AlertTriangle, BellRing, BookOpen, Building2, ClipboardList, Construction, Contact, KeyRound, LayoutGrid, Mail, MapPin, Radio, Search, ShieldAlert, UserRoundCheck, Users } from 'lucide-react'
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
      { to: '/zentrale/einsaetze', label: 'Einsätze', icon: ClipboardList },
      { to: '/zentrale/lage', label: 'Operative Lage', icon: AlertTriangle },
      { to: '/zentrale/av-bv-ev', label: 'AV/BV & EV', icon: ShieldAlert },
      { to: '/zentrale/personenhinweise', label: 'Personenhinweise', icon: UserRoundCheck },
      { to: '/zentrale/fahndungen', label: 'Fahndungen', icon: Search },
      // Dieselbe Seite wie unter Außendienst/Innendienst - keine eigene Kopie mehr (siehe ZentraleRsaRsb-Entfernung).
      { to: '/rsa-rsb', label: 'RSa/RSb', icon: Mail },
      { to: '/zentrale/schluessel', label: 'Schlüssel', icon: KeyRound },
      { to: '/zentrale/kontakte', label: 'Kontakte', icon: Contact },
      { to: '/zentrale/alarmierung', label: 'Alarmierung', icon: BellRing },
      { to: '/zentrale/unterlagen', label: 'Unterlagen', icon: BookOpen },
      { to: '/zentrale/personen', label: 'Personen', icon: Users },
      { to: '/zentrale/objekte', label: 'Objekte', icon: Building2 },
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
