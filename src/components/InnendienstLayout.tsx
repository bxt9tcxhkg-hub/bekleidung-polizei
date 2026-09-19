import { BookOpen, Building2, ClipboardList, FileClock, LayoutGrid, Phone, Receipt } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { sidebarRoleLabels } from '../lib/authRoles'
import { isAreaManager } from '../lib/portalEntitlements'
import { genehmigerSection, meinBereichSection, type NavSection } from '../lib/sidebarSections'
import { PortalSidebarShell } from './PortalSidebar'

export default function InnendienstLayout() {
  const { profile, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const isSachbearbeiterHere = isStrictAdmin || isAreaManager(areaRoles, 'zentrale')

  const sections: NavSection[] = [
    meinBereichSection([
      { to: '/', label: 'Portal', icon: LayoutGrid },
      { to: '/innendienst', label: 'Innendienst', icon: Building2 },
      { to: '/innendienst/bescheide', label: 'Bescheide & Verstöße', icon: ClipboardList },
      { to: '/innendienst/uebergabe', label: 'Schichtübergabe', icon: FileClock },
      { to: '/innendienst/gebuehren', label: 'Gebührenordnung', icon: Receipt },
      // Eigener Bestand, getrennt von den Unterlagen der Zentrale (gleiche
      // Tabelle, aber per bereich-Spalte getrennte Inhalte - siehe
      // UnterlagenRegister.tsx). RSa/RSb ist kein Innendienst-Unterpunkt,
      // sondern bereichsübergreifend und hat eine eigene Portal-Kachel.
      { to: '/innendienst/unterlagen', label: 'Unterlagen', icon: BookOpen },
      { to: '/stammdaten/telefonnummern', label: 'Telefonnummern', icon: Phone },
    ]),
    ...genehmigerSection(isGenehmiger),
  ]

  const footerLine = [
    isStrictAdmin ? null : profile?.dienstgrad,
    ...sidebarRoleLabels({ isAdmin: isStrictAdmin, isSachbearbeiter: isSachbearbeiterHere, isGenehmiger }),
    profile?.dienstnummer ? `DNr. ${profile.dienstnummer}` : null,
  ].filter(Boolean).join(' · ')

  return <PortalSidebarShell areaTagline="Innendienst" mobileTitle="Innendienst" sections={sections} footerLine={footerLine} />
}
