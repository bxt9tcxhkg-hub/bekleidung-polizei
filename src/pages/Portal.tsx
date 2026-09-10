import { Link } from 'react-router-dom'
import {
  Building2,
  Car,
  ClipboardList,
  Clock3,
  GraduationCap,
  LifeBuoy,
  Radio,
  Shield,
  Shirt,
  Target,
  UserCircle,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import PortalChrome from '../components/PortalChrome'
import {
  PORTAL_ACCOUNT_LINKS,
  type PortalAccountId,
  type PortalAccountLink,
  type PortalAdminId,
  type PortalAdminLink,
  visiblePortalAdminLinks,
} from '../lib/portalAccount'
import { PORTAL_APPS, type PortalApp, type PortalAppId } from '../lib/portalApps'
import { visiblePortalApps } from '../lib/portalEntitlements'

const APP_ICONS: Record<PortalAppId, LucideIcon> = {
  bekleidung: Shirt,
  einsatz_mt: Target,
}

const ACCOUNT_ICONS: Record<PortalAccountId, LucideIcon> = {
  profil: UserCircle,
  hilfe: LifeBuoy,
}

const ADMIN_ICONS: Record<PortalAdminId, LucideIcon> = {
  auditlog: ClipboardList,
}

type PlannedPortalArea = {
  id: 'zentrale' | 'innendienst' | 'aussendienst' | 'fuhrpark' | 'ueberstunden'
  title: string
  description: string
  path: string
  icon: LucideIcon
}

const OPERATIONAL_AREAS: PlannedPortalArea[] = [
  { id: 'zentrale', title: 'Zentrale', description: 'Interne operative Informationen und Arbeitshilfen', path: '/planung/zentrale', icon: Radio },
  { id: 'innendienst', title: 'Innendienst', description: 'Kasse, Bescheide, Gebühren und Verfahrenshilfen', path: '/planung/innendienst', icon: Building2 },
  { id: 'aussendienst', title: 'Außendienststreifen', description: 'Kontrollaufträge, aktuelle Hinweise und Kontrollbehelfe', path: '/planung/aussendienst', icon: Shield },
]

const ORGANISATIONAL_AREAS: PlannedPortalArea[] = [
  { id: 'fuhrpark', title: 'Fuhrpark & Fahrzeuge', description: 'Kontrollen, Mängel, Pflege und Werkstatttermine', path: '/planung/fuhrpark', icon: Car },
]

const PERSONAL_AREAS: PlannedPortalArea[] = [
  { id: 'ueberstunden', title: 'Überstundenmeldung', description: 'Überstunden erfassen und zur Prüfung abgeben', path: '/planung/ueberstunden', icon: Clock3 },
]

function AppTile({ app }: { app: PortalApp }) {
  const Icon = APP_ICONS[app.id]

  if (app.status === 'coming_soon') {
    return (
      <div
        aria-disabled="true"
        className="rounded-xl border border-gray-200 bg-white p-5 opacity-60 cursor-not-allowed select-none"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="bg-gray-100 p-2.5 rounded-lg">
            <Icon className="w-5 h-5 text-gray-500" />
          </div>
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
            folgt
          </span>
        </div>
        <h2 className="text-lg font-semibold text-gray-700">{app.title}</h2>
        {app.description ? (
          <p className="text-sm text-gray-500 mt-1">{app.description}</p>
        ) : null}
      </div>
    )
  }

  return (
    <Link
      to={app.path}
      className="rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all block"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="bg-blue-50 p-2.5 rounded-lg">
          <Icon className="w-5 h-5 text-blue-700" />
        </div>
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{app.title}</h2>
      {app.description ? (
        <p className="text-sm text-gray-500 mt-1">{app.description}</p>
      ) : null}
    </Link>
  )
}

function PlannedTile({ area, admin }: { area: PlannedPortalArea; admin: boolean }) {
  const Icon = area.icon
  const content = (
    <>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className={`p-2.5 rounded-lg ${admin ? 'bg-amber-50' : 'bg-gray-100'}`}>
          <Icon className={`w-5 h-5 ${admin ? 'text-amber-700' : 'text-gray-400'}`} />
        </div>
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">In Planung</span>
      </div>
      <h2 className={`text-lg font-semibold ${admin ? 'text-gray-900' : 'text-gray-500'}`}>{area.title}</h2>
      <p className="text-sm text-gray-500 mt-1">{area.description}</p>
      {admin ? <p className="text-xs font-medium text-amber-700 mt-3">Grundstruktur ansehen</p> : null}
    </>
  )

  if (admin) {
    return <Link to={area.path} className="rounded-xl border border-dashed border-amber-300 bg-white p-5 hover:border-amber-500 hover:shadow-sm transition-all block">{content}</Link>
  }
  return <div aria-disabled="true" title="In Planung" className="rounded-xl border border-gray-200 bg-gray-50 p-5 opacity-65 cursor-not-allowed select-none">{content}</div>
}

function PortalSection({
  title,
  description,
  tone,
  children,
}: {
  title: string
  description: string
  tone: 'operativ' | 'organisation' | 'persoenlich'
  children: React.ReactNode
}) {
  const toneClass = tone === 'operativ'
    ? 'border-red-500 bg-red-50/60'
    : tone === 'organisation'
      ? 'border-blue-600 bg-blue-50/50'
      : 'border-emerald-600 bg-emerald-50/50'
  return (
    <section className={`rounded-2xl border-l-4 ${toneClass} p-4 sm:p-5 mb-6`}>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </section>
  )
}

function NavTile({
  to,
  label,
  description,
  icon: Icon,
}: {
  to: string
  label: string
  description: string
  icon: LucideIcon
}) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all block"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="bg-blue-50 p-2.5 rounded-lg">
          <Icon className="w-5 h-5 text-blue-700" />
        </div>
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{label}</h2>
      {description ? (
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      ) : null}
    </Link>
  )
}

function AccountTile({ link }: { link: PortalAccountLink }) {
  return <NavTile to={link.to} label={link.label} description={link.description} icon={ACCOUNT_ICONS[link.id]} />
}

function AdminTile({ link }: { link: PortalAdminLink }) {
  return <NavTile to={link.to} label={link.label} description={link.description} icon={ADMIN_ICONS[link.id]} />
}

const headerActionClass =
  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors'

export default function Portal() {
  const { profile, isAdmin, isStrictAdmin, isGenehmiger, areaRoles, hasAreaAccess } = useAuth()
  const apps = visiblePortalApps(PORTAL_APPS, { isStrictAdmin, rows: areaRoles })
  const adminLinks = visiblePortalAdminLinks(isAdmin)

  return (
    <PortalChrome
      actions={
        <>
          {adminLinks.map(link => {
            const Icon = ADMIN_ICONS[link.id]
            return (
              <Link key={link.id} to={link.to} className={headerActionClass}>
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            )
          })}
          {isGenehmiger ? (
            <Link to="/portal/benutzer" className={headerActionClass}>
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Benutzer</span>
            </Link>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col items-center text-center mb-8">
        <div className="mb-4 h-16 w-16 rounded-xl bg-white p-1 flex items-center justify-center border border-gray-200">
          <img
            src="/wappen-dornbirn.svg"
            alt="Wappen der Stadt Dornbirn"
            className="h-full w-auto"
          />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Stadtpolizei Dornbirn</h1>
        <p className="text-gray-500 text-sm mt-1">Portal</p>
        {profile?.name ? (
          <p className="text-gray-400 text-xs mt-1 sm:hidden">{profile.name}</p>
        ) : null}
      </div>

      <PortalSection title="Operativer Bereich" description="Interne Unterstützung für die tägliche Dienstabwicklung" tone="operativ">
        {OPERATIONAL_AREAS.map(area => <PlannedTile key={area.id} area={area} admin={isAdmin} />)}
      </PortalSection>

      <PortalSection title="Organisatorische Angelegenheiten" description="Verwaltung, Ausstattung, Ausbildung und Fuhrpark" tone="organisation">
        {apps.map(app => <AppTile key={app.id} app={app} />)}
        {hasAreaAccess('schulungen') ? (
          <NavTile to="/schulungen" label="Schulungen" description="PAD, weitere Schulungen und Rechtsinformationen" icon={GraduationCap} />
        ) : null}
        {ORGANISATIONAL_AREAS.map(area => <PlannedTile key={area.id} area={area} admin={isAdmin} />)}
      </PortalSection>

      <PortalSection title="Mein Bereich" description="Persönliche Meldungen und Anträge" tone="persoenlich">
        {PERSONAL_AREAS.map(area => <PlannedTile key={area.id} area={area} admin={isAdmin} />)}
      </PortalSection>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 pt-8 border-t border-gray-200">
        {adminLinks.map(link => (
          <AdminTile key={link.id} link={link} />
        ))}
        {PORTAL_ACCOUNT_LINKS.map(link => (
          <AccountTile key={link.id} link={link} />
        ))}
      </div>
    </PortalChrome>
  )
}
