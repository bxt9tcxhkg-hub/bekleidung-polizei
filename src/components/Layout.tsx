import { Link, useLocation, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  CalendarRange,
  Scissors,
  Footprints,
  Users,
  ClipboardList,
  LogOut,
  Shield,
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { to: '/bestellungen', label: 'Bestellungen', icon: ShoppingBag, adminOnly: false },
  { to: '/produkte', label: 'Produkte', icon: Package, adminOnly: false },
  { to: '/quartale', label: 'Quartale', icon: CalendarRange, adminOnly: true },
  { to: '/schneiderjobs', label: 'Schneiderjobs', icon: Scissors, adminOnly: true },
  { to: '/schuherstattungen', label: 'Schuherstattungen', icon: Footprints, adminOnly: false },
  { to: '/benutzer', label: 'Benutzer', icon: Users, adminOnly: true },
  { to: '/auditlog', label: 'Audit-Log', icon: ClipboardList, adminOnly: true },
]

export default function Layout() {
  const location = useLocation()
  const { profile, isAdmin, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const visibleNav = navItems.filter(item => !item.adminOnly || isAdmin)

  const NavContent = () => (
    <>
      <div className="flex items-center gap-3 px-4 py-5 border-b border-blue-900">
        <div className="bg-blue-600 p-2 rounded-lg">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-tight">Stadtpolizei</p>
          <p className="text-blue-300 text-xs">Dornbirn</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNav.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-blue-200 hover:bg-blue-800 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-blue-900">
        <div className="px-3 py-2 mb-2">
          <p className="text-white text-sm font-medium truncate">{profile?.name || profile?.username}</p>
          <p className="text-blue-300 text-xs truncate">
            {isAdmin ? 'Administrator' : 'Benutzer'}
            {profile?.dienstnummer ? ` · DG ${profile.dienstnummer}` : ''}
          </p>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-blue-200 hover:bg-blue-800 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Abmelden
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-60 bg-blue-950 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <NavContent />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md hover:bg-gray-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-800" />
            <span className="font-semibold text-gray-900 text-sm">Stadtpolizei Dornbirn</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className={`ml-auto p-1.5 rounded-md hover:bg-gray-100 ${sidebarOpen ? '' : 'hidden'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
