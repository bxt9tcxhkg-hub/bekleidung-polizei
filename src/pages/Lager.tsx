import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus, Minus, X, ShoppingBag, Tag, Send, Warehouse, ClipboardList, Check, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import type { Order, Product, StockOrder } from '../lib/types'
import { groupSizes, sizeLabel, sortedSizes } from '../lib/sizes'
import { STOCK_ORDER_STATUS_LABELS, STOCK_ORDER_STATUS_COLORS } from '../lib/types'
import { inventoryDeltaOnGoodsIn, routeWaitingOrder } from '../lib/inventory'
import { ensureOpenTailorJob } from '../lib/tailorJobs'

const PAGE_SIZE = 50

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

type WaitingUserOrder = Pick<Order, 'id' | 'quantity' | 'size' | 'product_id' | 'quarter_id'> & {
  profiles?: { name: string } | null
  products?: { name: string; needs_tailoring?: boolean } | null
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
  const [error, setError] = useState('')
  const [invPage, setInvPage] = useState(0)
  const [ordersPage, setOrdersPage] = useState(0)

  // Bestand edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState('')
  const [addForm, setAddForm] = useState<{ product_id: string; size: string; quantity: string } | null>(null)

  // Mindestmenge edit
  const [editingMinId, setEditingMinId] = useState<string | null>(null)
  const [editMinVal, setEditMinVal] = useState('')
  const [savingMin, setSavingMin] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addDropdown, setAddDropdown] = useState(false)
  const [saving, setSaving] = useState(false)

  // Wareneingang follow-up
  const [followUp, setFollowUp] = useState<{ orders: WaitingUserOrder[]; stockOrder: StockOrder } | null>(null)
  const [advancingOrders, setAdvancingOrders] = useState(false)

  // Bestellen
  const [selectedCategory, setSelectedCategory] = useState('Alle')
  const [selectedSubCategory, setSelectedSubCategory] = useState('Alle')
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [sizeModal, setSizeModal] = useState<SizeModal | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function loadAll() {
    setLoading(true)
    const [prodsRes, invRes, ordersRes] = await Promise.all([
      supabase.from('products').select('*').eq('active', true).eq('organisation', profile?.organisation ?? 'Stadtpolizei').order('category').order('name'),
      supabase.from('inventory').select('*, products(*)').order('updated_at', { ascending: false }),
      supabase.from('stock_orders')
        .select('*, products(id,name,article_number,category,needs_tailoring), requester:profiles!stock_orders_requested_by_fkey(id,name), approver:profiles!stock_orders_approved_by_fkey(id,name)')
        .order('created_at', { ascending: false }),
    ])
    setProducts(prodsRes.data ?? [])
    setInventory((invRes.data ?? []) as InventoryItem[])
    setStockOrders((ordersRes.data ?? []) as StockOrder[])
    setLoading(false)
  }

  useEffect(() => { if (profile) loadAll().catch(() => { setError('Lagerdaten konnten nicht geladen werden.'); setLoading(false) }) }, [profile])

  // Pagination auf gültige Seite klemmen, wenn sich die Daten ändern
  useEffect(() => {
    setInvPage(p => Math.min(p, Math.max(0, Math.ceil(inventory.length / PAGE_SIZE) - 1)))
  }, [inventory.length])
  useEffect(() => {
    setOrdersPage(p => Math.min(p, Math.max(0, Math.ceil(stockOrders.length / PAGE_SIZE) - 1)))
  }, [stockOrders.length])

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

  // Products with mandatory minimum stock
  const minStockProducts = products.filter(p => p.min_quantity > 0)

  function stockFor(productId: string, size: string) {
    return invMap[`${productId}__${size}`] ?? 0
  }

  // ── Bestand ───────────────────────────────────────────────────────────────

  async function saveQty(entry: InventoryItem) {
    const qty = parseInt(editQty)
    if (isNaN(qty) || qty < 0) return
    setSaving(true)
    const { error: qtyError } = await supabase.from('inventory').update({ quantity: qty, updated_at: new Date().toISOString() }).eq('id', entry.id)
    setSaving(false)
    if (qtyError) { setError('Bestand konnte nicht gespeichert werden.'); return }
    setEditingId(null)
    loadAll()
  }

  async function saveMinQty(productId: string) {
    const val = parseInt(editMinVal)
    if (isNaN(val) || val < 1) return
    setSavingMin(true)
    const { error: minError } = await supabase.from('products').update({ min_quantity: val }).eq('id', productId)
    setSavingMin(false)
    if (minError) { setError('Mindestmenge konnte nicht gespeichert werden.'); return }
    setEditingMinId(null)
    loadAll()
  }

  async function createInventory() {
    if (!addForm?.product_id || !addForm.size || addForm.quantity === '') return
    const qty = parseInt(addForm.quantity)
    if (isNaN(qty) || qty < 0) return
    setSaving(true)
    const { error: adjError } = await supabase.rpc('adjust_inventory', {
      p_product: addForm.product_id,
      p_size: addForm.size,
      p_delta: qty,
    })
    setSaving(false)
    if (adjError) { setError('Bestand konnte nicht gebucht werden.'); return }
    logAudit('Bestand gebucht', `${selectedAddProduct?.name ?? ''} ${addForm.size} +${qty}`.trim())
    setAddForm(null)
    setAddSearch('')
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

  const categories = ['Alle', ...Array.from(new Set(products.map(p => p.category))).values()].sort((a, b) => a === 'Alle' ? -1 : b === 'Alle' ? 1 : a.localeCompare(b))
  const catFiltered = selectedCategory === 'Alle' ? products : products.filter(p => p.category === selectedCategory)
  const subCategories = selectedCategory === 'Alle' ? [] : ['Alle', ...Array.from(new Set(catFiltered.map(p => p.sub_category).filter(Boolean)))]
  const filteredProducts = selectedSubCategory === 'Alle' || selectedCategory === 'Alle'
    ? catFiltered
    : catFiltered.filter(p => p.sub_category === selectedSubCategory)

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
    const results = await Promise.all(cart.map(item =>
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
    setSubmitting(false)
    if (results.some(r => r.error)) {
      setError('Die Lagerbestellung konnte nicht vollständig eingereicht werden. Bitte erneut versuchen.')
      await loadAll()
      return
    }
    logAudit('Lagerbestellung eingereicht', `${cart.length} Position(en)`)
    setCart([])
    setCartOpen(false)
    setSubmitted(true)
    await loadAll()
    setTab('historie')
  }

  async function markReceived(order: StockOrder) {
    setSaving(true)
    const needsTailoring = !!order.products?.needs_tailoring
    const delta = inventoryDeltaOnGoodsIn(order.quantity, needsTailoring)
    if (delta !== 0) {
      const { error: adjError } = await supabase.rpc('adjust_inventory', {
        p_product: order.product_id,
        p_size: order.size,
        p_delta: delta,
      })
      if (adjError) {
        setSaving(false)
        setError('Wareneingang konnte nicht gebucht werden. Bitte erneut versuchen.')
        return
      }
    }
    const { error: statusError } = await supabase.from('stock_orders').update({
      status: 'received',
      received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', order.id)
    setSaving(false)
    if (statusError) {
      setError('Bestand wurde gebucht, aber der Bestellstatus konnte nicht aktualisiert werden.')
      await loadAll()
      return
    }
    logAudit('Wareneingang gebucht', `${order.products?.name ?? ''} ${order.size} ${needsTailoring ? '(Schneider, nicht frei lagernd)' : `+${order.quantity}`}`.trim())
    await loadAll()
    const { data: waiting } = await supabase
      .from('orders')
      .select('id, quantity, size, product_id, quarter_id, profiles(name), products(name, needs_tailoring)')
      .eq('product_id', order.product_id)
      .eq('size', order.size)
      .eq('status', 'approved')
    if (waiting && waiting.length > 0) {
      setFollowUp({ orders: waiting as WaitingUserOrder[], stockOrder: order })
    }
  }

  async function advanceWaitingOrders() {
    if (!followUp) return
    setAdvancingOrders(true)
    setError('')
    for (const o of followUp.orders) {
      const route = routeWaitingOrder(
        stockFor(o.product_id, o.size),
        o.quantity,
        !!o.products?.needs_tailoring,
      )
      if (route === 'keep_approved') continue
      if (route === 'at_tailor') {
        const job = await ensureOpenTailorJob(o.quarter_id)
        if (job.error || !job.id) {
          setAdvancingOrders(false)
          setError('Schneider-Auftrag konnte nicht angelegt werden.')
          return
        }
        const { error: updErr } = await supabase.from('orders').update({
          status: 'at_tailor',
          tailor_job_id: job.id,
          updated_at: new Date().toISOString(),
        }).eq('id', o.id)
        if (updErr) {
          setAdvancingOrders(false)
          setError('Nicht alle Bestellungen konnten weitergeleitet werden.')
          return
        }
        continue
      }
      const { error: readyErr } = await supabase.from('orders').update({
        status: 'ready_for_issue',
        updated_at: new Date().toISOString(),
      }).eq('id', o.id)
      if (readyErr) {
        setAdvancingOrders(false)
        setError('Nicht alle Bestellungen konnten auf „Bereit zur Ausgabe" gesetzt werden.')
        return
      }
    }
    setAdvancingOrders(false)
    setFollowUp(null)
  }

  // Pagination slices (Größen innerhalb eines Artikels sortiert)
  const invEntries = Object.entries(invByProduct).flatMap(([, entries]) => {
    const order = sortedSizes(entries.map(e => e.size))
    return [...entries].sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size))
  })
  const invTotalPages = Math.ceil(invEntries.length / PAGE_SIZE)
  const pagedInvEntries = invEntries.slice(invPage * PAGE_SIZE, (invPage + 1) * PAGE_SIZE)

  const ordersTotalPages = Math.ceil(stockOrders.length / PAGE_SIZE)
  const pagedStockOrders = stockOrders.slice(ordersPage * PAGE_SIZE, (ordersPage + 1) * PAGE_SIZE)

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0)
  const pendingOrdersCount = stockOrders.filter(o => o.status === 'pending_approval').length
  const approvedOrdersCount = stockOrders.filter(o => o.status === 'approved').length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lagerverwaltung</h1>
        <p className="text-gray-500 text-sm mt-1">Bestand erfassen und Nachbestellungen verwalten</p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <span className="flex-1 text-sm font-medium text-red-700">{error}</span>
          <button onClick={() => setError('')} className="p-1 rounded hover:bg-red-100"><X className="w-4 h-4 text-red-500" /></button>
        </div>
      )}

      {/* Tabs + action button */}
      <div className="flex items-center gap-2 mb-5">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-1 min-w-0">
        {([
          { key: 'bestand', label: 'Bestand', shortLabel: 'Bestand', icon: Warehouse },
          { key: 'bestellen', label: 'Nachbestellen', shortLabel: 'Bestellen', icon: ShoppingBag },
          { key: 'historie', label: 'Bestellhistorie', shortLabel: 'Historie', icon: ClipboardList },
        ] as { key: Tab; label: string; shortLabel: string; icon: React.ElementType }[]).map(({ key, label, shortLabel, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium px-2 py-2 rounded-lg transition-all relative ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{shortLabel}</span>
            {key === 'historie' && (pendingOrdersCount + approvedOrdersCount) > 0 && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {pendingOrdersCount + approvedOrdersCount}
              </span>
            )}
          </button>
        ))}
        </div>
        {tab === 'bestand' && (
          <button onClick={() => setAddForm({ product_id: '', size: '', quantity: '' })}
            className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors flex-shrink-0">
            <Plus className="w-4 h-4 flex-shrink-0" /><span className="hidden sm:inline">Bestand erfassen</span>
          </button>
        )}
        {tab === 'bestellen' && (
          <button onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-xl transition-colors flex-shrink-0">
            <ShoppingBag className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">Warenkorb</span>
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <>
          {/* Erfolgsbanner – sichtbar unabhängig vom aktiven Tab */}
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

          {/* ── Bestand ── */}
          {tab === 'bestand' && (
            <div className="space-y-6">
            {/* Mindestmengen */}
            {minStockProducts.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Mindestmengen</h2>
                <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Artikel</th>
                        <th className="text-center px-4 py-3 font-semibold text-gray-600">Mindestmenge</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {minStockProducts.map(p => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{p.name}</p>
                            <p className="text-xs text-gray-400">{p.article_number} · {p.category}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {editingMinId === p.id ? (
                              <div className="flex items-center justify-center gap-2">
                                <input type="number" min="1"
                                  className="w-16 text-center border border-blue-400 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  value={editMinVal}
                                  onChange={e => setEditMinVal(e.target.value)}
                                  autoFocus
                                  onKeyDown={e => { if (e.key === 'Enter') saveMinQty(p.id); if (e.key === 'Escape') setEditingMinId(null) }}
                                />
                                <button onClick={() => saveMinQty(p.id)} disabled={savingMin}
                                  className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-60">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setEditingMinId(null)}
                                  className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => { setEditingMinId(p.id); setEditMinVal(String(p.min_quantity)) }}
                                className="inline-flex items-center gap-2 hover:bg-gray-100 px-3 py-1 rounded-lg transition-colors group">
                                <span className="text-sm font-semibold text-gray-700">{p.min_quantity}×</span>
                                <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">bearbeiten</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Lagerbestand */}
            {Object.keys(invByProduct).length === 0 ? (
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
                    {pagedInvEntries.map(entry => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{entry.products?.name ?? '–'}</p>
                          <p className="text-xs text-gray-400">{entry.products?.article_number} · {entry.products?.category}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{sizeLabel(entry.size, groupSizes(entry.products?.sizes ?? [entry.size]) !== null)}</td>
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
                              {(() => {
                                const min = entry.products?.min_quantity ?? 0
                                const qty = entry.quantity
                                const color = qty === 0 ? 'text-gray-400' : min > 0 && qty < min ? 'text-red-600' : min > 0 && qty <= min * 1.5 ? 'text-amber-600' : 'text-green-700'
                                return <span className={`text-sm font-semibold ${color}`}>{qty}×</span>
                              })()}
                              {(() => {
                                const min = entry.products?.min_quantity ?? 0
                                return min > 0 && entry.quantity < min
                                  ? <span className="text-xs text-red-400">min. {min}</span>
                                  : <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">bearbeiten</span>
                              })()}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-400 hidden md:table-cell">
                          {entry.updated_at ? new Date(entry.updated_at).toLocaleDateString('de-AT') : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {invTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                    <span>{invPage * PAGE_SIZE + 1}–{Math.min((invPage + 1) * PAGE_SIZE, invEntries.length)} von {invEntries.length}</span>
                    <div className="flex gap-2">
                      <button onClick={() => setInvPage(p => p - 1)} disabled={invPage === 0}
                        className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                        Zurück
                      </button>
                      <button onClick={() => setInvPage(p => p + 1)} disabled={invPage >= invTotalPages - 1}
                        className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                        Weiter
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          )}

          {/* ── Bestellen ── */}
          {tab === 'bestellen' && (
            <div>
              {/* Category filter */}
              <div className="flex gap-2 flex-wrap overflow-x-auto pb-1">
                {categories.map(cat => (
                  <button key={cat} onClick={() => { setSelectedCategory(cat); setSelectedSubCategory('Alle') }}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${selectedCategory === cat ? 'bg-blue-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                    {cat}
                  </button>
                ))}
              </div>
              {subCategories.length > 1 && (
                <div className="flex gap-2 flex-wrap mt-2 mb-5">
                  {subCategories.map(sub => (
                    <button key={sub} onClick={() => setSelectedSubCategory(sub as string)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${selectedSubCategory === sub ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-gray-50 border border-gray-200 text-gray-500 hover:border-blue-200'}`}>
                      {sub}
                    </button>
                  ))}
                </div>
              )}
              {subCategories.length <= 1 && <div className="mb-5" />}

              {/* Product grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProducts.map(product => {
                  const isGrouped = groupSizes(product.sizes) !== null
                  const sizesWithStock = sortedSizes(product.sizes).map(s => ({
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
                              {sizeLabel(size, isGrouped)}
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
                    {pagedStockOrders.map(o => (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{o.products?.name ?? '–'}</p>
                          <p className="text-xs text-gray-400">{o.products?.article_number}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{sizeLabel(o.size, groupSizes(products.find(p => p.id === o.product_id)?.sizes ?? [o.size]) !== null)} · {o.quantity}×</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STOCK_ORDER_STATUS_COLORS[o.status]}`}>
                            {STOCK_ORDER_STATUS_LABELS[o.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{o.requester?.name ?? '–'}</td>
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
                {ordersTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                    <span>{ordersPage * PAGE_SIZE + 1}–{Math.min((ordersPage + 1) * PAGE_SIZE, stockOrders.length)} von {stockOrders.length}</span>
                    <div className="flex gap-2">
                      <button onClick={() => setOrdersPage(p => p - 1)} disabled={ordersPage === 0}
                        className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                        Zurück
                      </button>
                      <button onClick={() => setOrdersPage(p => p + 1)} disabled={ordersPage >= ordersTotalPages - 1}
                        className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                        Weiter
                      </button>
                    </div>
                  </div>
                )}
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
                {(() => {
                  const sizes = sortedSizes(sizeModal.product.sizes)
                  const groups = groupSizes(sizes)
                  const isGrouped = groups !== null
                  const SizeBtn = ({ s }: { s: string }) => {
                    const stock = stockFor(sizeModal.product.id, s)
                    return (
                      <button key={s} onClick={() => setSizeModal(m => m ? { ...m, size: s } : m)}
                        className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors flex flex-col items-center min-w-[3.5rem] ${sizeModal.size === s ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                        <span>{sizeLabel(s, isGrouped)}</span>
                        <span className={`text-xs mt-0.5 ${sizeModal.size === s ? 'text-blue-200' : stock > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {stock > 0 ? `${stock} lagernd` : 'nicht lagernd'}
                        </span>
                      </button>
                    )
                  }
                  return groups ? (
                    <div className="space-y-3">
                      {groups.map(g => (
                        <div key={g.label}>
                          <p className="text-xs text-gray-400 mb-1.5">{g.label}:</p>
                          <div className="flex flex-wrap gap-2">{g.sizes.map(s => <SizeBtn key={s} s={s} />)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">{sizes.map(s => <SizeBtn key={s} s={s} />)}</div>
                  )
                })()}
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
                  <p className="text-xs text-gray-500">{followUp.stockOrder.products?.name} · Gr. {followUp.stockOrder.size} · {followUp.stockOrder.quantity}×</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-700 mb-3">
                <span className="font-semibold">{followUp.orders.length} Benutzerbestellung{followUp.orders.length !== 1 ? 'en' : ''}</span> warten auf diesen Artikel.
                Schneider-pflichtige Positionen gehen zum Schneider (nicht ins freie Lager). Andere nur bei verfügbarem Bestand auf „Bereit zur Ausgabe“.
              </p>
              <div className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
                {followUp.orders.map(o => (
                  <div key={o.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <span className="font-medium text-gray-800">{o.profiles?.name ?? '–'}</span>
                    <span className="text-gray-500">Gr. {o.size} · {o.quantity}×{o.products?.needs_tailoring ? ' · Schneider' : ''}</span>
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
                {advancingOrders ? 'Wird gesetzt...' : 'Weiterleiten'}
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
                    {(() => {
                      const isGrouped = groupSizes(selectedAddProduct.sizes) !== null
                      return sortedSizes(selectedAddProduct.sizes).map(s => {
                        const stock = stockFor(selectedAddProduct.id, s)
                        return <option key={s} value={s}>{sizeLabel(s, isGrouped)}{stock > 0 ? ` (aktuell ${stock}×)` : ''}</option>
                      })
                    })()}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Menge hinzubuchen *</label>
                <input type="number" min="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0" value={addForm.quantity}
                  onChange={e => setAddForm(f => f ? { ...f, quantity: e.target.value } : f)} />
                <p className="text-xs text-gray-400 mt-1">Die Menge wird zum bestehenden Bestand hinzugebucht.</p>
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
