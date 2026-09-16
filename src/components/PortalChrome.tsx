import { Link, useLocation } from 'react-router-dom'
import { LifeBuoy, LogOut, UserCircle, type LucideIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { PORTAL_ACCOUNT_LINKS, type PortalAccountId } from '../lib/portalAccount'
import ChangePasswordModal from './ChangePasswordModal'

const ACCOUNT_ICONS: Record<PortalAccountId, LucideIcon> = {
  profil: UserCircle,
  hilfe: LifeBuoy,
}

export default function PortalChrome({
  children,
  actions,
  wide = false,
}: {
  children: React.ReactNode
  actions?: React.ReactNode
  wide?: boolean
}) {
  const { profile, mustChangePassword, mustSetUsername, signOut } = useAuth()
  const location = useLocation()
  const width = wide ? 'max-w-[90rem]' : 'max-w-4xl'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className={`${width} mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3`}>
          <Link to="/" className="flex items-center gap-3 min-w-0">
            <img
              src="/wappen-dornbirn.svg"
              alt="Wappen der Stadt Dornbirn"
              className="h-10 w-auto flex-shrink-0"
            />
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm leading-tight truncate">Stadtpolizei Dornbirn</p>
              <p className="text-gray-500 text-xs">Portal</p>
            </div>
          </Link>
          <div className="flex items-center gap-2 flex-shrink-0">
            {PORTAL_ACCOUNT_LINKS.map(link => {
              const Icon = ACCOUNT_ICONS[link.id]
              const active = location.pathname === link.to
              return (
                <Link
                  key={link.id}
                  to={link.to}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              )
            })}
            {actions}
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

      <main className={`flex-1 ${width} mx-auto w-full px-4 sm:px-6 py-8 sm:py-12`}>
        {children}
      </main>
      {(mustChangePassword || mustSetUsername) && <ChangePasswordModal />}
    </div>
  )
}
