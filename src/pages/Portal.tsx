import { Link } from 'react-router-dom'
import { LogOut, Shirt, Target, Briefcase, type LucideIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import ChangePasswordModal from '../components/ChangePasswordModal'
import { PORTAL_APPS, type PortalApp, type PortalAppId } from '../lib/portalApps'

const APP_ICONS: Record<PortalAppId, LucideIcon> = {
  bekleidung: Shirt,
  einsatztraining: Target,
  einsatzmittel: Briefcase,
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
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
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
  const { profile, mustChangePassword, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/wappen-dornbirn.svg"
              alt="Wappen der Stadt Dornbirn"
              className="h-10 w-auto flex-shrink-0"
            />
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm leading-tight truncate">Stadtpolizei Dornbirn</p>
              <p className="text-gray-500 text-xs">Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="hidden sm:inline text-sm text-gray-600 truncate max-w-[12rem]">
              {profile?.name || profile?.username}
            </span>
            <button
              type="button"
              onClick={() => { void signOut() }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Abmelden</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 sm:py-12">
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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PORTAL_APPS.map(app => (
            <AppTile key={app.id} app={app} />
          ))}
        </div>
      </main>
      {mustChangePassword && <ChangePasswordModal />}
    </div>
  )
}
