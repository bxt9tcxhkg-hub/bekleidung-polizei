import { useEffect, useState } from 'react'
import { X, ChevronDown, ShoppingCart, List } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Order, Product, Quarter } from '../lib/types'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  type OrderStatus,
} from '../lib/types'

const STATUS_FLOW: Record<OrderStatus, OrderStatus | null> = {
  pending: null,
  pending_approval: null,
  approved: 'ordered_supplier',
  ordered_supplier: 'at_tailor',
  at_tailor: 'ready_for_issue',
  ready_for_issue: 'partially_issued',
  partially_issued: 'issued',
  issued: null,
  cancelled: null,
}

const ALL_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]

interface SammelGroup {
  product_id: string
  productName: string
  category: string
  size: string
  orders: Order[]
  totalQty: number
}

export default function Orders() {
  const { profile, isAdmin } = useAuth()
  const [tab, setTab] = useState<'orders' | 'sammel'>('orders')
  const [orders, setOrders] = useState<Order[]>([])
  const [, setProducts] = useState<Product[]>([])
  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sammelQuarterId, setSammelQuarterId] = useState<string>('')

  async function load() {
    setLoading(true)
    const query = supabase
      .from('orders')
      .select('*, products(id,name,category,sizes), quarters(id,name,status), profiles(id,name,username,dienstnummer)')
      .not('status', 'eq', 'pending')
      .order('created_at', { ascending: false })

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
      const qs = qRes.data ?? []
      setQuarters(qs)
      const active = qs.find(q => q.status === 'active')
      if (active) setSammelQuarterId(active.id)
    }
    if (profile) init()
  }, [profile, isAdmin])

  const filtered = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter)

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

  async function toggleProcListed(order: Order) {
    await supabase.from('orders').update({ proc_listed: !order.proc_listed }).eq('id', order.id)
    load()
  }

  // Sammelbeschaffung: nur approved-Bestellungen des gewählten Quartals (Genehmiger hat bereits freigegeben)
  const sammelOrders = orders.filter(
    o => o.status === 'approved' && o.quarter_id === sammelQuarterId
  )

  // Gruppierung nach Produkt + Größe
  const sammelGroups: SammelGroup[] = Object.values(
    sammelOrders.reduce<Record<string, SammelGroup>>((acc, o) => {
      const key = `${o.product_id}__${o.size}`
      if (!acc[key]) {
        acc[key] = {
          product_id: o.product_id,
          productName: (o as any).products?.name ?? '–',
          category: (o as any).products?.category ?? '',
          size: o.size,
          orders: [],
          totalQty: 0,
        }
      }
      acc[key].orders.push(o)
      acc[key].totalQty += o.quantity
      return acc
    }, {})
  )

  async function submitGroup(group: SammelGroup) {
    const listed = group.orders.filter(o => o.proc_listed)
    if (listed.length === 0) { alert('Keine Bestellungen als "in Sammelbeschaffung" markiert.'); return }
    if (!confirm(`${listed.length} Bestellung(en) als "Beim Lieferanten" markieren?`)) return
    await Promise.all(
      listed.map(o =>
        supabase.from('orders').update({
          status: 'ordered_supplier',
          proc_listed: false,
          updated_at: new Date().toISOString(),
        }).eq('id', o.id)
      )
    )
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bestellungen</h1>
          <p className="text-gray-500 text-sm mt-1">{isAdmin ? 'Alle Bestellungen' : 'Meine Bestellungen'}</p>
        </div>
      </div>

      {/* Tab bar (admin only) */}
      {isAdmin && (
        <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
          <button onClick={() => setTab('orders')} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${tab === 'orders' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <List className="w-3.5 h-3.5" /> Alle Bestellungen
          </button>
          <button onClick={() => setTab('sammel')} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${tab === 'sammel' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <ShoppingCart className="w-3.5 h-3.5" /> Sammelbeschaffung
          </button>
        </div>
      )}

      {tab === 'orders' && (
        <>
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
                            {o.status === 'pending_approval' && (
                              <button
                                onClick={() => toggleProcListed(o)}
                                title="In Sammelbeschaffung aufnehmen"
                                className={`text-xs px-2 py-1 rounded-md border transition-colors ${o.proc_listed ? 'bg-blue-100 text-blue-700 border-blue-200' : 'text-gray-400 border-gray-200 hover:border-blue-300 hover:text-blue-600'}`}
                              >
                                SB
                              </button>
                            )}
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
        </>
      )}

      {tab === 'sammel' && isAdmin && (
        <div className="space-y-4">
          {/* Quartal-Auswahl */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Quartal:</label>
            <select
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={sammelQuarterId}
              onChange={e => setSammelQuarterId(e.target.value)}
            >
              <option value="">– Bitte wählen –</option>
              {quarters.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
            <span className="text-xs text-gray-400">Nur genehmigte Bestellungen (vom Genehmiger freigegeben)</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
          ) : sammelGroups.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-12 text-gray-400">
              <ShoppingCart className="w-10 h-10 mb-3" />
              <p>Keine genehmigten Bestellungen für dieses Quartal</p>
            </div>
          ) : sammelGroups.map(group => (
            <div key={`${group.product_id}__${group.size}`} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <div>
                  <span className="font-semibold text-gray-900">{group.productName}</span>
                  <span className="text-gray-400 text-sm ml-2">{group.category} · Gr. {group.size}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">
                    {group.orders.filter(o => o.proc_listed).length}/{group.orders.length} markiert · {group.orders.filter(o => o.proc_listed).reduce((s, o) => s + o.quantity, 0)}/{group.totalQty} Stk.
                  </span>
                  <button
                    onClick={() => submitGroup(group)}
                    disabled={group.orders.filter(o => o.proc_listed).length === 0}
                    className="text-xs font-medium bg-blue-800 hover:bg-blue-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
                  >
                    Bestellen
                  </button>
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {group.orders.map(o => (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="px-5 py-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={!!o.proc_listed}
                          onChange={() => toggleProcListed(o)}
                          className="rounded"
                        />
                      </td>
                      <td className="py-2.5 text-gray-900">
                        {(o as any).profiles?.name}
                        <span className="text-gray-400 text-xs ml-1">{(o as any).profiles?.dienstnummer ? `· DG ${(o as any).profiles.dienstnummer}` : ''}</span>
                      </td>
                      <td className="px-5 py-2.5 text-gray-500 text-right">{o.quantity}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
