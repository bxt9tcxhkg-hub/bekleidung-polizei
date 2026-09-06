import { Link } from 'react-router-dom'
import { Shirt, Target, Users, type LucideIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import PortalChrome from '../components/PortalChrome'
import { PORTAL_APPS, type PortalApp, type PortalAppId } from '../lib/portalApps'
import { visiblePortalApps } from '../lib/portalEntitlements'

const APP_ICONS: Record<PortalAppId, LucideIcon> = {
  bekleidung: Shirt,
  einsatz_mt: Target,
}

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

export default function Portal() {
  const { profile, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const apps = visiblePortalApps(PORTAL_APPS, { isStrictAdmin, rows: areaRoles })

  return (
    <PortalChrome
      actions={
        isGenehmiger ? (
          <Link
            to="/portal/benutzer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Benutzer</span>
          </Link>
        ) : null
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {apps.map(app => (
          <AppTile key={app.id} app={app} />
        ))}
      </div>
    </PortalChrome>
  )
}
