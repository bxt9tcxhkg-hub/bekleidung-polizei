import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Order, OrderStatus } from '../../lib/types'
import { ORDER_STATUS_LABELS } from '../../lib/types'
import { logAudit } from '../../lib/audit'
import { previousOrderStatus, nextIssueStatus } from '../../lib/workflow'
import {
  buildInventoryMap,
  canShortcutToReadyForIssue,
  inventoryDeltaOnIssue,
  inventoryKey,
  planGoodsIn,
} from '../../lib/inventory'
import { ensureOpenTailorJob } from '../../lib/tailorJobs'
import { buildMassaDraft, sendMassaOrder, type MassaOrderDraft, type MassaSendResult } from '../../lib/massaOrder'
import { generateKurzbrief } from '../../lib/printDocs'
import { ADMIN_TABS, PAGE_SIZE, type AdminTab } from './types'

export function useOrders() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const [orders, setOrders] = useState<Order[]>([])
  const [inventoryMap, setInventoryMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    const t = searchParams.get('tab') as AdminTab | null
    return ADMIN_TABS.some(tab => tab.key === t) ? t! : 'eingereicht'
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [receivedInputs, setReceivedInputs] = useState<Record<string, string>>({})
  const [issuedInputs, setIssuedInputs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')
  const [cancelModal, setCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [massaDraft, setMassaDraft] = useState<MassaOrderDraft | null>(null)
  const [massaResult, setMassaResult] = useState<MassaSendResult | null>(null)

  async function load() {
    setLoading(true)
    const [ordersRes, invRes] = await Promise.all([
      supabase
        .from('orders')
        .select('*, products(id,name,category,article_number,needs_tailoring), quarters(id,name), profiles(id,name,username,dienstnummer)')
        .not('status', 'in', '("pending","pending_approval")')
        .order('created_at', { ascending: false }),
      supabase.from('inventory').select('product_id,size,quantity'),
    ])
    const loaded = (ordersRes.data ?? []) as Order[]
    setOrders(loaded)
    const rec: Record<string, string> = {}
    loaded.forEach(o => { if (o.quantity_received != null) rec[o.id] = String(o.quantity_received) })
    setReceivedInputs(rec)
    setIssuedInputs({})
    setInventoryMap(buildInventoryMap(invRes.data ?? []))
    setLoading(false)
  }

  useEffect(() => { if (profile) load().catch(() => setError('Bestellungen konnten nicht geladen werden.')) }, [profile])

  function switchTab(tab: AdminTab) { setActiveTab(tab); setSelectedIds(new Set()); setPage(0) }

  const tabOrders = orders.filter(o => {
    if (activeTab === 'ausgabe') return o.status === 'ready_for_issue' || o.status === 'partially_issued'
    return ADMIN_TABS.find(t => t.key === activeTab)?.status === o.status
  })
  const sorted = (activeTab === 'ausgabe' || activeTab === 'ausgegeben')
    ? [...tabOrders].sort((a, b) => (a.profiles?.name ?? '').localeCompare(b.profiles?.name ?? ''))
    : tabOrders
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const allSelected = tabOrders.length > 0 && tabOrders.every(o => selectedIds.has(o.id))
  const counts = Object.fromEntries(ADMIN_TABS.map(t => [
    t.key,
    t.key === 'ausgabe'
      ? orders.filter(o => o.status === 'ready_for_issue' || o.status === 'partially_issued').length
      : (t.status ? orders.filter(o => o.status === t.status).length : 0),
  ])) as Record<AdminTab, number>

  // Wenn die aktuelle Seite über die letzte Seite hinauszeigt, auf letzte gültige Seite zurücksetzen
  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(sorted.length / PAGE_SIZE) - 1)
    if (page > lastPage) setPage(lastPage)
  }, [sorted.length, page])

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }
  function toggleSelectAll() { setSelectedIds(allSelected ? new Set() : new Set(tabOrders.map(o => o.id))) }

  async function advanceSelected(nextStatus: OrderStatus) {
    const items = tabOrders.filter(o => selectedIds.has(o.id))
    if (!items.length) return
    setSaving(true)
    setError('')
    const results = await Promise.all(items.map(o => supabase.from('orders').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', o.id)))
    setSaving(false)
    if (results.some(r => r.error)) {
      setError('Statusänderung konnte nicht gespeichert werden. Bitte erneut versuchen.')
      load()
      return
    }
    logAudit('Bestellstatus geändert', `${items.length} Position(en) → ${ORDER_STATUS_LABELS[nextStatus] ?? nextStatus}`)
    setSelectedIds(new Set()); load()
  }

  async function stepBack() {
    const items = sorted.filter(o => selectedIds.has(o.id))
    if (!items.length) return
    setSaving(true)
    setError('')
    const results = await Promise.all(items.map(o => {
      const prevStatus = previousOrderStatus(o.status, !!o.products?.needs_tailoring)
      if (!prevStatus) return Promise.resolve({ error: null })
      const base: { status: OrderStatus; updated_at: string; cancel_reason?: null } = { status: prevStatus, updated_at: new Date().toISOString() }
      if (o.status === 'cancelled') base.cancel_reason = null
      if (o.status === 'ordered_supplier')
        return supabase.from('orders').update({ ...base, quantity_received: null }).eq('id', o.id)
      if (o.status === 'partially_issued' || o.status === 'issued') {
        const restore = o.quantity_issued ?? 0
        if (restore > 0) {
          return supabase.rpc('adjust_inventory', {
            p_product: o.product_id,
            p_size: o.size,
            p_delta: restore,
          }).then(adj => {
            if (adj.error) return adj
            return supabase.from('orders').update({ ...base, quantity_issued: null }).eq('id', o.id)
          })
        }
        return supabase.from('orders').update({ ...base, quantity_issued: null }).eq('id', o.id)
      }
      return supabase.from('orders').update(base).eq('id', o.id)
    }))
    setSaving(false)
    if (results.some(r => r.error)) {
      setError('Rückgängig machen fehlgeschlagen. Bitte erneut versuchen.')
      load()
      return
    }
    setSelectedIds(new Set()); load()
  }

  async function cancelSelected() {
    const items = tabOrders.filter(o => selectedIds.has(o.id))
    if (!items.length || !cancelReason.trim()) return
    setSaving(true)
    setError('')
    const results = await Promise.all(items.map(o => supabase.from('orders').update({
      status: 'cancelled',
      cancel_reason: cancelReason.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', o.id)))
    setSaving(false)
    if (results.some(r => r.error)) {
      setError('Stornierung konnte nicht gespeichert werden. Bitte erneut versuchen.')
      load()
      return
    }
    logAudit('Bestellung storniert', `${items.length} Position(en), Grund: ${cancelReason.trim()}`)
    setSelectedIds(new Set()); setCancelModal(false); setCancelReason(''); load()
  }

  async function saveReceived(order: Order) {
    const qr = receivedInputs[order.id] !== undefined ? parseInt(receivedInputs[order.id]) : null
    if (qr === null || isNaN(qr) || qr < 0) {
      setError('Ungültige Erhalten-Menge. Bitte eine Zahl größer oder gleich 0 eingeben.')
      return
    }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('orders').update({ quantity_received: qr, updated_at: new Date().toISOString() }).eq('id', order.id)
    setSaving(false)
    if (err) {
      setError('Erhalten-Menge konnte nicht gespeichert werden. Bitte erneut versuchen.')
      return
    }
    load()
  }

  async function issueOrder(order: Order) {
    const qtyInput = parseInt(issuedInputs[order.id] ?? '') || 0
    if (qtyInput <= 0) return
    const available = order.quantity_received ?? order.quantity
    const prevIssued = order.quantity_issued ?? 0
    const outstanding = Math.max(0, available - prevIssued)
    if (outstanding <= 0) return
    // Ausgabemenge gegen die noch offene Menge kappen
    const qtyNow = Math.min(qtyInput, outstanding)
    const newTotal = prevIssued + qtyNow
    const newStatus: OrderStatus = nextIssueStatus(newTotal, available)
    setSaving(true)
    setError('')
    const { error: adjErr } = await supabase.rpc('adjust_inventory', {
      p_product: order.product_id,
      p_size: order.size,
      p_delta: inventoryDeltaOnIssue(qtyNow),
    })
    if (adjErr) {
      setSaving(false)
      setError('Bestand konnte nicht abgebucht werden. Ausgabe abgebrochen.')
      return
    }
    const { error: err } = await supabase.from('orders').update({ status: newStatus, quantity_issued: newTotal, updated_at: new Date().toISOString() }).eq('id', order.id)
    setSaving(false)
    if (err) {
      setError('Ausgabe konnte nicht gespeichert werden. Bitte erneut versuchen.')
      return
    }
    logAudit('Bestellung ausgegeben', `${order.products?.name ?? 'Artikel'} an ${order.profiles?.name ?? '?'}${newStatus === 'partially_issued' ? ' (Teilausgabe)' : ''}`)
    load()
  }

  async function createSammelbestellung() {
    const selected = tabOrders.filter(o => selectedIds.has(o.id))
    if (!selected.length) return
    const groups: Record<string, { artNr: string; productName: string; size: string; totalQty: number }> = {}
    selected.forEach(o => {
      const key = `${o.product_id}__${o.size}`
      if (!groups[key]) groups[key] = { artNr: o.products?.article_number ?? '–', productName: o.products?.name ?? '–', size: o.size, totalQty: 0 }
      groups[key].totalQty += o.quantity
    })
    setSaving(true)
    setError('')
    // Create delivery and link orders
    const { data: delivery, error: deliveryErr } = await supabase.from('deliveries').insert({
      created_by: profile!.id,
      status: 'ordered',
    }).select('id').single()
    if (deliveryErr) {
      setSaving(false)
      setError('Sammelbestellung konnte nicht erstellt werden. Bitte erneut versuchen.')
      return
    }
    const deliveryId = delivery?.id ?? null
    const results = await Promise.all(selected.map(o =>
      supabase.from('orders').update({
        status: 'ordered_supplier',
        updated_at: new Date().toISOString(),
        ...(deliveryId ? { delivery_id: deliveryId } : {}),
      }).eq('id', o.id)
    ))
    setSaving(false)
    if (results.some(r => r.error)) {
      setError('Sammelbestellung konnte nicht vollständig gespeichert werden. Bitte erneut versuchen.')
      load()
      return
    }
    logAudit('Sammelbestellung erstellt', `${selected.length} Positionen`)
    // Kurzbrief erst nach erfolgreichen DB-Updates drucken
    generateKurzbrief(Object.values(groups), profile?.name ?? '–')
    setSelectedIds(new Set()); load()
  }

  async function readyFromStock() {
    const items = tabOrders.filter(o => selectedIds.has(o.id))
    const eligible = items.filter(o =>
      canShortcutToReadyForIssue(
        inventoryMap[inventoryKey(o.product_id, o.size)] ?? 0,
        o.quantity,
        !!o.products?.needs_tailoring,
      ),
    )
    if (!eligible.length) {
      setError('Aus Lager nur bei verfügbarem Bestand und ohne Schneiderpflicht. Sonst Sammelbestellung / Schneiderweg.')
      return
    }
    setSaving(true)
    setError('')
    const results = await Promise.all(eligible.map(o =>
      supabase.from('orders').update({ status: 'ready_for_issue', updated_at: new Date().toISOString() }).eq('id', o.id),
    ))
    setSaving(false)
    if (results.some(r => r.error)) {
      setError('Statusänderung konnte nicht gespeichert werden. Bitte erneut versuchen.')
      load()
      return
    }
    const skipped = items.length - eligible.length
    logAudit('Bestellstatus geändert', `${eligible.length} Position(en) → Bereit zur Ausgabe (Lager)`)
    if (skipped > 0) {
      setError(`${eligible.length} aus Lager bereitgestellt. ${skipped} Position(en) ohne ausreichenden Bestand oder mit Schneiderpflicht bleiben eingereicht.`)
    }
    setSelectedIds(new Set())
    load()
  }

  async function confirmSupplierGoodsIn() {
    const items = tabOrders.filter(o => selectedIds.has(o.id))
    if (!items.length) return
    setError('')
    const quantities: Record<string, number> = {}
    for (const o of items) {
      const raw = receivedInputs[o.id]
      if (raw === undefined || raw.trim() === '') {
        quantities[o.id] = o.quantity
        continue
      }
      const qr = parseInt(raw)
      if (isNaN(qr) || qr < 0) {
        setError('Ungültige Erhalten-Menge. Bitte eine Zahl größer oder gleich 0 eingeben.')
        return
      }
      quantities[o.id] = qr
    }
    setSaving(true)
    for (const o of items) {
      const plan = planGoodsIn({
        id: o.id,
        quantity: o.quantity,
        quantityReceived: quantities[o.id],
        needsTailoring: !!o.products?.needs_tailoring,
      })
      if (plan.inventoryDelta !== 0) {
        const adj = await supabase.rpc('adjust_inventory', {
          p_product: o.product_id,
          p_size: o.size,
          p_delta: plan.inventoryDelta,
        })
        if (adj.error) {
          setSaving(false)
          setError('Wareneingang: Bestand konnte nicht gebucht werden.')
          load()
          return
        }
      }
      let tailorJobId: string | null = null
      if (plan.needsTailorJob) {
        const job = await ensureOpenTailorJob(o.quarter_id)
        if (job.error || !job.id) {
          setSaving(false)
          setError('Schneider-Auftrag konnte nicht angelegt werden.')
          load()
          return
        }
        tailorJobId = job.id
      }
      const { error: updErr } = await supabase.from('orders').update({
        status: plan.status,
        quantity_received: plan.quantityReceived,
        updated_at: new Date().toISOString(),
        ...(tailorJobId ? { tailor_job_id: tailorJobId } : {}),
      }).eq('id', o.id)
      if (updErr) {
        setSaving(false)
        setError('Wareneingang konnte nicht vollständig gespeichert werden.')
        load()
        return
      }
    }
    setSaving(false)
    logAudit('Wareneingang Lieferant', `${items.length} Position(en)`)
    setSelectedIds(new Set())
    load()
  }

  function openMassaPreview() {
    const selected = tabOrders.filter(o => selectedIds.has(o.id))
    if (!selected.length) return
    setMassaResult(null)
    setMassaDraft(buildMassaDraft(
      selected.map(o => ({
        articleNumber: o.products?.article_number ?? '',
        name: o.products?.name ?? '–',
        size: o.size,
        quantity: o.quantity,
      })),
      { senderName: profile?.name ?? undefined },
    ))
  }

  function downloadMassaCsv(draft: MassaOrderDraft) {
    const blob = new Blob([draft.csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'massa-sammelbestellung.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function confirmMassaSend(draft: MassaOrderDraft) {
    const mailto = import.meta.env.VITE_MASSA_MAILTO
    const result = sendMassaOrder(draft, mailto)
    setMassaResult(result)
    if (result.mode === 'mailto') window.location.href = result.href
    logAudit('Massa-Sammelmail', result.mode === 'simulated' ? 'Simulation (kein Versand)' : 'mailto-Entwurf')
  }

  return {
    orders,
    inventoryMap,
    loading,
    activeTab,
    selectedIds,
    setSelectedIds,
    receivedInputs,
    setReceivedInputs,
    issuedInputs,
    setIssuedInputs,
    saving,
    page,
    setPage,
    error,
    cancelModal,
    setCancelModal,
    cancelReason,
    setCancelReason,
    massaDraft,
    setMassaDraft,
    massaResult,
    setMassaResult,
    sorted,
    paginated,
    allSelected,
    counts,
    switchTab,
    toggleSelect,
    toggleSelectAll,
    advanceSelected,
    stepBack,
    cancelSelected,
    saveReceived,
    issueOrder,
    createSammelbestellung,
    readyFromStock,
    confirmSupplierGoodsIn,
    openMassaPreview,
    downloadMassaCsv,
    confirmMassaSend,
  }
}
