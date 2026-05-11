import { useEffect, useRef, useState } from 'react'
import { ShoppingCart, CalendarRange, CheckSquare, Clock, TrendingUp, ShoppingBag, Euro, Scissors } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../lib/types'
import type { Quarter, Order } from '../lib/types'

function UserDashboard({ profile }: { profile: NonNullable<ReturnType<typeof useAuth>['profile']> }) {
  const [cartCount, setCartCount] = useState(0)
  const [activeQuarter, setActiveQuarter] = useState<Quarter | null>(null)
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [cartRes, quarterRes, ordersRes] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact' }).eq('user_id', profile.id).eq('status', 'pending'),
        supabase.from('quarters').select('*').eq('status', 'active').single(),
        supabase.from('orders').select('*, products(name, category), quarters(name)')
          .eq('user_id', profile.id)
          .not('status', 'in', '(pending,cancelled)')
          .order('created_at', { ascending: false })
          .limit(5),
      ])
      setCartCount(cartRes.count ?? 0)
      setActiveQuarter(quarterRes.data ?? null)
      setRecentOrders(ordersRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [profile.id])

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl p-5 bg-blue-50 text-blue-700">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Warenkorb</span>
            <div className="bg-blue-100 p-2 rounded-lg"><ShoppingCart className="w-4 h-4" /></div>
          </div>
          <p className="text-2xl font-bold">{cartCount}</p>
          <p className="text-xs mt-1 opacity-70">{cartCount === 1 ? 'Artikel' : 'Artikel'} noch nicht eingereicht</p>
        </div>
        <div className="rounded-xl p-5 bg-purple-50 text-purple-700">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Aktives Quartal</span>
            <div className="bg-purple-100 p-2 rounded-lg"><CalendarRange className="w-4 h-4" /></div>
          </div>
          <p className="text-2xl font-bold">{activeQuarter?.name ?? '–'}</p>
          {activeQuarter && <p className="text-xs mt-1 opacity-70">{new Date(activeQuarter.end_date).toLocaleDateString('de-AT')} Fristende</p>}
        </div>
        <div className="rounded-xl p-5 bg-green-50 text-green-700">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Laufende Bestellungen</span>
            <div className="bg-green-100 p-2 rounded-lg"><ShoppingBag className="w-4 h-4" /></div>
          </div>
          <p className="text-2xl font-bold">{recentOrders.length}</p>
        </div>
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
  const [stats, setStats] = useState({ submitted: 0, approved: 0, tailorJobs: 0, committedBudget: 0 })
  const [activeQuarter, setActiveQuarter] = useState<Quarter | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const quarterRes = await supabase.from('quarters').select('*').eq('status', 'active').single()
      const aq = quarterRes.data ?? null
      setActiveQuarter(aq)

      const [submittedRes, approvedRes, tailorRes, budgetRes] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact' }).eq('status', 'pending_approval'),
        supabase.from('orders').select('id', { count: 'exact' }).eq('status', 'approved'),
        supabase.from('tailor_jobs').select('id', { count: 'exact' }).eq('status', 'open'),
        aq
          ? supabase.from('orders').select('status, quantity, products(price)').eq('quarter_id', aq.id).not('status', 'in', '(pending,cancelled,issued)')
          : Promise.resolve({ data: [] as any[] }),
      ])

      const budgetOrders = (budgetRes.data ?? []) as any[]
      const committed = budgetOrders.reduce((s: number, o: any) => s + (o.products?.price ?? 0) * o.quantity, 0)

      setStats({ submitted: submittedRes.count ?? 0, approved: approvedRes.count ?? 0, tailorJobs: tailorRes.count ?? 0, committedBudget: committed })
      setLoading(false)
    }
    load()
  }, [profile.id])

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>

  const cards = [
    { label: 'Warten auf Genehmiger', value: stats.submitted, icon: Clock, color: 'bg-yellow-50 text-yellow-700', iconBg: 'bg-yellow-100' },
    { label: 'Genehmigt (zu bestellen)', value: stats.approved, icon: ShoppingBag, color: 'bg-teal-50 text-teal-700', iconBg: 'bg-teal-100' },
    { label: 'Offene Schneiderjobs', value: stats.tailorJobs, icon: Scissors, color: 'bg-orange-50 text-orange-700', iconBg: 'bg-orange-100' },
    { label: 'Budget gebunden (Quartal)', value: `€ ${stats.committedBudget.toFixed(2)}`, icon: Euro, color: 'bg-red-50 text-red-700', iconBg: 'bg-red-100' },
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, color, iconBg }) => (
          <div key={label} className={`rounded-xl p-5 ${color}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">{label}</span>
              <div className={`${iconBg} p-2 rounded-lg`}><Icon className="w-4 h-4" /></div>
            </div>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function GenehmDashboard({ profile }: { profile: NonNullable<ReturnType<typeof useAuth>['profile']> }) {
  const [pending, setPending] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('orders')
        .select('*, products(name, category), quarters(name), profiles(name, dienstnummer)')
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: true })
        .limit(10)
      setPending(data ?? [])
      setLoading(false)
    }
    load()
  }, [profile.id])

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-5 bg-yellow-50 text-yellow-700">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Ausstehende Genehmigungen</span>
          <div className="bg-yellow-100 p-2 rounded-lg"><CheckSquare className="w-4 h-4" /></div>
        </div>
        <p className="text-2xl font-bold">{pending.length}</p>
      </div>

      {pending.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Älteste ausstehende Bestellungen</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {pending.map(o => (
              <div key={o.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{(o as any).products?.name}</p>
                  <p className="text-xs text-gray-400">{(o as any).profiles?.name} · {(o as any).quarters?.name} · Gr. {o.size}</p>
                </div>
                <span className="text-xs text-yellow-600 font-medium">{o.quantity}×</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
