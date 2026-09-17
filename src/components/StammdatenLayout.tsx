import { Building2, Construction, Contact, KeyRound, LayoutGrid, Search, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { sidebarRoleLabels } from '../lib/authRoles'
import type { NavSection } from '../lib/sidebarSections'
import { PortalSidebarShell } from './PortalSidebar'

export default function StammdatenLayout() {
  const { profile, isStrictAdmin, isSachbearbeiter, isGenehmiger } = useAuth()

  const sections: NavSection[] = [
    {
      key: 'stammdaten',
      label: isStrictAdmin ? 'Administration' : 'Nachschlagewerke',
      color: 'text-blue-300',
      items: [
        { to: '/', label: 'Portal', icon: LayoutGrid },
        { to: '/stammdaten/schluessel', label: 'Schlüssel', icon: KeyRound },
        { to: '/stammdaten/kontakte', label: 'Kontakte', icon: Contact },
        { to: '/stammdaten/personen', label: 'Personen', icon: Users },
        { to: '/stammdaten/objekte', label: 'Objekte', icon: Building2 },
        { to: '/stammdaten/fahndungen', label: 'Fahndungen', icon: Search },
        { to: '/stammdaten/baustellen', label: 'Baustellen', icon: Construction },
      ],
    },
  ]

  const footerLine = [
    isStrictAdmin ? null : profile?.dienstgrad,
    ...sidebarRoleLabels({ isAdmin: isStrictAdmin, isSachbearbeiter, isGenehmiger }),
    profile?.dienstnummer ? `DNr. ${profile.dienstnummer}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <PortalSidebarShell
      areaTagline="Stammdaten"
      mobileTitle="Stammdaten & Nachschlagewerke"
      sections={sections}
      footerLine={footerLine}
    />
  )
}
