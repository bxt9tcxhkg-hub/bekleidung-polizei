import { Link, useLocation, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, ShoppingBag, Package,
  CalendarRange, Footprints, Users, ClipboardList,
  LogOut, Menu, X, CheckSquare, UserCircle, Wallet, Warehouse, BarChart3, BookOpen,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { sidebarRoleLabels } from '../lib/authRoles'
import ChangePasswordModal from './ChangePasswordModal'

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
}

interface NavSection {
  role: string
  label: string
  color: string
  items: NavItem[]
}

function SidebarNav({
  sections,
  onNavigate,
  profile,
  signOut,
  isAdmin,
  isSachbearbeiter,
  isGenehmiger,
}: {
  sections: NavSection[]
  onNavigate: () => void
  profile: ReturnType<typeof useAuth>['profile']
  signOut: () => Promise<void>
  isAdmin: boolean
  isSachbearbeiter: boolean
  isGenehmiger: boolean
}) {
  const location = useLocation()
  const roleLine = sidebarRoleLabels({ isAdmin, isSachbearbeiter, isGenehmiger }).join(' · ')
  const footerLine = profile?.dienstnummer ? `${roleLine} · DG ${profile.dienstnummer}` : roleLine
  return (
    <>
      <div className="flex items-center gap-3 px-4 py-5 border-b border-blue-900">
        <div className="flex-shrink-0 h-10 w-10 rounded-md bg-white p-[3px] flex items-center justify-center">
          <img
            src="/wappen-dornbirn.svg"
            alt="Wappen der Stadt Dornbirn"
            className="h-full w-auto"
          />
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-tight">Stadtpolizei</p>
          <p className="text-blue-300 text-xs">Dornbirn</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {sections.map(section => (
          <div key={section.role}>
            <p className={`text-xs font-semibold uppercase tracking-wider px-3 mb-1.5 ${section.color}`}>
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map(({ to, label, icon: Icon }) => {
                const active = location.pathname === to
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={onNavigate}
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
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-blue-900">
        <div className="px-3 py-2 mb-2">
          <p className="text-white text-sm font-medium truncate">{profile?.name || profile?.username}</p>
          <p className="text-blue-300 text-xs leading-snug break-words" title={footerLine}>
            {footerLine}
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
}

export default function Layout() {
  const { profile, isAdmin, isSachbearbeiter, isGenehmiger, mustChangePassword, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const sections: NavSection[] = [
    {
      role: 'user',
      label: 'Mein Bereich',
      color: 'text-blue-300',
      items: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/warenkorb', label: 'Bekleidung bestellen', icon: ShoppingCart },
        { to: '/meine-bestellungen', label: 'Meine Bestellungen', icon: ShoppingBag },
        { to: '/profil', label: 'Mein Profil', icon: UserCircle },
      ],
    },
    ...(isSachbearbeiter ? [{
      role: 'sachbearbeiter',
      label: 'Sachbearbeiter',
      color: 'text-orange-300',
      items: [
        { to: '/bestellungen', label: 'Bestellungen', icon: Package },
        { to: '/lager', label: 'Lagerverwaltung', icon: Warehouse },
        { to: '/analyse', label: 'Analyse', icon: BarChart3 },
        { to: '/grundausstattung', label: 'Grundausstattung', icon: BookOpen },
        { to: '/produkte', label: 'Produkte', icon: Package },
        { to: '/quartale', label: 'Quartale', icon: CalendarRange },
        { to: '/benutzer', label: 'Benutzer', icon: Users },
        { to: '/auditlog', label: 'Audit-Log', icon: ClipboardList },
      ],
    }] : []),
    ...(isGenehmiger ? [{
      role: 'genehmiger',
      label: 'Genehmiger',
      color: 'text-green-300',
      items: [
        { to: '/genehmigungen', label: 'Freigaben', icon: CheckSquare },
        { to: '/budgets', label: 'Budgetverwaltung', icon: Wallet },
        { to: '/schuherstattungen', label: 'Schuherstattungen', icon: Footprints },
        ...(!isSachbearbeiter ? [{ to: '/benutzer', label: 'Benutzer', icon: Users }] : []),
        ...(!isSachbearbeiter ? [{ to: '/analyse', label: 'Analyse', icon: BarChart3 }] : []),
      ],
    }] : []),
  ]

  return (
    <div className="flex h-screen bg-gray-50">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-60 bg-blue-950 flex flex-col transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <SidebarNav
          sections={sections}
          onNavigate={() => setSidebarOpen(false)}
          profile={profile}
          signOut={signOut}
          isAdmin={isAdmin}
          isSachbearbeiter={isSachbearbeiter}
          isGenehmiger={isGenehmiger}
        />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setSidebarOpen(true)} className="p-2.5 rounded-md hover:bg-gray-100">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/wappen-dornbirn.svg"
              alt="Wappen der Stadt Dornbirn"
              className="h-8 w-auto"
            />
            <span className="font-semibold text-gray-900 text-sm">Stadtpolizei Dornbirn</span>
          </div>
          {sidebarOpen && (
            <button onClick={() => setSidebarOpen(false)} className="ml-auto p-2.5 rounded-md hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
        {mustChangePassword && <ChangePasswordModal />}
      </div>
    </div>
  )
}
