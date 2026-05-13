import { useEffect, useState } from 'react'
import { Plus, X, Package, Warehouse, ClipboardList, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Product, Inventory, StockOrder } from '../lib/types'
import { STOCK_ORDER_STATUS_LABELS, STOCK_ORDER_STATUS_COLORS } from '../lib/types'

type Tab = 'bestand' | 'bestellungen'

interface InventoryEntry extends Inventory {
  products?: Product
}

function StockBadge({ qty }: { qty: number }) {
  if (qty > 0) return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
      {qty}×
    </span>
  )
  return <span className="text-xs text-gray-400">–</span>
}

export default function Lager() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('bestand')

  // Bestand state
  const [products, setProducts] = useState<Product[]>([])
  const [inventory, setInventory] = useState<InventoryEntry[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState('')
  const [addForm, setAddForm] = useState<{ product_id: string; size: string; quantity: string } | null>(null)
  const [addProductSearch, setAddProductSearch] = useState('')
  const [addProductDropdown, setAddProductDropdown] = useState(false)
  const [saving, setSaving] = useState(false)

  // Lagerbestellungen state
  const [stockOrders, setStockOrders] = useState<StockOrder[]>([])
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [orderForm, setOrderForm] = useState({ product_id: '', size: '', quantity: '', note: '' })
  const [orderProductSearch, setOrderProductSearch] = useState('')
  const [orderProductDropdown, setOrderProductDropdown] = useState(false)
  const [orderError, setOrderError] = useState('')
  const [loading, setLoading] = useState(true)

  async function loadAll() {
    setLoading(true)
    const [prodsRes, invRes, ordersRes] = await Promise.all([
      supabase.from('products').select('*').eq('active', true).order('name'),
      supabase.from('inventory').select('*, products(*)').order('updated_at', { ascending: false }),
      supabase.from('stock_orders')
        .select('*, products(id,name,article_number,sizes), requester:profiles!stock_orders_requested_by_fkey(id,name), approver:profiles!stock_orders_approved_by_fkey(id,name)')
        .order('created_at', { ascending: false }),
    ])
    setProducts(prodsRes.data ?? [])
    setInventory((invRes.data ?? []) as InventoryEntry[])
    setStockOrders((ordersRes.data ?? []) as StockOrder[])
    setLoading(false)
  }

  useEffect(() => { if (profile) loadAll() }, [profile])

  // ── Bestand ──────────────────────────────────────────────────────────────

  async function saveQty(entry: InventoryEntry) {
    const qty = parseInt(editQty)
    if (isNaN(qty) || qty < 0) return
    setSaving(true)
    await supabase.from('inventory').update({ quantity: qty, updated_at: new Date().toISOString() }).eq('id', entry.id)
    setEditingId(null)
    setSaving(false)
    loadAll()
  }

  async function createInventory() {
    if (!addForm?.product_id || !addForm.size || !addForm.quantity) return
    const qty = parseInt(addForm.quantity)
    if (isNaN(qty) || qty < 0) return
    setSaving(true)
    await supabase.from('inventory').upsert(
      { product_id: addForm.product_id, size: addForm.size, quantity: qty, updated_at: new Date().toISOString() },
      { onConflict: 'product_id,size' }
    )
    setAddForm(null)
    setAddProductSearch('')
    setSaving(false)
    loadAll()
  }

  const addFilteredProducts = addProductSearch.trim().length > 0
    ? products.filter(p =>
        p.name.toLowerCase().includes(addProductSearch.toLowerCase()) ||
        p.article_number.toLowerCase().includes(addProductSearch.toLowerCase())
      )
    : products

  const selectedAddProduct = addForm ? products.find(p => p.id === addForm.product_id) : null

  // Group inventory by product for display
  const invByProduct = inventory.reduce<Record<string, InventoryEntry[]>>((acc, e) => {
    const key = e.product_id
    if (!acc[key]) acc[key] = []
    acc[key].push(e)
    return acc
  }, {})

  // ── Lagerbestellungen ─────────────────────────────────────────────────────

  const orderFilteredProducts = orderProductSearch.trim().length > 0
    ? products.filter(p =>
        p.name.toLowerCase().includes(orderProductSearch.toLowerCase()) ||
        p.article_number.toLowerCase().includes(orderProductSearch.toLowerCase())
      )
    : products

  const selectedOrderProduct = orderForm.product_id ? products.find(p => p.id === orderForm.product_id) : null

  async function createStockOrder() {
    setOrderError('')
    if (!orderForm.product_id || !orderForm.size || !orderForm.quantity) {
      setOrderError('Bitte alle Pflichtfelder ausfüllen.')
      return
    }
    const qty = parseInt(orderForm.quantity)
    if (isNaN(qty) || qty <= 0) { setOrderError('Ungültige Menge.'); return }
    setSaving(true)
    const { error } = await supabase.from('stock_orders').insert({
      product_id: orderForm.product_id,
      size: orderForm.size,
      quantity: qty,
      note: orderForm.note || null,
      requested_by: profile!.id,
      status: 'pending_approval' as const,
      approved_by: null,
      approved_at: null,
      received_at: null,
    })
    if (error) { setOrderError(error.message); setSaving(false); return }
    setShowOrderForm(false)
    setOrderForm({ product_id: '', size: '', quantity: '', note: '' })
    setOrderProductSearch('')
    setSaving(false)
    loadAll()
  }

  async function markReceived(order: StockOrder) {
    setSaving(true)
    await supabase.from('stock_orders').update({
      status: 'received',
      received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', order.id)
    // Update inventory
    await supabase.from('inventory').upsert(
      { product_id: order.product_id, size: order.size, quantity: order.quantity, updated_at: new Date().toISOString() },
      { onConflict: 'product_id,size' }
    )
    setSaving(false)
    loadAll()
  }

  const pendingOrders = stockOrders.filter(o => o.status === 'pending_approval').length
  const approvedOrders = stockOrders.filter(o => o.status === 'approved').length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lagerverwaltung</h1>
          <p className="text-gray-500 text-sm mt-1">Lagerbestand erfassen und Nachbestellungen verwalten</p>
        </div>
        {tab === 'bestellungen' && (
          <button
            onClick={() => { setShowOrderForm(true); setOrderForm({ product_id: '', size: '', quantity: '', note: '' }); setOrderProductSearch(''); setOrderError('') }}
            className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Lagerbestellung
          </button>
        )}
        {tab === 'bestand' && (
          <button
            onClick={() => setAddForm({ product_id: '', size: '', quantity: '' })}
            className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Bestand erfassen
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={() => setTab('bestand')}
          className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all ${tab === 'bestand' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Warehouse className="w-4 h-4" /> Bestand
        </button>
        <button onClick={() => setTab('bestellungen')}
          className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all ${tab === 'bestellungen' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <ClipboardList className="w-4 h-4" /> Lagerbestellungen
          {(pendingOrders + approvedOrders) > 0 && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {pendingOrders + approvedOrders}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <>
          {/* ── Bestand ── */}
          {tab === 'bestand' && (
            <div className="space-y-3">
              {Object.keys(invByProduct).length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-gray-400">
                  <Warehouse className="w-10 h-10 mb-3 opacity-40" />
                  <p className="font-medium text-gray-600">Kein Bestand erfasst</p>
                  <p className="text-sm mt-1">Klicke „Bestand erfassen" um Artikel einzubuchen</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Artikel</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Kategorie</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Größe</th>
                        <th className="text-center px-4 py-3 font-semibold text-gray-600">Bestand</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {Object.entries(invByProduct).flatMap(([, entries]) =>
                        entries.map(entry => (
                          <tr key={entry.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{entry.products?.name ?? '–'}</p>
                              <p className="text-xs text-gray-400">{entry.products?.article_number}</p>
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{entry.products?.category}</td>
                            <td className="px-4 py-3 text-gray-600">{entry.size}</td>
                            <td className="px-4 py-3 text-center">
                              {editingId === entry.id ? (
                                <div className="flex items-center justify-center gap-2">
                                  <input type="number" min="0"
                                    className="w-16 text-center border border-blue-400 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={editQty}
                                    onChange={e => setEditQty(e.target.value)}
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') saveQty(entry); if (e.key === 'Escape') setEditingId(null) }}
                                  />
                                  <button onClick={() => saveQty(entry)} disabled={saving}
                                    className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50">
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setEditingId(null)}
                                    className="p-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => { setEditingId(entry.id); setEditQty(String(entry.quantity)) }}
                                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800 hover:text-blue-700 hover:bg-blue-50 px-3 py-1 rounded-lg transition-colors">
                                  <StockBadge qty={entry.quantity} />
                                  <span className="text-xs text-gray-400 font-normal">bearbeiten</span>
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-xs text-gray-400">
                                {entry.updated_at ? new Date(entry.updated_at).toLocaleDateString('de-AT') : ''}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Lagerbestellungen ── */}
          {tab === 'bestellungen' && (
            <div className="space-y-3">
              {stockOrders.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-gray-400">
                  <Package className="w-10 h-10 mb-3 opacity-40" />
                  <p className="font-medium text-gray-600">Keine Lagerbestellungen</p>
                  <p className="text-sm mt-1">Bestelle Waren auf Lager mit dem Button oben</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Artikel</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Gr. / Anz.</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Angefordert von</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Datum</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Notiz</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stockOrders.map(o => (
                        <tr key={o.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{(o as any).products?.name ?? '–'}</p>
                            <p className="text-xs text-gray-400">{(o as any).products?.article_number}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{o.size} · {o.quantity}×</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STOCK_ORDER_STATUS_COLORS[o.status]}`}>
                              {STOCK_ORDER_STATUS_LABELS[o.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{(o as any).requester?.name ?? '–'}</td>
                          <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                            {new Date(o.created_at).toLocaleDateString('de-AT')}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">{o.note ?? '–'}</td>
                          <td className="px-4 py-3 text-right">
                            {o.status === 'approved' && (
                              <button onClick={() => markReceived(o)} disabled={saving}
                                className="text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 whitespace-nowrap">
                                Wareneingang
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Bestand erfassen Modal ── */}
      {addForm !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Bestand erfassen</h2>
              <button onClick={() => { setAddForm(null); setAddProductSearch('') }} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">Artikel *</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Artikelname oder -nummer..."
                  value={addProductSearch}
                  onChange={e => { setAddProductSearch(e.target.value); setAddProductDropdown(true); if (!e.target.value) setAddForm(f => f ? { ...f, product_id: '', size: '' } : f) }}
                  onFocus={() => setAddProductDropdown(true)}
                  onBlur={() => setTimeout(() => setAddProductDropdown(false), 150)}
                />
                {addProductDropdown && addFilteredProducts.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {addFilteredProducts.map(p => (
                      <li key={p.id}>
                        <button type="button" onMouseDown={() => { setAddForm(f => f ? { ...f, product_id: p.id, size: '' } : f); setAddProductSearch(p.name); setAddProductDropdown(false) }}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50">
                          <p className="text-sm font-medium text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-400">{p.article_number} · {p.category}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {addForm.product_id && <p className="text-xs text-green-600 mt-1">✓ Artikel ausgewählt</p>}
              </div>
              {selectedAddProduct && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Größe *</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={addForm.size}
                    onChange={e => setAddForm(f => f ? { ...f, size: e.target.value } : f)}
                  >
                    <option value="">Größe wählen...</option>
                    {selectedAddProduct.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Menge *</label>
                <input type="number" min="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0" value={addForm.quantity}
                  onChange={e => setAddForm(f => f ? { ...f, quantity: e.target.value } : f)} />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => { setAddForm(null); setAddProductSearch('') }}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={createInventory} disabled={saving || !addForm.product_id || !addForm.size || !addForm.quantity}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lagerbestellung aufgeben Modal ── */}
      {showOrderForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Neue Lagerbestellung</h2>
              <button onClick={() => { setShowOrderForm(false); setOrderProductSearch(''); setOrderError('') }} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                Lagerbestellungen müssen vom Genehmiger freigegeben werden, bevor der Wareneingang gebucht werden kann.
              </p>
              <div className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">Artikel *</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Artikelname oder -nummer..."
                  value={orderProductSearch}
                  onChange={e => { setOrderProductSearch(e.target.value); setOrderProductDropdown(true); if (!e.target.value) setOrderForm(f => ({ ...f, product_id: '', size: '' })) }}
                  onFocus={() => setOrderProductDropdown(true)}
                  onBlur={() => setTimeout(() => setOrderProductDropdown(false), 150)}
                />
                {orderProductDropdown && orderFilteredProducts.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {orderFilteredProducts.map(p => (
                      <li key={p.id}>
                        <button type="button" onMouseDown={() => { setOrderForm(f => ({ ...f, product_id: p.id, size: '' })); setOrderProductSearch(p.name); setOrderProductDropdown(false) }}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50">
                          <p className="text-sm font-medium text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-400">{p.article_number} · {p.category}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {orderForm.product_id && <p className="text-xs text-green-600 mt-1">✓ Artikel ausgewählt</p>}
              </div>
              {selectedOrderProduct && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Größe *</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={orderForm.size}
                    onChange={e => setOrderForm(f => ({ ...f, size: e.target.value }))}
                  >
                    <option value="">Größe wählen...</option>
                    {selectedOrderProduct.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Menge *</label>
                <input type="number" min="1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0" value={orderForm.quantity}
                  onChange={e => setOrderForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notiz</label>
                <textarea rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Optionale Notiz..."
                  value={orderForm.note}
                  onChange={e => setOrderForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              {orderError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{orderError}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => { setShowOrderForm(false); setOrderProductSearch(''); setOrderError('') }}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={createStockOrder} disabled={saving}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Wird eingereicht...' : 'Einreichen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal is handled in Approvals.tsx */}
    </div>
  )
}
