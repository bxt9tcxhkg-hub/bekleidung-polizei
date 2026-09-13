import { BookOpen, LayoutGrid, Mail, Shield } from 'lucide-react'
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
      // Dieselben Seiten wie unter Zentrale/RSa-RSb bzw. Unterlagen - keine
      // eigene Kopie, nur bequem von hier erreichbar.
      { to: '/rsa-rsb', label: 'RSa/RSb', icon: Mail },
      { to: '/zentrale/unterlagen', label: 'Kontrollbehelfe', icon: BookOpen },
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
