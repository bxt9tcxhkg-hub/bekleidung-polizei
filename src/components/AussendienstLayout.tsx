import { BookOpen, Car, ClipboardList, LayoutGrid, Mail, Radio, Shield, UserRoundCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { sidebarRoleLabels } from '../lib/authRoles'
import { genehmigerSection, meinBereichSection, type NavSection } from '../lib/sidebarSections'
import { PortalSidebarShell } from './PortalSidebar'

export default function AussendienstLayout() {
  const { profile, isStrictAdmin, isGenehmiger } = useAuth()

  const sections: NavSection[] = [
    meinBereichSection([
      { to: '/', label: 'Portal', icon: LayoutGrid },
      { to: '/aussendienst', label: 'Außendienst / Streife', icon: Shield },
      { to: '/aussendienst/einsaetze', label: 'Einsätze', icon: Radio },
      { to: '/aussendienst/kontrollauftraege', label: 'Kontrollaufträge', icon: ClipboardList },
      { to: '/aussendienst/rsa-rsb', label: 'RSa/RSb', icon: Mail },
      { to: '/aussendienst/schutzmassnahmen', label: 'Schutzmaßnahmen', icon: UserRoundCheck },
      { to: '/aussendienst/fahrzeug', label: 'Fahrzeug', icon: Car },
      // Eigener Bestand, getrennt von den Unterlagen der Zentrale (gleiche
      // Tabelle, aber per bereich-Spalte getrennte Inhalte - siehe
      // UnterlagenRegister.tsx). RSa/RSb ist kein Außendienst-Unterpunkt,
      // sondern bereichsübergreifend und hat eine eigene Portal-Kachel.
      { to: '/aussendienst/kontrollbehelfe', label: 'Kontrollbehelfe', icon: BookOpen },
    ]),
    ...genehmigerSection(isGenehmiger),
  ]

  // Außendienst kennt keine eigene Sachbearbeiter-Zwischenrolle - nur Admin/Genehmiger/Benutzer.
  const footerLine = [
    isStrictAdmin ? null : profile?.dienstgrad,
    ...sidebarRoleLabels({ isAdmin: isStrictAdmin, isSachbearbeiter: false, isGenehmiger }),
    profile?.dienstnummer ? `DNr. ${profile.dienstnummer}` : null,
  ].filter(Boolean).join(' · ')

  return <PortalSidebarShell areaTagline="Außendienst / Streife" mobileTitle="Außendienst" sections={sections} footerLine={footerLine} />
}
