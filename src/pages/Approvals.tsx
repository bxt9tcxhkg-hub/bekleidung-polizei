import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, User } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Order } from '../lib/types'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '../lib/types'

type PendingOrder = Order & {
  products?: { name: string; category: string; price: number }
  quarters?: { name: string }
  profiles?: { name: string; dienstnummer: string | null; username: string }
}

export default function Approvals() {
  const [orders, setOrders] = useState<PendingOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState<{ id: string; reason: string } | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, products(name,category,price), quarters(name), profiles(name,dienstnummer,username)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: true })
    setOrders((data ?? []) as PendingOrder[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function approve(order: PendingOrder) {
    setProcessing(order.id)
    await supabase.from('orders').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', order.id)
    setProcessing(null)
    load()
  }

  async function reject(id: string, reason: string) {
    if (!reason.trim()) return
    setProcessing(id)
    await supabase.from('orders').update({ status: 'cancelled', cancel_reason: reason, updated_at: new Date().toISOString() }).eq('id', id)
    setCancelReason(null)
    setProcessing(null)
    load()
  }

  const byUser = orders.reduce<Record<string, PendingOrder[]>>((acc, o) => {
    const key = o.user_id
    if (!acc[key]) acc[key] = []
    acc[key].push(o)
    return acc
  }, {})

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Freigaben</h1>
        <p className="text-gray-500 text-sm mt-1">Bestellungen mit überschrittenem Budget warten auf Genehmigung</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-gray-400">
          <CheckCircle className="w-12 h-12 mb-3 text-green-400" />
          <p className="font-medium text-gray-600">Keine offenen Freigaben</p>
          <p className="text-sm mt-1">Alle Bestellungen liegen im Budget</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byUser).map(([, userOrders]) => {
            const user = userOrders[0].profiles
            const totalValue = userOrders.reduce((s, o) => s + (o.unit_price * o.quantity), 0)
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
                    <p className="text-xs text-gray-500">{userOrders.length} Artikel · € {totalValue.toFixed(2)}</p>
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
                        € {(o.unit_price * o.quantity).toFixed(2)}
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ORDER_STATUS_COLORS[o.status]}`}>
                        {ORDER_STATUS_LABELS[o.status]}
                      </span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => approve(o)} disabled={processing === o.id}
                          className="flex items-center gap-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                          <CheckCircle className="w-3.5 h-3.5" /> Freigeben
                        </button>
                        <button onClick={() => setCancelReason({ id: o.id, reason: '' })} disabled={processing === o.id}
                          className="flex items-center gap-1.5 text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
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

      {cancelReason && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Bestellung ablehnen</h2>
            </div>
            <div className="px-6 py-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Begründung *</label>
              <textarea rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                value={cancelReason.reason} onChange={e => setCancelReason(r => r ? { ...r, reason: e.target.value } : r)}
                placeholder="Grund für die Ablehnung..." autoFocus />
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setCancelReason(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={() => reject(cancelReason.id, cancelReason.reason)} disabled={!cancelReason.reason.trim() || processing === cancelReason.id}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                Ablehnen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
