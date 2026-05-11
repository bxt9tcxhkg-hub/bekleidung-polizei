import { useEffect, useState } from 'react'
import { ShoppingBag, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Order } from '../lib/types'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../lib/types'

const STATUS_STEPS = [
  { key: 'pending_approval', label: 'Eingereicht' },
  { key: 'approved', label: 'Genehmigt' },
  { key: 'ordered_supplier', label: 'Bestellt' },
  { key: 'at_tailor', label: 'Beim Schneider' },
  { key: 'ready_for_issue', label: 'Bereit' },
  { key: 'partially_issued', label: 'Teil-Ausgabe' },
  { key: 'issued', label: 'Ausgegeben' },
]

function statusStepIndex(status: string) {
  return STATUS_STEPS.findIndex(s => s.key === status)
}

function StatusTimeline({ status }: { status: string }) {
  if (status === 'cancelled') {
    return <span className="text-xs font-medium text-red-600 bg-red-50 px-2.5 py-1 rounded-full">Storniert</span>
  }
  const current = statusStepIndex(status)
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STATUS_STEPS.map((step, i) => (
        <div key={step.key} className="flex items-center gap-1">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            i < current ? 'bg-green-100 text-green-700' :
            i === current ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' :
            'bg-gray-100 text-gray-400'
          }`}>
            {step.label}
          </span>
          {i < STATUS_STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />}
        </div>
      ))}
    </div>
  )
}

export default function MyOrders() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedQuarters, setExpandedQuarters] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('orders')
        .select('*, products(name, category, price, needs_tailoring), quarters(id, name, year, quarter_num)')
        .eq('user_id', profile!.id)
        .not('status', 'eq', 'pending')
        .order('created_at', { ascending: false })
      const items = (data ?? []) as Order[]
      setOrders(items)
      // Auto-expand quarters with active orders
      const activeQuarterIds = new Set(
        items.filter(o => o.status !== 'issued' && o.status !== 'cancelled').map(o => o.quarter_id)
      )
      setExpandedQuarters(activeQuarterIds)
      setLoading(false)
    }
    if (profile) load()
  }, [profile])

  // Group by quarter
  const byQuarter = orders.reduce<Record<string, { name: string; orders: Order[] }>>((acc, o) => {
    const qId = o.quarter_id
    const qName = (o as any).quarters?.name ?? 'Unbekannt'
    if (!acc[qId]) acc[qId] = { name: qName, orders: [] }
    acc[qId].orders.push(o)
    return acc
  }, {})

  const quarterIds = Object.keys(byQuarter).sort((a, b) => {
    const qa = (byQuarter[a].orders[0] as any)?.quarters
    const qb = (byQuarter[b].orders[0] as any)?.quarters
    if (!qa || !qb) return 0
    return qb.year - qa.year || qb.quarter_num - qa.quarter_num
  })

  function toggleQuarter(id: string) {
    setExpandedQuarters(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Meine Bestellungen</h1>
        <p className="text-gray-500 text-sm mt-1">Alle eingereichten Bestellungen und ihr aktueller Status</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : quarterIds.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-gray-400">
          <ShoppingBag className="w-12 h-12 mb-3" />
          <p className="font-medium">Keine Bestellungen vorhanden</p>
          <p className="text-sm mt-1">Eingereichte Bestellungen erscheinen hier</p>
        </div>
      ) : (
        <div className="space-y-3">
          {quarterIds.map(qId => {
            const { name, orders: qOrders } = byQuarter[qId]
            const expanded = expandedQuarters.has(qId)
            const activeCount = qOrders.filter(o => o.status !== 'issued' && o.status !== 'cancelled').length
            const issuedCount = qOrders.filter(o => o.status === 'issued').length

            return (
              <div key={qId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleQuarter(qId)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                    <span className="font-semibold text-gray-900">{name}</span>
                    <span className="text-xs text-gray-400">{qOrders.length} Artikel</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeCount > 0 && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{activeCount} aktiv</span>
                    )}
                    {issuedCount > 0 && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{issuedCount} ausgegeben</span>
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {qOrders.map(o => (
                      <div key={o.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div>
                            <p className="font-medium text-gray-900">{(o as any).products?.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {(o as any).products?.category} · Gr. {o.size} · {o.quantity}×
                              {(o as any).products?.needs_tailoring && <span className="ml-1 text-purple-600">· Schneider</span>}
                            </p>
                          </div>
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${ORDER_STATUS_COLORS[o.status]}`}>
                            {ORDER_STATUS_LABELS[o.status]}
                          </span>
                        </div>
                        {o.status !== 'cancelled' && (
                          <StatusTimeline status={o.status} />
                        )}
                        {o.status === 'cancelled' && o.cancel_reason && (
                          <p className="text-xs text-red-600 mt-1">Grund: {o.cancel_reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
