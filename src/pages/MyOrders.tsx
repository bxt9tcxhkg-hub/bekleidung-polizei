import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Order } from '../lib/types'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../lib/types'
import { getCurrentBudget, DEFAULT_BUDGET } from '../lib/budget'

const CURRENT_YEAR = new Date().getFullYear()

type MyOrder = Order & {
  products?: { name: string; category: string; needs_tailoring: boolean }
  quarters?: { name: string }
}

const STATUS_STEPS = [
  { key: 'pending_approval', label: 'Wartet auf Freigabe' },
  { key: 'approved',         label: 'Freigegeben' },
  { key: 'ordered_supplier', label: 'Beim Lieferanten' },
  { key: 'at_tailor',        label: 'Beim Schneider' },
  { key: 'ready_for_issue',  label: 'Bereit zur Ausgabe' },
  { key: 'partially_issued', label: 'Teilweise ausgegeben' },
  { key: 'issued',           label: 'Ausgegeben' },
]

function Timeline({ order }: { order: MyOrder }) {
  if (order.status === 'cancelled') {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
        <span className="font-medium">Storniert</span>
        {order.cancel_reason && <span className="text-red-500">– {order.cancel_reason}</span>}
      </div>
    )
  }

  const steps = STATUS_STEPS.filter(s =>
    s.key !== 'at_tailor' || order.products?.needs_tailoring
  ).filter(s =>
    s.key !== 'pending_approval' || order.status === 'pending_approval'
  )

  const currentIdx = steps.findIndex(s => s.key === order.status)

  return (
    <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((step, i) => {
        const isDone = i < currentIdx
        const isActive = step.key === order.status
        return (
          <div key={step.key} className="flex items-center gap-1 flex-shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-2.5 h-2.5 rounded-full border-2 flex-shrink-0 ${
                isDone ? 'bg-green-500 border-green-500' :
                isActive ? 'bg-blue-600 border-blue-600' :
                'bg-white border-gray-300'
              }`} />
              <span className={`text-xs whitespace-nowrap ${
                isActive ? 'text-blue-700 font-semibold' :
                isDone ? 'text-green-600' : 'text-gray-400'
              }`}>{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 w-6 flex-shrink-0 mb-3.5 ${isDone ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function MyOrders() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState<MyOrder[]>([])
  const [totalBudgetAmt, setTotalBudgetAmt] = useState(DEFAULT_BUDGET)
  const [usedBudget, setUsedBudget] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!profile) return
      setLoading(true)
      const [ordersRes, totalBud, usedRes] = await Promise.all([
        supabase.from('orders')
          .select('*, products(name,category,needs_tailoring), quarters(name)')
          .eq('user_id', profile.id)
          .not('status', 'eq', 'pending')
          .order('created_at', { ascending: false }),
        getCurrentBudget(profile.id, CURRENT_YEAR),
        supabase.from('orders').select('unit_price, quantity')
          .eq('user_id', profile.id)
          .not('status', 'in', '(pending,cancelled)')
          .gte('created_at', `${CURRENT_YEAR}-01-01`),
      ])
      setOrders((ordersRes.data ?? []) as MyOrder[])
      setTotalBudgetAmt(totalBud)
      setUsedBudget((usedRes.data ?? []).reduce((s, o) => s + o.unit_price * o.quantity, 0))
      setLoading(false)
    }
    load()
  }, [profile])

  const totalBudget = totalBudgetAmt
  const remaining = totalBudget - usedBudget
  const budgetPct = Math.min(100, (usedBudget / totalBudget) * 100)

  const active = orders.filter(o => o.status !== 'issued' && o.status !== 'cancelled')
  const done = orders.filter(o => o.status === 'issued' || o.status === 'cancelled')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Meine Bestellungen</h1>
        <p className="text-gray-500 text-sm mt-1">Status und Verlauf deiner Bestellungen</p>
      </div>

      {/* Budget */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold text-gray-900">Jahresbudget {CURRENT_YEAR}</p>
          <p className="text-sm font-bold text-gray-700">€ {usedBudget.toFixed(2)} / € {totalBudget.toFixed(2)}</p>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${budgetPct > 90 ? 'bg-red-500' : budgetPct > 70 ? 'bg-amber-400' : 'bg-green-500'}`}
            style={{ width: `${budgetPct}%` }} />
        </div>
        <p className={`text-sm mt-2 font-medium ${remaining <= 0 ? 'text-red-600' : 'text-gray-600'}`}>
          {remaining <= 0
            ? 'Budget aufgebraucht – weitere Bestellungen benötigen Genehmigung'
            : `€ ${remaining.toFixed(2)} verbleibend`}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-center">
          <Package className="w-12 h-12 mb-3 text-gray-300" />
          <p className="font-semibold text-gray-500">Noch keine Bestellungen</p>
          <p className="text-sm text-gray-400 mt-1">Bestelle im Bekleidungskatalog</p>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Laufende Bestellungen</h2>
              <div className="space-y-3">
                {active.map(o => (
                  <div key={o.id} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{o.products?.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {o.products?.category} · Gr. {o.size} · {o.quantity}×
                          {o.products?.needs_tailoring && <span className="text-purple-600"> · Wappenänderung</span>}
                        </p>
                        <p className="text-xs text-gray-400">{o.quarters?.name}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ORDER_STATUS_COLORS[o.status]}`}>
                          {ORDER_STATUS_LABELS[o.status]}
                        </span>
                        <p className="text-xs text-gray-500 mt-1">€ {(o.unit_price * o.quantity).toFixed(2)}</p>
                      </div>
                    </div>
                    <Timeline order={o} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {done.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Abgeschlossen</h2>
              <div className="space-y-2">
                {done.map(o => (
                  <div key={o.id} className={`bg-white rounded-xl border px-5 py-3 flex items-center gap-4 ${o.status === 'cancelled' ? 'border-red-100 opacity-70' : 'border-gray-200'}`}>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{o.products?.name}</p>
                      <p className="text-xs text-gray-400">Gr. {o.size} · {o.quantity}× · {o.quarters?.name}</p>
                      {o.cancel_reason && <p className="text-xs text-red-500 mt-0.5">Grund: {o.cancel_reason}</p>}
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${ORDER_STATUS_COLORS[o.status]}`}>
                      {ORDER_STATUS_LABELS[o.status]}
                    </span>
                    <p className="text-sm font-semibold text-gray-700 flex-shrink-0">€ {(o.unit_price * o.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
