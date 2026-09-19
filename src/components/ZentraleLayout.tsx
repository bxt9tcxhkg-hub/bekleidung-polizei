import { BookOpen, ClipboardList, LayoutGrid, MapPin, Radio, ShieldAlert, UserRoundCheck } from 'lucide-react'
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
      { to: '/stammdaten/kontakte', label: 'Kontakte', icon: UserRoundCheck },
      // Telefonnummern bewusst kein eigener Sidebar-Punkt hier - die Kachel
      // "Wichtige Telefonnummern" auf der Zentrale-Hauptseite deckt das
      // Nachschlagen bereits ab (ZentraleUebersicht.tsx); Pflege weiterhin
      // über /stammdaten/telefonnummern.
      { to: '/zentrale/unterlagen', label: 'Unterlagen', icon: BookOpen },
      { to: '/zentrale/strassenzustand', label: 'Straßenzustand', icon: MapPin },
    ]),
    // Kontrollaufträge anlegen/ändern/löschen ist per RLS auf den Genehmiger
    // beschränkt (Kommandant entscheidet) - dieselbe Seitenkomponente wie im
    // Außendienst (KontrollauftraegePage.tsx, keine eigene Kopie), aber unter
    // einer eigenen /zentrale-Route eingehängt, damit der Genehmiger dafür
    // nicht in die Außendienst-Navigation wechseln muss.
    ...genehmigerSection(isGenehmiger, [{ to: '/zentrale/kontrollauftraege', label: 'Kontrollaufträge', icon: ClipboardList }]),
  ]

  const footerLine = [
    isStrictAdmin ? null : profile?.dienstgrad,
    ...sidebarRoleLabels({ isAdmin: isStrictAdmin, isSachbearbeiter: isSachbearbeiterHere, isGenehmiger }),
    profile?.dienstnummer ? `DNr. ${profile.dienstnummer}` : null,
  ].filter(Boolean).join(' · ')

  return <PortalSidebarShell areaTagline="Zentrale" mobileTitle="Zentrale" sections={sections} footerLine={footerLine} />
}
