import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, User, Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Order, StockOrder } from '../lib/types'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, STOCK_ORDER_STATUS_COLORS, STOCK_ORDER_STATUS_LABELS } from '../lib/types'
import { getCurrentBudget, getUsedBudget } from '../lib/budget'
import { logAudit } from '../lib/audit'
import { fmtEUR } from '../lib/format'

const CURRENT_YEAR = new Date().getFullYear()

type PendingOrder = Order & {
  products?: { name: string; category: string; price: number }
  quarters?: { name: string }
  profiles?: { name: string; dienstnummer: string | null; username: string }
}

export default function Approvals() {
  const [orders, setOrders] = useState<PendingOrder[]>([])
  const [stockOrders, setStockOrders] = useState<StockOrder[]>([])
  const [budgets, setBudgets] = useState<Record<string, { total: number; used: number }>>({})
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState<{ id: string; reason: string; type: 'order' | 'stock' } | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const [ordersRes, stockRes] = await Promise.all([
      supabase
        .from('orders')
        .select('*, products(name,category,price), quarters(name), profiles(name,dienstnummer,username)')
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: true }),
      supabase
        .from('stock_orders')
        .select('*, products(id,name,article_number,category), requester:profiles!stock_orders_requested_by_fkey(id,name)')
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: true }),
    ])
    const pending = (ordersRes.data ?? []) as PendingOrder[]
    setOrders(pending)
    setStockOrders((stockRes.data ?? []) as StockOrder[])
    // Budget-Kontext pro Benutzer laden (Jahresbudget + bereits verbraucht)
    const userIds = Array.from(new Set(pending.map(o => o.user_id)))
    const budgetEntries = await Promise.all(userIds.map(async uid => {
      const [total, used] = await Promise.all([
        getCurrentBudget(uid, CURRENT_YEAR),
        getUsedBudget(uid, CURRENT_YEAR),
      ])
      return [uid, { total, used }] as const
    }))
    setBudgets(Object.fromEntries(budgetEntries))
    setLoading(false)
  }

  useEffect(() => { load().catch(() => setError('Freigaben konnten nicht geladen werden.')) }, [])

  async function approve(order: PendingOrder) {
    if (processing) return
    setProcessing(order.id)
    setError('')
    const { error: err } = await supabase.from('orders').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', order.id)
    setProcessing(null)
    if (err) {
      setError('Freigabe konnte nicht gespeichert werden. Bitte erneut versuchen.')
      return
    }
    logAudit('Bestellung genehmigt', order.profiles?.name ?? '?')
    load()
  }

  async function reject(id: string, reason: string) {
    if (!reason.trim() || processing) return
    setProcessing(id)
    setError('')
    const { error: err } = await supabase.from('orders').update({ status: 'cancelled', cancel_reason: reason, updated_at: new Date().toISOString() }).eq('id', id)
    setProcessing(null)
    if (err) {
      setError('Ablehnung konnte nicht gespeichert werden. Bitte erneut versuchen.')
      return
    }
    logAudit('Bestellung abgelehnt', orders.find(o => o.id === id)?.profiles?.name ?? '?')
    setCancelReason(null)
    load()
  }

  async function approveStockOrder(id: string) {
    if (processing) return
    setProcessing(id)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('stock_orders').update({
      status: 'approved',
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setProcessing(null)
    if (err) {
      setError('Freigabe konnte nicht gespeichert werden. Bitte erneut versuchen.')
      return
    }
    logAudit('Lagerbestellung genehmigt', stockOrders.find(o => o.id === id)?.products?.name ?? '?')
    load()
  }

  async function rejectStockOrder(id: string, reason: string) {
    if (!reason.trim() || processing) return
    setProcessing(id)
    setError('')
    const { error: err } = await supabase.from('stock_orders').update({
      status: 'rejected',
      note: reason,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setProcessing(null)
    if (err) {
      setError('Ablehnung konnte nicht gespeichert werden. Bitte erneut versuchen.')
      return
    }
    logAudit('Lagerbestellung abgelehnt', stockOrders.find(o => o.id === id)?.products?.name ?? '?')
    setCancelReason(null)
    load()
  }

  const byUser = orders.reduce<Record<string, PendingOrder[]>>((acc, o) => {
    const key = o.user_id
    if (!acc[key]) acc[key] = []
    acc[key].push(o)
    return acc
  }, {})

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Freigaben</h1>
        <p className="text-gray-500 text-sm mt-1">Budgetüberschreitungen und Lagerbestellungen genehmigen</p>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <>
          {/* ── Budgetüberschreitungen ── */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Budgetüberschreitungen</h2>
            {orders.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-center">
                <CheckCircle className="w-12 h-12 mb-3 text-gray-300" />
                <p className="font-semibold text-gray-500">Keine offenen Freigaben</p>
                <p className="text-sm text-gray-400 mt-1">Alle Bestellungen liegen im Budget</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(byUser).map(([, userOrders]) => {
                  const user = userOrders[0].profiles
                  const totalValue = userOrders.reduce((s, o) => s + (o.unit_price * o.quantity), 0)
                  const budget = budgets[userOrders[0].user_id]
                  return (
                    <div key={userOrders[0].user_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="flex items-center gap-3 px-5 py-3 bg-amber-50 border-b border-amber-100">
                        <div className="p-1.5 bg-amber-100 rounded-lg">
                          <User className="w-4 h-4 text-amber-700" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{user?.name ?? '–'}</p>
                          <p className="text-xs text-gray-500">{user?.dienstnummer ? `DG ${user.dienstnummer}` : user?.username}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-amber-700 font-medium flex items-center gap-1 justify-end">
                            <AlertTriangle className="w-3.5 h-3.5" /> Budget überschritten
                          </p>
                          <p className="text-xs text-gray-500">{userOrders.length} Artikel · {fmtEUR(totalValue)}</p>
                          {budget && (
                            <p className="text-xs text-gray-500">Budget: {fmtEUR(budget.used)} verbraucht / {fmtEUR(budget.total)} gesamt</p>
                          )}
                        </div>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {userOrders.map(o => (
                          <div key={o.id} className="flex items-center gap-4 px-5 py-4">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900">{o.products?.name}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {o.products?.category} · Gr. {o.size} · {o.quantity}× · {o.quarters?.name}
                              </p>
                            </div>
                            <div className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                              {fmtEUR(o.unit_price * o.quantity)}
                            </div>
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ORDER_STATUS_COLORS[o.status]}`}>
                              {ORDER_STATUS_LABELS[o.status]}
                            </span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => approve(o)} disabled={processing === o.id}
                                className="flex items-center gap-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
                                <CheckCircle className="w-3.5 h-3.5" /> Freigeben
                              </button>
                              <button onClick={() => setCancelReason({ id: o.id, reason: '', type: 'order' })} disabled={processing === o.id}
                                className="flex items-center gap-1.5 text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
                                <XCircle className="w-3.5 h-3.5" /> Ablehnen
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Lagerbestellungen ── */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Lagerbestellungen</h2>
            {stockOrders.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-center">
                <Package className="w-12 h-12 mb-3 text-gray-300" />
                <p className="font-semibold text-gray-500">Keine offenen Lagerbestellungen</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">Artikel</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">Gr. / Anz.</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600 hidden sm:table-cell">Angefordert von</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600 hidden sm:table-cell">Notiz</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stockOrders.map(o => (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-5 py-4">
                          <p className="font-medium text-gray-900">{o.products?.name ?? '–'}</p>
                          <p className="text-xs text-gray-400">{o.products?.article_number} · {o.products?.category}</p>
                        </td>
                        <td className="px-5 py-4 text-gray-700">{o.size} · {o.quantity}×</td>
                        <td className="px-5 py-4 text-gray-500 hidden sm:table-cell">{o.requester?.name ?? '–'}</td>
                        <td className="px-5 py-4 text-gray-400 text-xs hidden sm:table-cell">{o.note ?? '–'}</td>
                        <td className="px-5 py-4">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STOCK_ORDER_STATUS_COLORS[o.status]}`}>
                            {STOCK_ORDER_STATUS_LABELS[o.status]}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => approveStockOrder(o.id)} disabled={processing === o.id}
                              className="flex items-center gap-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
                              <CheckCircle className="w-3.5 h-3.5" /> Freigeben
                            </button>
                            <button onClick={() => setCancelReason({ id: o.id, reason: '', type: 'stock' })} disabled={processing === o.id}
                              className="flex items-center gap-1.5 text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
                              <XCircle className="w-3.5 h-3.5" /> Ablehnen
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {cancelReason && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">
                {cancelReason.type === 'stock' ? 'Lagerbestellung ablehnen' : 'Bestellung ablehnen'}
              </h2>
            </div>
            <div className="px-6 py-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Begründung *</label>
              <textarea rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                value={cancelReason.reason} onChange={e => setCancelReason(r => r ? { ...r, reason: e.target.value } : r)}
                placeholder="Grund für die Ablehnung..." autoFocus />
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setCancelReason(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button
                onClick={() => cancelReason.type === 'stock'
                  ? rejectStockOrder(cancelReason.id, cancelReason.reason)
                  : reject(cancelReason.id, cancelReason.reason)
                }
                disabled={!cancelReason.reason.trim() || processing === cancelReason.id}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">
                Ablehnen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
