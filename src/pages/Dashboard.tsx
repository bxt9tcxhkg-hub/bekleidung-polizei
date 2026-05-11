import { useEffect, useState } from 'react'
import { ShoppingBag, Package, CalendarRange, Scissors, TrendingUp, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Quarter, Order } from '../lib/types'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../lib/types'

interface Stats {
  openOrders: number
  totalProducts: number
  activeQuarter: Quarter | null
  openTailorJobs: number
  myRecentOrders: Order[]
}

export default function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const [stats, setStats] = useState<Stats>({
    openOrders: 0,
    totalProducts: 0,
    activeQuarter: null,
    openTailorJobs: 0,
    myRecentOrders: [],
  })

  useEffect(() => {
    async function load() {
      const [ordersRes, productsRes, quarterRes, tailorRes, myOrdersRes] = await Promise.all([
        isAdmin
          ? supabase.from('orders').select('id', { count: 'exact' }).not('status', 'in', '(issued,cancelled)')
          : supabase.from('orders').select('id', { count: 'exact' }).eq('user_id', profile!.id).not('status', 'in', '(issued,cancelled)'),
        supabase.from('products').select('id', { count: 'exact' }).eq('active', true),
        supabase.from('quarters').select('*').eq('status', 'active').single(),
        supabase.from('tailor_jobs').select('id', { count: 'exact' }).eq('status', 'open'),
        supabase
          .from('orders')
          .select('*, products(name, category), quarters(name)')
          .eq('user_id', profile!.id)
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      setStats({
        openOrders: ordersRes.count ?? 0,
        totalProducts: productsRes.count ?? 0,
        activeQuarter: quarterRes.data ?? null,
        openTailorJobs: tailorRes.count ?? 0,
        myRecentOrders: myOrdersRes.data ?? [],
      })
    }
    if (profile) load()
  }, [profile, isAdmin])

  const cards = [
    {
      label: isAdmin ? 'Offene Bestellungen' : 'Meine Bestellungen',
      value: stats.openOrders,
      icon: ShoppingBag,
      color: 'bg-blue-50 text-blue-700',
      iconBg: 'bg-blue-100',
    },
    {
      label: 'Aktive Produkte',
      value: stats.totalProducts,
      icon: Package,
      color: 'bg-green-50 text-green-700',
      iconBg: 'bg-green-100',
    },
    {
      label: 'Aktives Quartal',
      value: stats.activeQuarter?.name ?? '–',
      icon: CalendarRange,
      color: 'bg-purple-50 text-purple-700',
      iconBg: 'bg-purple-100',
    },
    ...(isAdmin
      ? [{
          label: 'Offene Schneiderjobs',
          value: stats.openTailorJobs,
          icon: Scissors,
          color: 'bg-orange-50 text-orange-700',
          iconBg: 'bg-orange-100',
        }]
      : []),
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Guten Tag, {profile?.name || profile?.username}
        </h1>
        <p className="text-gray-500 text-sm mt-1">Übersicht der Bekleidungsverwaltung</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, color, iconBg }) => (
          <div key={label} className={`rounded-xl p-5 ${color}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">{label}</span>
              <div className={`${iconBg} p-2 rounded-lg`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <Clock className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-900 text-sm">Meine letzten Bestellungen</h2>
        </div>
        {stats.myRecentOrders.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-gray-400">
            <TrendingUp className="w-8 h-8 mb-2" />
            <p className="text-sm">Noch keine Bestellungen</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {stats.myRecentOrders.map(order => (
              <div key={order.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {(order as any).products?.name ?? '–'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {(order as any).quarters?.name} · Gr. {order.size} · {order.quantity}×
                  </p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ORDER_STATUS_COLORS[order.status]}`}>
                  {ORDER_STATUS_LABELS[order.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
