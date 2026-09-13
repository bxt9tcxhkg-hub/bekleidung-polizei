import { Archive, Award, BookOpen, ClipboardCheck, ClipboardList, FileClock, LayoutDashboard, LayoutGrid, ListChecks, PackagePlus, ShieldCheck, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { sidebarRoleLabels } from '../lib/authRoles'
import { canManageEinsatztraining } from '../lib/einsatztraining'
import { canManagePersonalEinsatzmittel } from '../lib/personalEinsatzmittel'
import { isAreaManager } from '../lib/portalEntitlements'
import { genehmigerSection, meinBereichSection, type NavSection } from '../lib/sidebarSections'
import { PortalSidebarShell } from './PortalSidebar'

export default function EinsatzLayout() {
  const { profile, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const canManage = canManagePersonalEinsatzmittel({ isStrictAdmin, isGenehmiger, rows: areaRoles, operativeModeActive })
  const canManageTraining = canManageEinsatztraining({ isStrictAdmin, isGenehmiger, rows: areaRoles, operativeModeActive })
  const isSachbearbeiterHere = isStrictAdmin || isAreaManager(areaRoles, 'einsatz_mt', operativeModeActive)

  const sections: NavSection[] = [
    meinBereichSection([
      { to: '/', label: 'Portal', icon: LayoutGrid },
      { to: '/einsatz', label: 'Übersicht', icon: LayoutDashboard },
      { to: '/einsatz/einsatzmittel/persoenlich', label: 'Einsatzmittel – Persönlich', icon: User },
      { to: '/einsatz/einsatzmittel/pool', label: 'Einsatzmittel – Pool', icon: ShieldCheck },
      ...(canManage ? [
        { to: '/einsatz/einsatzmittel/lager', label: 'Einsatzmittel – Lagerbestand', icon: Archive },
        { to: '/einsatz/einsatzmittel/beschaffung', label: 'Einsatzmittel – Beschaffung', icon: PackagePlus },
      ] : []),
      { to: '/einsatz/einsatzmittel/meldungen', label: canManage ? 'Einsatzmittel – Zur Bestätigung' : 'Einsatzmittel – Meine Meldungen', icon: ClipboardCheck },
      { to: '/einsatz/training/module', label: canManageTraining ? 'Einsatztraining – Module' : 'Einsatztraining – Mein Status', icon: Award },
      ...(canManageTraining ? [
        { to: '/einsatz/training/offen', label: 'Einsatztraining – Offen', icon: ListChecks },
      ] : []),
      { to: '/einsatz/training/ausschreibung', label: 'Einsatztraining – Ausschreibung', icon: FileClock },
      { to: '/einsatz/training/protokoll', label: 'Einsatztraining – Protokoll', icon: ClipboardList },
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
