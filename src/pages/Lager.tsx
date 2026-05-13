import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus, Minus, X, ShoppingBag, Tag, Send, Warehouse, ClipboardList, Check, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Product, StockOrder } from '../lib/types'
import { STOCK_ORDER_STATUS_LABELS, STOCK_ORDER_STATUS_COLORS } from '../lib/types'

type Tab = 'bestand' | 'bestellen' | 'historie'

interface InventoryItem {
  id: string
  product_id: string
  size: string
  quantity: number
  updated_at: string | null
  products?: Product
}

interface CartItem {
  product: Product
  size: string
  quantity: number
}

interface SizeModal {
  product: Product
  size: string
  quantity: number
}

export default function Lager() {
  const { profile } = useAuth()
  const location = useLocation()
  const navState = (location.state as { productId?: string; size?: string; qty?: number } | null)
  const [tab, setTab] = useState<Tab>('bestand')

  const [products, setProducts] = useState<Product[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [stockOrders, setStockOrders] = useState<StockOrder[]>([])
  const [loading, setLoading] = useState(true)

  // Bestand edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState('')
  const [addForm, setAddForm] = useState<{ product_id: string; size: string; quantity: string } | null>(null)
  const [addSearch, setAddSearch] = useState('')
  const [addDropdown, setAddDropdown] = useState(false)
  const [saving, setSaving] = useState(false)

  // Wareneingang follow-up
  const [followUp, setFollowUp] = useState<{ orders: any[]; stockOrder: StockOrder } | null>(null)
  const [advancingOrders, setAdvancingOrders] = useState(false)

  // Bestellen
  const [selectedCategory, setSelectedCategory] = useState('Alle')
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [sizeModal, setSizeModal] = useState<SizeModal | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function loadAll() {
    setLoading(true)
    const [prodsRes, invRes, ordersRes] = await Promise.all([
      supabase.from('products').select('*').eq('active', true).order('category').order('name'),
      supabase.from('inventory').select('*, products(*)').order('updated_at', { ascending: false }),
      supabase.from('stock_orders')
        .select('*, products(id,name,article_number,category), requester:profiles!stock_orders_requested_by_fkey(id,name), approver:profiles!stock_orders_approved_by_fkey(id,name)')
        .order('created_at', { ascending: false }),
    ])
    setProducts(prodsRes.data ?? [])
    setInventory((invRes.data ?? []) as InventoryItem[])
    setStockOrders((ordersRes.data ?? []) as StockOrder[])
    setLoading(false)
  }

  useEffect(() => { if (profile) loadAll() }, [profile])

  // Pre-select product+size when navigating from Analyse page
  useEffect(() => {
    if (loading || !navState?.productId) return
    const product = products.find(p => p.id === navState.productId)
    if (!product) return
    const size = navState.size && product.sizes.includes(navState.size) ? navState.size : product.sizes[0] ?? ''
    setTab('bestellen')
    setSizeModal({ product, size, quantity: navState.qty ?? 1 })
    // Clear the navigation state so it doesn't re-trigger on re-renders
    window.history.replaceState({}, '')
  }, [loading])

  // Build inventory map: product_id__size → quantity
  const invMap: Record<string, number> = {}
  inventory.forEach(e => { invMap[`${e.product_id}__${e.size}`] = e.quantity })

  function stockFor(productId: string, size: string) {
    return invMap[`${productId}__${size}`] ?? 0
  }

  // ── Bestand ───────────────────────────────────────────────────────────────

  async function saveQty(entry: InventoryItem) {
    const qty = parseInt(editQty)
    if (isNaN(qty) || qty < 0) return
    setSaving(true)
    await supabase.from('inventory').update({ quantity: qty, updated_at: new Date().toISOString() }).eq('id', entry.id)
    setEditingId(null)
    setSaving(false)
    loadAll()
  }

  async function createInventory() {
    if (!addForm?.product_id || !addForm.size || addForm.quantity === '') return
    const qty = parseInt(addForm.quantity)
    if (isNaN(qty) || qty < 0) return
    setSaving(true)
    await supabase.from('inventory').upsert(
      { product_id: addForm.product_id, size: addForm.size, quantity: qty, updated_at: new Date().toISOString() },
      { onConflict: 'product_id,size' }
    )
    setAddForm(null)
    setAddSearch('')
    setSaving(false)
    loadAll()
  }

  const addFilteredProducts = addSearch.trim()
    ? products.filter(p => p.name.toLowerCase().includes(addSearch.toLowerCase()) || p.article_number.toLowerCase().includes(addSearch.toLowerCase()))
    : products
  const selectedAddProduct = addForm?.product_id ? products.find(p => p.id === addForm.product_id) : null

  const invByProduct = inventory.reduce<Record<string, InventoryItem[]>>((acc, e) => {
    if (!acc[e.product_id]) acc[e.product_id] = []
    acc[e.product_id].push(e)
    return acc
  }, {})

  // ── Bestellen ─────────────────────────────────────────────────────────────

  const categories = ['Alle', ...Array.from(new Set(products.map(p => p.category)))]
  const filteredProducts = selectedCategory === 'Alle' ? products : products.filter(p => p.category === selectedCategory)

  function openSizeModal(product: Product) {
    setSizeModal({ product, size: product.sizes[0] ?? '', quantity: 1 })
  }

  function addToCart() {
    if (!sizeModal) return
    setCart(prev => {
      const existing = prev.findIndex(c => c.product.id === sizeModal.product.id && c.size === sizeModal.size)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + sizeModal.quantity }
        return updated
      }
      return [...prev, { product: sizeModal.product, size: sizeModal.size, quantity: sizeModal.quantity }]
    })
    setSizeModal(null)
    setCartOpen(true)
  }

  function removeFromCart(idx: number) {
    setCart(prev => prev.filter((_, i) => i !== idx))
  }

  function updateCartQty(idx: number, delta: number) {
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c))
  }

  async function submitCart() {
    if (cart.length === 0) return
    setSubmitting(true)
    await Promise.all(cart.map(item =>
      supabase.from('stock_orders').insert({
        product_id: item.product.id,
        size: item.size,
        quantity: item.quantity,
        note: null,
        requested_by: profile!.id,
        status: 'pending_approval' as const,
        approved_by: null,
        approved_at: null,
        received_at: null,
      })
    ))
    setCart([])
    setCartOpen(false)
    setSubmitting(false)
    setSubmitted(true)
    await loadAll()
    setTab('historie')
  }

  async function markReceived(order: StockOrder) {
    setSaving(true)
    await supabase.from('stock_orders').update({
      status: 'received',
      received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', order.id)
    const existing = invMap[`${order.product_id}__${order.size}`] ?? 0
    await supabase.from('inventory').upsert(
      { product_id: order.product_id, size: order.size, quantity: existing + order.quantity, updated_at: new Date().toISOString() },
      { onConflict: 'product_id,size' }
    )
    setSaving(false)
    await loadAll()
    // Check for pending user orders for same product + size
    const { data: waiting } = await supabase
      .from('orders')
      .select('id, quantity, size, profiles(name), products(name)')
      .eq('product_id', order.product_id)
      .eq('size', order.size)
      .eq('status', 'approved')
    if (waiting && waiting.length > 0) {
      setFollowUp({ orders: waiting, stockOrder: order })
    }
  }

  async function advanceWaitingOrders() {
    if (!followUp) return
    setAdvancingOrders(true)
    await Promise.all(followUp.orders.map(o =>
      supabase.from('orders').update({ status: 'ready_for_issue', updated_at: new Date().toISOString() }).eq('id', o.id)
    ))
    setAdvancingOrders(false)
    setFollowUp(null)
  }

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0)
  const pendingOrdersCount = stockOrders.filter(o => o.status === 'pending_approval').length
  const approvedOrdersCount = stockOrders.filter(o => o.status === 'approved').length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lagerverwaltung</h1>
          <p className="text-gray-500 text-sm mt-1">Bestand erfassen und Nachbestellungen verwalten</p>
        </div>
        {tab === 'bestand' && (
          <button onClick={() => setAddForm({ product_id: '', size: '', quantity: '' })}
            className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Bestand erfassen
          </button>
        )}
        {tab === 'bestellen' && (
          <button onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
            <ShoppingBag className="w-4 h-4" />
            Warenkorb
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        {([
          { key: 'bestand', label: 'Bestand', icon: Warehouse },
          { key: 'bestellen', label: 'Nachbestellen', icon: ShoppingBag },
          { key: 'historie', label: 'Bestellhistorie', icon: ClipboardList },
        ] as { key: Tab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all relative ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon className="w-4 h-4" />
            {label}
            {key === 'historie' && (pendingOrdersCount + approvedOrdersCount) > 0 && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {pendingOrdersCount + approvedOrdersCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <>
          {/* ── Bestand ── */}
          {tab === 'bestand' && (
            Object.keys(invByProduct).length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-center">
                <Warehouse className="w-12 h-12 mb-3 text-gray-300" />
                <p className="font-semibold text-gray-500">Kein Bestand erfasst</p>
                <p className="text-sm text-gray-400 mt-1">Klicke „Bestand erfassen" um Artikel einzubuchen</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Artikel</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Größe</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-600">Bestand</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Zuletzt aktualisiert</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Object.entries(invByProduct).flatMap(([, entries]) =>
                      entries.map(entry => (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{entry.products?.name ?? '–'}</p>
                            <p className="text-xs text-gray-400">{entry.products?.article_number} · {entry.products?.category}</p>
                          </td>
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
                                  className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-60">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setEditingId(null)}
                                  className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => { setEditingId(entry.id); setEditQty(String(entry.quantity)) }}
                                className="inline-flex items-center gap-2 hover:bg-gray-100 px-3 py-1 rounded-lg transition-colors group">
                                <span className={`text-sm font-semibold ${entry.quantity === 0 ? 'text-gray-400' : entry.quantity < 3 ? 'text-amber-600' : 'text-green-700'}`}>
                                  {entry.quantity}×
                                </span>
                                <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">bearbeiten</span>
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-400 hidden md:table-cell">
                            {entry.updated_at ? new Date(entry.updated_at).toLocaleDateString('de-AT') : '–'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── Bestellen ── */}
          {tab === 'bestellen' && (
            <div>
              {submitted && (
                <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-green-800">Lagerbestellung eingereicht</p>
                    <p className="text-xs text-green-700 mt-0.5">Die Bestellung wartet auf Freigabe durch den Genehmiger.</p>
                  </div>
                  <button onClick={() => setSubmitted(false)} className="p-1 rounded hover:bg-green-100"><X className="w-4 h-4 text-green-600" /></button>
                </div>
              )}

              {/* Category filter */}
              <div className="flex gap-2 flex-wrap mb-5 overflow-x-auto pb-1">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${selectedCategory === cat ? 'bg-blue-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                    {cat}
                  </button>
                ))}
              </div>

              {/* Product grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProducts.map(product => {
                  const sizesWithStock = product.sizes.map(s => ({
                    size: s,
                    stock: stockFor(product.id, s),
                  }))
                  const totalStock = sizesWithStock.reduce((s, e) => s + e.stock, 0)
                  return (
                    <div key={product.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
                      {/* Card header */}
                      <div className="h-28 bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center relative">
                        <ShoppingBag className="w-10 h-10 text-blue-300 opacity-50" />
                        {totalStock > 0 ? (
                          <span className="absolute top-2.5 right-2.5 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                            {totalStock}× lagernd
                          </span>
                        ) : (
                          <span className="absolute top-2.5 right-2.5 bg-black/30 text-white/80 text-xs font-medium px-2 py-0.5 rounded-full">
                            Nicht lagernd
                          </span>
                        )}
                      </div>

                      <div className="p-4 flex flex-col flex-1">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 text-sm leading-snug">{product.name}</h3>
                        </div>
                        <span className="text-xs text-gray-400 flex items-center gap-1 mb-3">
                          <Tag className="w-3 h-3" />{product.category}
                        </span>

                        {/* Sizes with stock badges */}
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {sizesWithStock.map(({ size, stock }) => (
                            <span key={size} className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium ${
                              stock > 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {size}
                              {stock > 0 && <span className="text-green-600 font-bold">·{stock}</span>}
                            </span>
                          ))}
                        </div>

                        <button
                          onClick={() => openSizeModal(product)}
                          className="mt-auto w-full flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium py-2 rounded-xl transition-colors">
                          <Plus className="w-4 h-4" /> Bestellen
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Bestellhistorie ── */}
          {tab === 'historie' && (
            stockOrders.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-center">
                <ClipboardList className="w-12 h-12 mb-3 text-gray-300" />
                <p className="font-semibold text-gray-500">Keine Lagerbestellungen vorhanden</p>
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
                              className="text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60 whitespace-nowrap">
                              Wareneingang
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}

      {/* ── Size modal ── */}
      {sizeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="font-bold text-gray-900">{sizeModal.product.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{sizeModal.product.category} · Art.-Nr. {sizeModal.product.article_number}</p>
              </div>
              <button onClick={() => setSizeModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Size selector with stock */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Größe wählen</p>
                <div className="flex flex-wrap gap-2">
                  {sizeModal.product.sizes.map(s => {
                    const stock = stockFor(sizeModal.product.id, s)
                    return (
                      <button key={s} onClick={() => setSizeModal(m => m ? { ...m, size: s } : m)}
                        className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors flex flex-col items-center min-w-[3.5rem] ${sizeModal.size === s ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                        <span>{s}</span>
                        <span className={`text-xs mt-0.5 ${sizeModal.size === s ? 'text-blue-200' : stock > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {stock > 0 ? `${stock} lagernd` : 'nicht lagernd'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Current stock info */}
              {sizeModal.size && (() => {
                const stock = stockFor(sizeModal.product.id, sizeModal.size)
                return (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${stock > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                    <Warehouse className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Aktuell lagernd: <strong>{stock}×</strong>
                      {stock > 0 && <span className="text-xs ml-1 opacity-70">(Gr. {sizeModal.size})</span>}
                    </span>
                  </div>
                )
              })()}

              {/* Quantity */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Menge bestellen</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setSizeModal(m => m ? { ...m, quantity: Math.max(1, m.quantity - 1) } : m)}
                    className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-xl font-bold w-10 text-center">{sizeModal.quantity}</span>
                  <button onClick={() => setSizeModal(m => m ? { ...m, quantity: m.quantity + 1 } : m)}
                    className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t flex gap-3">
              <button onClick={() => setSizeModal(null)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-xl text-sm hover:bg-gray-50">
                Abbrechen
              </button>
              <button onClick={addToCart} disabled={!sizeModal.size}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-xl text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                <ShoppingBag className="w-4 h-4" /> In Warenkorb
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cart drawer ── */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="relative w-full max-w-sm bg-white shadow-2xl flex flex-col h-full">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-blue-800" />
                <h2 className="font-bold text-gray-900">Lager-Warenkorb</h2>
                {cartCount > 0 && <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full">{cartCount}</span>}
              </div>
              <button onClick={() => setCartOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 px-6 text-center">
                  <ShoppingBag className="w-12 h-12 mb-3 opacity-30" />
                  <p className="font-medium">Warenkorb ist leer</p>
                  <p className="text-sm mt-1">Wähle Artikel aus dem Katalog</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {cart.map((item, idx) => {
                    const stock = stockFor(item.product.id, item.size)
                    return (
                      <div key={idx} className="flex items-start gap-3 px-5 py-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 leading-snug">{item.product.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Gr. {item.size}</p>
                          <p className={`text-xs mt-1 font-medium ${stock > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                            Aktuell lagernd: {stock}×
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <button onClick={() => updateCartQty(idx, -1)} disabled={item.quantity <= 1}
                            className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-60">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-sm font-semibold w-6 text-center">{item.quantity}</span>
                          <button onClick={() => updateCartQty(idx, 1)} className="p-1 rounded-md hover:bg-gray-100">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => removeFromCart(idx)}
                            className="p-1 ml-1 rounded-md hover:bg-red-50 text-red-400 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t px-5 py-4 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Positionen</span>
                  <span className="font-bold text-gray-900">{cart.length} Artikel · {cartCount}×</span>
                </div>
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <Warehouse className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">Lagerbestellungen werden zur Genehmigung weitergeleitet und erscheinen danach in der Bestellhistorie.</p>
                </div>
                <button onClick={submitCart} disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60">
                  <Send className="w-4 h-4" />
                  {submitting ? 'Wird eingereicht...' : 'Zur Genehmigung einreichen'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Wareneingang Follow-up Dialog ── */}
      {followUp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Check className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Wareneingang gebucht</h2>
                  <p className="text-xs text-gray-500">{(followUp.stockOrder as any).products?.name} · Gr. {followUp.stockOrder.size} · {followUp.stockOrder.quantity}×</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-700 mb-3">
                <span className="font-semibold">{followUp.orders.length} Benutzerbestellung{followUp.orders.length !== 1 ? 'en' : ''}</span> warten auf diesen Artikel.
                Direkt auf „Bereit zur Ausgabe" setzen?
              </p>
              <div className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
                {followUp.orders.map(o => (
                  <div key={o.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <span className="font-medium text-gray-800">{(o as any).profiles?.name ?? '–'}</span>
                    <span className="text-gray-500">Gr. {o.size} · {o.quantity}×</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setFollowUp(null)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">
                Später manuell
              </button>
              <button onClick={advanceWaitingOrders} disabled={advancingOrders}
                className="flex-1 bg-green-700 hover:bg-green-800 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {advancingOrders ? 'Wird gesetzt...' : 'Ja, bereit zur Ausgabe'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bestand erfassen Modal ── */}
      {addForm !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Bestand erfassen</h2>
              <button onClick={() => { setAddForm(null); setAddSearch('') }} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">Artikel *</label>
                <input type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Artikelname oder -nummer..."
                  value={addSearch}
                  onChange={e => { setAddSearch(e.target.value); setAddDropdown(true); if (!e.target.value) setAddForm(f => f ? { ...f, product_id: '', size: '' } : f) }}
                  onFocus={() => setAddDropdown(true)}
                  onBlur={() => setTimeout(() => setAddDropdown(false), 150)}
                />
                {addDropdown && addFilteredProducts.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {addFilteredProducts.map(p => (
                      <li key={p.id}>
                        <button type="button" onMouseDown={() => { setAddForm(f => f ? { ...f, product_id: p.id, size: '' } : f); setAddSearch(p.name); setAddDropdown(false) }}
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
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={addForm.size} onChange={e => setAddForm(f => f ? { ...f, size: e.target.value } : f)}>
                    <option value="">Größe wählen...</option>
                    {selectedAddProduct.sizes.map(s => {
                      const stock = stockFor(selectedAddProduct.id, s)
                      return <option key={s} value={s}>{s}{stock > 0 ? ` (aktuell ${stock}×)` : ''}</option>
                    })}
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
              <button onClick={() => { setAddForm(null); setAddSearch('') }}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={createInventory} disabled={saving || !addForm.product_id || !addForm.size || addForm.quantity === ''}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
