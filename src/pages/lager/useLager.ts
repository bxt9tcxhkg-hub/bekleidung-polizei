import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import type { Product, StockOrder } from '../../lib/types'
import { sortedSizes } from '../../lib/sizes'
import {
  buildInventoryMap,
  inventoryKey,
  inventoryLineLabel,
  isInventoryDeleteBlocked,
  planInventoryDeleteResult,
  routeWaitingOrder,
} from '../../lib/inventory'
import { ensureOpenTailorJob } from '../../lib/tailorJobs'
import type { CartItem, InventoryItem, SizeModal, Tab, WaitingUserOrder } from './types'

const PAGE_SIZE = 50

export function useLager() {
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
  const [confirmDelete, setConfirmDelete] = useState<InventoryItem | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  const invMap = buildInventoryMap(inventory)

  // Products with mandatory minimum stock
  const minStockProducts = products.filter(p => p.min_quantity > 0)

  function stockFor(productId: string, size: string) {
    return invMap[inventoryKey(productId, size)] ?? 0
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

  async function confirmAndDelete() {
    if (!confirmDelete) return
    const entry = confirmDelete
    const label = inventoryLineLabel(entry.products?.name, entry.size, entry.products?.sizes)
    setError('')
    setDeleting(true)
    const { error: delError } = await supabase.from('inventory').delete().eq('id', entry.id)
    if (delError && isInventoryDeleteBlocked(delError)) {
      const { error: zeroError } = await supabase
        .from('inventory')
        .update({ quantity: 0, updated_at: new Date().toISOString() })
        .eq('id', entry.id)
      const result = planInventoryDeleteResult(delError, label, zeroError)
      if (result.auditAction) logAudit(result.auditAction, label)
      if (result.error) setError(result.error)
    } else {
      const result = planInventoryDeleteResult(delError, label)
      if (result.auditAction) logAudit(result.auditAction, label)
      if (result.error) setError(result.error)
    }
    setDeleting(false)
    setConfirmDelete(null)
    setEditingId(id => (id === entry.id ? null : id))
    await loadAll()
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
    const { error: statusError } = await supabase.rpc('receive_stock_order', { p_order_id: order.id })
    setSaving(false)
    if (statusError) {
      setError('Wareneingang konnte nicht gespeichert werden. Bestand und Status wurden nicht geändert.')
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

  return {
    tab, setTab, products, loading, error, setError,
    invPage, setInvPage, ordersPage, setOrdersPage,
    editingId, setEditingId, editQty, setEditQty, addForm, setAddForm,
    editingMinId, setEditingMinId, editMinVal, setEditMinVal, savingMin,
    addSearch, setAddSearch, addDropdown, setAddDropdown, saving,
    followUp, setFollowUp, advancingOrders,
    selectedCategory, setSelectedCategory, selectedSubCategory, setSelectedSubCategory,
    cart, cartOpen, setCartOpen, sizeModal, setSizeModal, submitting, submitted, setSubmitted,
    confirmDelete, setConfirmDelete, deleting, confirmAndDelete,
    stockFor, minStockProducts, saveQty, saveMinQty, createInventory,
    addFilteredProducts, selectedAddProduct, invByProduct,
    categories, subCategories, filteredProducts, openSizeModal,
    addToCart, removeFromCart, updateCartQty, submitCart, markReceived, advanceWaitingOrders,
    invEntries, invTotalPages, pagedInvEntries, ordersTotalPages, pagedStockOrders,
    cartCount, pendingOrdersCount, approvedOrdersCount, stockOrders, pageSize: PAGE_SIZE,
  }
}

export type LagerController = ReturnType<typeof useLager>
