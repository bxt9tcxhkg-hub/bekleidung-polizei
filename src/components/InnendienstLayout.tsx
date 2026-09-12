import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Building2, LayoutGrid, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import ChangePasswordModal from './ChangePasswordModal'

const baseItems = [
  { to: '/', label: 'Portal', icon: LayoutGrid },
  { to: '/innendienst', label: 'Innendienst', icon: Building2 },
]

export default function InnendienstLayout() {
  const { profile, isAdmin, mustChangePassword, mustSetUsername, signOut } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-gray-50">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Menü schließen"
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-60 bg-blue-950 flex flex-col transition-transform duration-200 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-blue-900">
          <div className="flex-shrink-0 h-10 w-10 rounded-md bg-white p-[3px] flex items-center justify-center">
            <img src="/wappen-dornbirn.svg" alt="Wappen der Stadt Dornbirn" className="h-full w-auto" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight">Stadtpolizei</p>
            <p className="text-blue-300 text-xs">Innendienst</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wider px-3 mb-1.5 text-blue-300">
            Innendienst
          </p>
          <div className="space-y-0.5">
            {baseItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active ? 'bg-blue-600 text-white' : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        <div className="px-3 py-4 border-t border-blue-900">
          <div className="px-3 py-2 mb-2">
            <p className="text-white text-sm font-medium truncate">{profile?.name || profile?.username}</p>
            <p className="text-blue-300 text-xs truncate">
              {[isAdmin ? 'Admin' : null, profile?.dienstgrad, profile?.dienstnummer ? `DNr. ${profile.dienstnummer}` : null]
                .filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { void signOut() }}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-blue-200 hover:bg-blue-800 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Abmelden
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button type="button" onClick={() => setSidebarOpen(true)} className="p-2.5 rounded-md hover:bg-gray-100" aria-label="Menü öffnen">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <img src="/wappen-dornbirn.svg" alt="Wappen der Stadt Dornbirn" className="h-8 w-auto" />
            <span className="font-semibold text-gray-900 text-sm truncate">Innendienst</span>
          </div>
          {sidebarOpen ? (
            <button type="button" onClick={() => setSidebarOpen(false)} className="ml-auto p-2.5 rounded-md hover:bg-gray-100" aria-label="Menü schließen">
              <X className="w-5 h-5" />
            </button>
          ) : null}
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
        {(mustChangePassword || mustSetUsername) && <ChangePasswordModal />}
      </div>
    </div>
  )
}
