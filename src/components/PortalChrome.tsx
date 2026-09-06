import { Link } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import ChangePasswordModal from './ChangePasswordModal'

export default function PortalChrome({
  children,
  actions,
  wide = false,
}: {
  children: React.ReactNode
  actions?: React.ReactNode
  wide?: boolean
}) {
  const { profile, mustChangePassword, signOut } = useAuth()
  const width = wide ? 'max-w-6xl' : 'max-w-4xl'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className={`${width} mx-auto px-4 py-3 flex items-center justify-between gap-3`}>
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

      <main className={`flex-1 ${width} mx-auto w-full px-4 py-8 sm:py-12`}>
        {children}
      </main>
      {mustChangePassword && <ChangePasswordModal />}
    </div>
  )
}
