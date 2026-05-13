import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingCart, CalendarRange, CheckSquare, Clock, TrendingUp, ShoppingBag, Euro, Truck, Scissors, Package, Footprints, Warehouse } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../lib/types'
import type { Quarter, Order } from '../lib/types'
import { getCurrentBudget, DEFAULT_BUDGET } from '../lib/budget'

const CURRENT_YEAR = new Date().getFullYear()

function UserDashboard({ profile }: { profile: NonNullable<ReturnType<typeof useAuth>['profile']> }) {
  const [cartCount, setCartCount] = useState(0)
  const [activeQuarter, setActiveQuarter] = useState<Quarter | null>(null)
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [totalBudget, setTotalBudget] = useState(DEFAULT_BUDGET)
  const [usedBudget, setUsedBudget] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [cartRes, quarterRes, ordersRes, totalBud, usedRes] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact' }).eq('user_id', profile.id).eq('status', 'pending'),
        supabase.from('quarters').select('*').eq('status', 'active').single(),
        supabase.from('orders').select('*, products(name, category), quarters(name)')
          .eq('user_id', profile.id)
          .not('status', 'in', '(pending,cancelled)')
          .order('created_at', { ascending: false })
          .limit(5),
        getCurrentBudget(profile.id, CURRENT_YEAR),
        supabase.from('orders').select('unit_price, quantity')
          .eq('user_id', profile.id)
          .not('status', 'in', '("pending","cancelled")')
          .gte('created_at', `${CURRENT_YEAR}-01-01`),
      ])
      setCartCount(cartRes.count ?? 0)
      setActiveQuarter(quarterRes.data ?? null)
      setRecentOrders(ordersRes.data ?? [])
      setTotalBudget(totalBud)
      setUsedBudget((usedRes.data ?? []).reduce((s, o) => s + o.unit_price * o.quantity, 0))
      setLoading(false)
    }
    load()
  }, [profile.id])

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>

  const remaining = totalBudget - usedBudget
  const budgetPct = Math.min(100, (usedBudget / totalBudget) * 100)

  return (
    <div className="space-y-6">
      {/* Budget */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Euro className="w-4 h-4 text-gray-400" />
            <p className="font-semibold text-gray-900">Jahresbudget {CURRENT_YEAR}</p>
          </div>
          <p className="text-sm font-bold text-gray-700">€ {usedBudget.toFixed(2)} / € {totalBudget.toFixed(2)}</p>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${budgetPct > 90 ? 'bg-red-500' : budgetPct > 70 ? 'bg-amber-400' : 'bg-green-500'}`}
            style={{ width: `${budgetPct}%` }} />
        </div>
        <p className={`text-sm mt-2 font-medium ${remaining <= 0 ? 'text-red-600' : 'text-gray-500'}`}>
          {remaining <= 0
            ? 'Budget aufgebraucht – weitere Bestellungen benötigen Genehmigung'
            : `€ ${remaining.toFixed(2)} verbleibend`}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Link to="/warenkorb" className="rounded-xl p-5 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Warenkorb</span>
            <div className="bg-blue-100 p-2 rounded-lg"><ShoppingCart className="w-4 h-4" /></div>
          </div>
          <p className="text-2xl font-bold">{cartCount}</p>
          <p className="text-xs mt-1 opacity-70">Artikel noch nicht eingereicht</p>
        </Link>
        <div className="rounded-xl p-5 bg-purple-50 text-purple-700">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Aktives Quartal</span>
            <div className="bg-purple-100 p-2 rounded-lg"><CalendarRange className="w-4 h-4" /></div>
          </div>
          <p className="text-2xl font-bold">{activeQuarter?.name ?? '–'}</p>
          {activeQuarter && <p className="text-xs mt-1 opacity-70">{new Date(activeQuarter.end_date).toLocaleDateString('de-AT')} Fristende</p>}
        </div>
        <Link to="/meine-bestellungen" className="rounded-xl p-5 bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Laufende Bestellungen</span>
            <div className="bg-green-100 p-2 rounded-lg"><ShoppingBag className="w-4 h-4" /></div>
          </div>
          <p className="text-2xl font-bold">{recentOrders.length}</p>
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <Clock className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-900 text-sm">Meine letzten Bestellungen</h2>
        </div>
        {recentOrders.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-gray-400">
            <TrendingUp className="w-8 h-8 mb-2" />
            <p className="text-sm">Noch keine eingereichten Bestellungen</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentOrders.map(o => (
              <div key={o.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{(o as any).products?.name ?? '–'}</p>
                  <p className="text-xs text-gray-400">{(o as any).quarters?.name} · Gr. {o.size} · {o.quantity}×</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ORDER_STATUS_COLORS[o.status]}`}>
                  {ORDER_STATUS_LABELS[o.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SachbearbeiterDashboard({ profile }: { profile: NonNullable<ReturnType<typeof useAuth>['profile']> }) {
  const [stats, setStats] = useState({ eingereicht: 0, lieferant: 0, schneider: 0, ausgabe: 0, lagerPending: 0 })
  const [activeQuarter, setActiveQuarter] = useState<Quarter | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const quarterRes = await supabase.from('quarters').select('*').eq('status', 'active').single()
      setActiveQuarter(quarterRes.data ?? null)

      const [eingRes, liefRes, schnRes, ausgRes, lagerRes] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact' }).eq('status', 'approved'),
        supabase.from('orders').select('id', { count: 'exact' }).eq('status', 'ordered_supplier'),
        supabase.from('orders').select('id', { count: 'exact' }).eq('status', 'at_tailor'),
        supabase.from('orders').select('id', { count: 'exact' }).eq('status', 'ready_for_issue'),
        supabase.from('stock_orders').select('id', { count: 'exact' }).eq('status', 'approved'),
      ])

      setStats({
        eingereicht: eingRes.count ?? 0,
        lieferant: liefRes.count ?? 0,
        schneider: schnRes.count ?? 0,
        ausgabe: ausgRes.count ?? 0,
        lagerPending: lagerRes.count ?? 0,
      })
      setLoading(false)
    }
    load()
  }, [profile.id])

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>

  const orderCards = [
    { label: 'Eingereicht', value: stats.eingereicht, icon: ShoppingBag, color: 'bg-blue-50 text-blue-700', iconBg: 'bg-blue-100', to: '/bestellungen' },
    { label: 'Beim Lieferanten', value: stats.lieferant, icon: Truck, color: 'bg-teal-50 text-teal-700', iconBg: 'bg-teal-100', to: '/bestellungen' },
    { label: 'Beim Schneider', value: stats.schneider, icon: Scissors, color: 'bg-orange-50 text-orange-700', iconBg: 'bg-orange-100', to: '/bestellungen' },
    { label: 'Bereit zur Ausgabe', value: stats.ausgabe, icon: Package, color: 'bg-green-50 text-green-700', iconBg: 'bg-green-100', to: '/bestellungen' },
  ]

  return (
    <div className="space-y-6">
      {activeQuarter && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3 flex items-center gap-3">
          <CalendarRange className="w-4 h-4 text-blue-600" />
          <span className="text-sm text-blue-800 font-medium">Aktives Quartal: {activeQuarter.name}</span>
          <span className="text-xs text-blue-500 ml-auto">{new Date(activeQuarter.start_date).toLocaleDateString('de-AT')} – {new Date(activeQuarter.end_date).toLocaleDateString('de-AT')}</span>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {orderCards.map(({ label, value, icon: Icon, color, iconBg, to }) => (
          <Link key={label} to={to} className={`rounded-xl p-5 ${color} hover:brightness-95 transition-all`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">{label}</span>
              <div className={`${iconBg} p-2 rounded-lg`}><Icon className="w-4 h-4" /></div>
            </div>
            <p className="text-2xl font-bold">{value}</p>
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link to="/lager" className="rounded-xl p-5 bg-indigo-50 text-indigo-700 hover:brightness-95 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Lagerverwaltung</span>
            <div className="bg-indigo-100 p-2 rounded-lg"><Warehouse className="w-4 h-4" /></div>
          </div>
          <p className="text-2xl font-bold">{stats.lagerPending}</p>
          <p className="text-xs mt-1 opacity-70">Freigegebene Lagerbestellungen zum Einbuchen</p>
        </Link>
      </div>
    </div>
  )
}

function GenehmDashboard({ profile }: { profile: NonNullable<ReturnType<typeof useAuth>['profile']> }) {
  const [pendingOrders, setPendingOrders] = useState(0)
  const [pendingRefunds, setPendingRefunds] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const year = new Date().getFullYear()
      const [ordersRes, refundsRes] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact' }).eq('status', 'pending_approval'),
        supabase.from('shoe_refunds').select('id', { count: 'exact' }).gte('created_at', `${year}-01-01`),
      ])
      setPendingOrders(ordersRes.count ?? 0)
      setPendingRefunds(refundsRes.count ?? 0)
      setLoading(false)
    }
    load()
  }, [profile.id])

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Link to="/genehmigungen" className="rounded-xl p-5 bg-yellow-50 text-yellow-700 hover:brightness-95 transition-all">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Bestellungen zur Genehmigung</span>
          <div className="bg-yellow-100 p-2 rounded-lg"><CheckSquare className="w-4 h-4" /></div>
        </div>
        <p className="text-2xl font-bold">{pendingOrders}</p>
        <p className="text-xs mt-1 opacity-70">Budgetüberschreitungen ausstehend</p>
      </Link>
      <Link to="/schuherstattungen" className="rounded-xl p-5 bg-blue-50 text-blue-700 hover:brightness-95 transition-all">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Schuherstattungen</span>
          <div className="bg-blue-100 p-2 rounded-lg"><Footprints className="w-4 h-4" /></div>
        </div>
        <p className="text-2xl font-bold">{pendingRefunds}</p>
        <p className="text-xs mt-1 opacity-70">Erfasst {new Date().getFullYear()}</p>
      </Link>
    </div>
  )
}

export default function Dashboard() {
  const { profile, isSachbearbeiter, isGenehmiger } = useAuth()
  const [activeTab, setActiveTab] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const startX = useRef<number | null>(null)

  if (!profile) return null

  const tabs = [
    { key: 'user', label: 'Mein Bereich' },
    ...(isSachbearbeiter ? [{ key: 'sachbearbeiter', label: 'Sachbearbeiter' }] : []),
    ...(isGenehmiger ? [{ key: 'genehmiger', label: 'Genehmiger' }] : []),
  ]

  function onTouchStart(e: React.TouchEvent) { startX.current = e.touches[0].clientX }
  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current === null) return
    const dx = e.changedTouches[0].clientX - startX.current
    if (Math.abs(dx) > 60) {
      if (dx < 0 && activeTab < tabs.length - 1) setActiveTab(t => t + 1)
      if (dx > 0 && activeTab > 0) setActiveTab(t => t - 1)
    }
    startX.current = null
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Guten Tag, {profile.name || profile.username}</h1>
        <p className="text-gray-500 text-sm mt-1">Übersicht der Bekleidungsverwaltung <span className="text-xs bg-yellow-200 text-yellow-800 px-1 rounded">v2</span></p>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
          {tabs.map((tab, i) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(i)}
              className={`text-sm font-medium px-4 py-2 rounded-lg transition-all ${activeTab === i ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div ref={containerRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {tabs[activeTab]?.key === 'user' && <UserDashboard profile={profile} />}
        {tabs[activeTab]?.key === 'sachbearbeiter' && <SachbearbeiterDashboard profile={profile} />}
        {tabs[activeTab]?.key === 'genehmiger' && <GenehmDashboard profile={profile} />}
      </div>
    </div>
  )
}
