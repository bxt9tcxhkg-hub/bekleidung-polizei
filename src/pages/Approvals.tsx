import { useEffect, useState } from 'react'
import { CheckSquare, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Order } from '../lib/types'

interface RejectModal { order: Order; reason: string }

export default function Approvals() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [rejectModal, setRejectModal] = useState<RejectModal | null>(null)
  const [processing, setProcessing] = useState(false)
  const [groupBy, setGroupBy] = useState<'user' | 'product'>('user')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, products(id,name,category,price), quarters(id,name), profiles(id,name,username,dienstnummer)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: true })
    setOrders(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function approve(order: Order) {
    setProcessing(true)
    await supabase.from('orders').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', order.id)
    setProcessing(false)
    load()
  }

  async function approveAll(orderIds: string[]) {
    if (!confirm(`${orderIds.length} Bestellung(en) genehmigen?`)) return
    setProcessing(true)
    await supabase.from('orders').update({ status: 'approved', updated_at: new Date().toISOString() }).in('id', orderIds)
    setProcessing(false)
    load()
  }

  async function reject() {
    if (!rejectModal) return
    setProcessing(true)
    await supabase.from('orders').update({
      status: 'cancelled',
      cancel_reason: rejectModal.reason || 'Abgelehnt',
      updated_at: new Date().toISOString(),
    }).eq('id', rejectModal.order.id)
    setRejectModal(null)
    setProcessing(false)
    load()
  }

  // Group by user
  const byUser = orders.reduce<Record<string, { label: string; orders: Order[] }>>((acc, o) => {
    const uid = (o as any).profiles?.id ?? 'unknown'
    const name = (o as any).profiles?.name ?? (o as any).profiles?.username ?? 'Unbekannt'
    const dn = (o as any).profiles?.dienstnummer ? ` (DG ${(o as any).profiles.dienstnummer})` : ''
    if (!acc[uid]) acc[uid] = { label: name + dn, orders: [] }
    acc[uid].orders.push(o)
    return acc
  }, {})

  // Group by product
  const byProduct = orders.reduce<Record<string, { label: string; orders: Order[] }>>((acc, o) => {
    const pid = (o as any).products?.id ?? 'unknown'
    const name = (o as any).products?.name ?? 'Unbekannt'
    if (!acc[pid]) acc[pid] = { label: name, orders: [] }
    acc[pid].orders.push(o)
    return acc
  }, {})

  const groups = groupBy === 'user' ? byUser : byProduct

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Genehmigungen</h1>
          <p className="text-gray-500 text-sm mt-1">{orders.length} Bestellung{orders.length !== 1 ? 'en' : ''} warten auf Genehmigung</p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button onClick={() => setGroupBy('user')} className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${groupBy === 'user' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Nach Benutzer</button>
          <button onClick={() => setGroupBy('product')} className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${groupBy === 'product' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Nach Produkt</button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-gray-400">
          <CheckSquare className="w-12 h-12 mb-3" />
          <p className="font-medium">Keine ausstehenden Genehmigungen</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([key, { label, orders: gOrders }]) => (
            <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <span className="font-semibold text-gray-900 text-sm">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{gOrders.length} Artikel</span>
                  <button
                    onClick={() => approveAll(gOrders.map(o => o.id))}
                    disabled={processing}
                    className="text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
                  >
                    Alle genehmigen
                  </button>
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {gOrders.map(o => (
                  <div key={o.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      {groupBy === 'user' ? (
                        <>
                          <p className="text-sm font-medium text-gray-900">{(o as any).products?.name}</p>
                          <p className="text-xs text-gray-400">{(o as any).quarters?.name} · Gr. {o.size} · {o.quantity}×</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-gray-900">{(o as any).profiles?.name}</p>
                          <p className="text-xs text-gray-400">{(o as any).quarters?.name} · Gr. {o.size} · {o.quantity}×</p>
                        </>
                      )}
                    </div>
                    <span className="text-sm text-gray-500">€ {((o as any).products?.price ?? 0).toFixed(2)}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => approve(o)}
                        disabled={processing}
                        title="Genehmigen"
                        className="p-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-md disabled:opacity-40 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setRejectModal({ order: o, reason: '' })}
                        disabled={processing}
                        title="Ablehnen"
                        className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-md disabled:opacity-40 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Bestellung ablehnen</h2>
              <button onClick={() => setRejectModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-sm text-gray-700">
                <span className="font-medium">{(rejectModal.order as any).products?.name}</span>
                {' '}– {(rejectModal.order as any).profiles?.name}
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ablehnungsgrund</label>
                <textarea
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  placeholder="Optional: Begründung für den Benutzer"
                  value={rejectModal.reason}
                  onChange={e => setRejectModal(m => m ? { ...m, reason: e.target.value } : null)}
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setRejectModal(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={reject} disabled={processing} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {processing ? 'Wird abgelehnt...' : 'Ablehnen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
