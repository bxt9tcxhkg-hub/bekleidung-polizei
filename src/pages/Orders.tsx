import { useEffect, useState } from 'react'
import { Plus, X, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Order, Product, Quarter } from '../lib/types'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  type OrderStatus,
} from '../lib/types'

const STATUS_FLOW: Record<OrderStatus, OrderStatus | null> = {
  pending: 'pending_approval',
  pending_approval: 'ordered_supplier',
  ordered_supplier: 'at_tailor',
  at_tailor: 'ready_for_issue',
  ready_for_issue: 'partially_issued',
  partially_issued: 'issued',
  issued: null,
  cancelled: null,
}

const ALL_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]

export default function Orders() {
  const { profile, isAdmin } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ product_id: '', quarter_id: '', size: '', quantity: 1 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const query = supabase
      .from('orders')
      .select('*, products(id,name,category,sizes), quarters(id,name,status), profiles(id,name,username,dienstnummer)')
      .order('created_at', { ascending: false })

    if (!isAdmin) query.eq('user_id', profile!.id)

    const { data } = await query
    setOrders(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    async function init() {
      await load()
      const [pRes, qRes] = await Promise.all([
        supabase.from('products').select('*').eq('active', true).order('name'),
        supabase.from('quarters').select('*').order('year', { ascending: false }),
      ])
      setProducts(pRes.data ?? [])
      setQuarters(qRes.data ?? [])
    }
    if (profile) init()
  }, [profile, isAdmin])

  const filtered = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter)
  const selectedProduct = products.find(p => p.id === form.product_id)

  async function createOrder() {
    setError('')
    if (!form.product_id || !form.quarter_id || !form.size) { setError('Alle Felder sind Pflicht.'); return }
    const selectedQuarter = quarters.find(q => q.id === form.quarter_id)
    if (selectedQuarter?.status === 'closed') { setError('Das gewählte Quartal ist gesperrt. Bestellungen sind nicht mehr möglich.'); return }
    setSaving(true)
    const { error } = await supabase.from('orders').insert({
      user_id: profile!.id,
      product_id: form.product_id,
      quarter_id: form.quarter_id,
      size: form.size,
      quantity: form.quantity,
      status: 'pending',
    })
    if (error) setError(error.message)
    else { setShowForm(false); setForm({ product_id: '', quarter_id: '', size: '', quantity: 1 }); load() }
    setSaving(false)
  }

  async function advanceStatus(order: Order) {
    const next = STATUS_FLOW[order.status]
    if (!next) return
    await supabase.from('orders').update({ status: next, updated_at: new Date().toISOString() }).eq('id', order.id)
    load()
  }

  async function cancelOrder(order: Order) {
    if (!confirm('Bestellung wirklich stornieren?')) return
    await supabase.from('orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', order.id)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bestellungen</h1>
          <p className="text-gray-500 text-sm mt-1">{isAdmin ? 'Alle Bestellungen' : 'Meine Bestellungen'}</p>
        </div>
        <button onClick={() => { setError(''); setShowForm(true) }} className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Neue Bestellung
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap mb-4">
        <button onClick={() => setStatusFilter('all')} className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${statusFilter === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
          Alle
        </button>
        {ALL_STATUSES.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
            {ORDER_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {isAdmin && <th className="text-left px-4 py-3 font-semibold text-gray-600">Benutzer</th>}
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Produkt</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Quartal</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Gr. / Menge</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">Keine Bestellungen</td></tr>
              ) : filtered.map(o => (
                <tr key={o.id} className="hover:bg-gray-50">
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{(o as any).profiles?.name}</p>
                      <p className="text-xs text-gray-400">{(o as any).profiles?.dienstnummer ? `DG ${(o as any).profiles.dienstnummer}` : (o as any).profiles?.username}</p>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{(o as any).products?.name}</p>
                    <p className="text-xs text-gray-400">{(o as any).products?.category}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{(o as any).quarters?.name}</td>
                  <td className="px-4 py-3 text-gray-600">{o.size} · {o.quantity}×</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ORDER_STATUS_COLORS[o.status]}`}>
                      {ORDER_STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {STATUS_FLOW[o.status] && (
                          <button onClick={() => advanceStatus(o)} title={`→ ${ORDER_STATUS_LABELS[STATUS_FLOW[o.status]!]}`} className="flex items-center gap-1 text-xs text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-md">
                            <ChevronDown className="w-3 h-3" /> Weiter
                          </button>
                        )}
                        {o.status !== 'cancelled' && o.status !== 'issued' && (
                          <button onClick={() => cancelOrder(o)} className="p-1.5 hover:bg-red-50 rounded-md text-red-400 hover:text-red-600">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Order Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Neue Bestellung</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Produkt *</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value, size: '' }))}>
                  <option value="">– Bitte wählen –</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.category})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quartal *</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.quarter_id} onChange={e => setForm(f => ({ ...f, quarter_id: e.target.value }))}>
                  <option value="">– Bitte wählen –</option>
                  {quarters.filter(q => q.status !== 'closed').map(q => <option key={q.id} value={q.id}>{q.name} ({q.status === 'active' ? 'Aktiv' : 'Geplant'})</option>)}
                </select>
              </div>
              {selectedProduct && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Größe *</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedProduct.sizes.map(s => (
                      <button key={s} type="button" onClick={() => setForm(f => ({ ...f, size: s }))} className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${form.size === s ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Menge *</label>
                <input type="number" min="1" max="99" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={createOrder} disabled={saving} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Bestellen...' : 'Bestellen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
