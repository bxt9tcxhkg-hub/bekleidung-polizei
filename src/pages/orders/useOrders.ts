import { useEffect, useMemo, useState } from 'react'
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
  inventoryKey,
} from '../../lib/inventory'
import { buildMassaDraft, sendMassaOrder, type MassaOrderDraft, type MassaSendResult } from '../../lib/massaOrder'
import { EIGENBESCHAFFUNG_ADDRESSEE, generateKurzbrief, officerPrintName } from '../../lib/printDocs'
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
        .select('*, products(id,name,category,article_number,needs_tailoring,bezugsart,size_mode), quarters(id,name), profiles(id,name,username,dienstnummer)')
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

  const tabOrders = useMemo(() => orders.filter(o => {
    if (activeTab === 'ausgabe') return o.status === 'ready_for_issue' || o.status === 'partially_issued'
    return ADMIN_TABS.find(t => t.key === activeTab)?.status === o.status
  }), [orders, activeTab])
  const sorted = useMemo(() => (activeTab === 'ausgabe' || activeTab === 'ausgegeben')
    ? [...tabOrders].sort((a, b) => (a.profiles?.name ?? '').localeCompare(b.profiles?.name ?? ''))
    : tabOrders, [tabOrders, activeTab])
  const paginated = useMemo(() => sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [sorted, page])
  const allSelected = tabOrders.length > 0 && tabOrders.every(o => selectedIds.has(o.id))
  const counts = useMemo(() => Object.fromEntries(ADMIN_TABS.map(t => [
    t.key,
    t.key === 'ausgabe'
      ? orders.filter(o => o.status === 'ready_for_issue' || o.status === 'partially_issued').length
      : (t.status ? orders.filter(o => o.status === t.status).length : 0),
  ])) as Record<AdminTab, number>, [orders])

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
    const results = await Promise.all(items.map(o => supabase.from('orders').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', o.id).select('id')))
    setSaving(false)
    if (results.some(r => r.error || !r.data?.length)) {
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
    const results = await Promise.all(items.filter(o => previousOrderStatus(o.status, !!o.products?.needs_tailoring)).map(o =>
      supabase.rpc('book_order_inventory', { p_order_id: o.id, p_expected_updated_at: o.updated_at, p_action: 'step_back' }),
    ))
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
    }).eq('id', o.id).select('id')))
    setSaving(false)
    if (results.some(r => r.error || !r.data?.length)) {
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
    const { error: err, data } = await supabase.from('orders').update({ quantity_received: qr, updated_at: new Date().toISOString() }).eq('id', order.id).select('id')
    setSaving(false)
    if (err || !data?.length) {
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
    const { error: err } = await supabase.rpc('book_order_inventory', {
      p_order_id: order.id, p_expected_updated_at: order.updated_at, p_action: 'issue', p_quantity: qtyNow,
    })
    setSaving(false)
    if (err) {
      setError('Ausgabe konnte nicht gespeichert werden. Bitte erneut versuchen.')
      return
    }
    logAudit('Bestellung ausgegeben', `${order.products?.name ?? 'Artikel'} an ${order.profiles?.name ?? '?'}${newStatus === 'partially_issued' ? ' (Teilausgabe)' : ''}`)
    load()
  }

  // Getrennt nach Bezugsart: Massa-Artikel und eigenbeschaffte Artikel gehen
  // in zwei eigene Lieferungen mit je eigenem Kurzbrief, statt alles pauschal
  // an die Massa zu adressieren.
  async function createSammelbestellung() {
    const selected = tabOrders.filter(o => selectedIds.has(o.id))
    if (!selected.length) return
    const massaOrders = selected.filter(o => o.products?.bezugsart !== 'eigenbeschaffung')
    const eigenOrders = selected.filter(o => o.products?.bezugsart === 'eigenbeschaffung')
    setSaving(true)
    setError('')
    for (const group of [massaOrders, eigenOrders]) {
      if (!group.length) continue
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
      const results = await Promise.all(group.map(o =>
        supabase.from('orders').update({
          status: 'ordered_supplier',
          updated_at: new Date().toISOString(),
          ...(deliveryId ? { delivery_id: deliveryId } : {}),
        }).eq('id', o.id).select('id')
      ))
      if (results.some(r => r.error || !r.data?.length)) {
        setSaving(false)
        setError('Sammelbestellung konnte nicht vollständig gespeichert werden. Bitte erneut versuchen.')
        load()
        return
      }
      const isEigenbeschaffung = group === eigenOrders
      const groups: Record<string, { artNr: string; productName: string; size: string; totalQty: number }> = {}
      group.forEach(o => {
        const key = `${o.product_id}__${o.size}`
        const size = o.products?.size_mode === 'sizes' ? o.size : ''
        if (!groups[key]) groups[key] = { artNr: o.products?.article_number ?? '–', productName: o.products?.name ?? '–', size, totalQty: 0 }
        groups[key].totalQty += o.quantity
      })
      logAudit('Sammelbestellung erstellt', `${group.length} Position(en) (${isEigenbeschaffung ? 'Eigenbeschaffung' : 'Massa'})`)
      // Kurzbrief erst nach erfolgreichen DB-Updates drucken
      generateKurzbrief(Object.values(groups), officerPrintName(profile), new Date(), {
        addressee: isEigenbeschaffung ? EIGENBESCHAFFUNG_ADDRESSEE : undefined,
      })
    }
    setSaving(false)
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
      supabase.from('orders').update({ status: 'ready_for_issue', updated_at: new Date().toISOString() }).eq('id', o.id).select('id'),
    ))
    setSaving(false)
    if (results.some(r => r.error || !r.data?.length)) {
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
      const { error: updErr } = await supabase.rpc('book_order_inventory', {
        p_order_id: o.id, p_expected_updated_at: o.updated_at, p_action: 'receive', p_quantity: quantities[o.id],
      })
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
    // Nur Massa-Artikel gehen in die Massa-Sammelbestellung - eigenbeschaffte
    // Artikel gehören nicht in diesen Kurzbrief.
    const selected = tabOrders.filter(o => selectedIds.has(o.id) && o.products?.bezugsart !== 'eigenbeschaffung')
    if (!selected.length) return
    setMassaResult(null)
    setMassaDraft(buildMassaDraft(
      selected.map(o => ({
        articleNumber: o.products?.article_number ?? '',
        name: o.products?.name ?? '–',
        size: o.products?.size_mode === 'sizes' ? o.size : '–',
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
