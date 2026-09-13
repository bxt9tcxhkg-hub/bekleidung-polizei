import { BookOpen, ClipboardCheck, LayoutDashboard, LayoutGrid, Shield, Target } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { sidebarRoleLabels } from '../lib/authRoles'
import { canManagePersonalEinsatzmittel } from '../lib/personalEinsatzmittel'
import { isAreaManager } from '../lib/portalEntitlements'
import { genehmigerSection, meinBereichSection, type NavSection } from '../lib/sidebarSections'
import { PortalSidebarShell } from './PortalSidebar'

export default function EinsatzLayout() {
  const { profile, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const canManage = canManagePersonalEinsatzmittel({ isStrictAdmin, isGenehmiger, rows: areaRoles, operativeModeActive })
  const isSachbearbeiterHere = isStrictAdmin || isAreaManager(areaRoles, 'einsatz_mt', operativeModeActive)

  const sections: NavSection[] = [
    meinBereichSection([
      { to: '/', label: 'Portal', icon: LayoutGrid },
      { to: '/einsatz', label: 'Übersicht', icon: LayoutDashboard },
      // Kein eigener Sachbearbeiter-Abschnitt nötig: Genehmigen/Verwalten läuft
      // innerhalb dieser Seite (Tabs), daher nur ein dezenter Hinweis-Badge.
      { to: '/einsatz/einsatzmittel', label: 'Einsatzmittel', icon: Shield, isActive: p => p.startsWith('/einsatz/einsatzmittel'), badge: canManage ? ClipboardCheck : undefined },
      { to: '/einsatz/training', label: 'Einsatztraining', icon: Target, isActive: p => p.startsWith('/einsatz/training') },
      { to: '/einsatz/unterlagen', label: 'Unterlagen', icon: BookOpen, isActive: p => p.startsWith('/einsatz/unterlagen') },
    ]),
    ...genehmigerSection(isGenehmiger),
  ]

  const footerLine = [
    isStrictAdmin ? null : profile?.dienstgrad,
    ...sidebarRoleLabels({ isAdmin: isStrictAdmin, isSachbearbeiter: isSachbearbeiterHere, isGenehmiger }),
    profile?.dienstnummer ? `DNr. ${profile.dienstnummer}` : null,
  ].filter(Boolean).join(' · ')

  return <PortalSidebarShell areaTagline="Einsatzmittel & Training" mobileTitle="Einsatzmittel & Training" sections={sections} footerLine={footerLine} />
}
