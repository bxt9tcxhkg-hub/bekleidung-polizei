import { useEffect, useState } from 'react'
import { X, Check, Package, Scissors, FileText, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Order, OrderStatus } from '../lib/types'

type AdminTab = 'eingereicht' | 'lieferant' | 'schneider' | 'ausgabe' | 'teilweise' | 'ausgegeben' | 'storniert'

const ADMIN_TABS: { key: AdminTab; label: string; status: OrderStatus }[] = [
  { key: 'eingereicht', label: 'Eingereicht',          status: 'approved' },
  { key: 'lieferant',   label: 'Beim Lieferanten',    status: 'ordered_supplier' },
  { key: 'schneider',   label: 'Beim Schneider',       status: 'at_tailor' },
  { key: 'ausgabe',     label: 'Bereit zur Ausgabe',   status: 'ready_for_issue' },
  { key: 'teilweise',   label: 'Teilweise ausgegeben', status: 'partially_issued' },
  { key: 'ausgegeben',  label: 'Ausgegeben',            status: 'issued' },
  { key: 'storniert',   label: 'Storniert',             status: 'cancelled' },
]

const STATUS_BACK: Partial<Record<OrderStatus, OrderStatus>> = {
  ordered_supplier: 'approved',
  at_tailor: 'ordered_supplier',
  ready_for_issue: 'ordered_supplier',
  partially_issued: 'ready_for_issue',
  issued: 'ready_for_issue',
  cancelled: 'approved',
}

export default function Orders() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [inventoryMap, setInventoryMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<AdminTab>('eingereicht')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [receivedInputs, setReceivedInputs] = useState<Record<string, string>>({})
  const [issuedInputs, setIssuedInputs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

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
    const inv: Record<string, number> = {}
    ;(invRes.data ?? []).forEach((e: any) => { inv[`${e.product_id}__${e.size}`] = e.quantity })
    setInventoryMap(inv)
    setLoading(false)
  }

  useEffect(() => { if (profile) load() }, [profile])

  function switchTab(tab: AdminTab) { setActiveTab(tab); setSelectedIds(new Set()) }

  const tabOrders = orders.filter(o => ADMIN_TABS.find(t => t.key === activeTab)?.status === o.status)
  const sorted = ['ausgabe', 'teilweise', 'ausgegeben'].includes(activeTab)
    ? [...tabOrders].sort((a, b) => ((a as any).profiles?.name ?? '').localeCompare((b as any).profiles?.name ?? ''))
    : tabOrders
  const allSelected = tabOrders.length > 0 && tabOrders.every(o => selectedIds.has(o.id))
  const counts = Object.fromEntries(ADMIN_TABS.map(t => [t.key, orders.filter(o => o.status === t.status).length])) as Record<AdminTab, number>

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleSelectAll() { setSelectedIds(allSelected ? new Set() : new Set(tabOrders.map(o => o.id))) }

  async function advanceSelected(nextStatus: OrderStatus) {
    const items = tabOrders.filter(o => selectedIds.has(o.id))
    if (!items.length) return
    setSaving(true)
    await Promise.all(items.map(o => supabase.from('orders').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', o.id)))
    setSelectedIds(new Set()); setSaving(false); load()
  }

  async function advanceWithReceived(nextStatus: OrderStatus) {
    const items = tabOrders.filter(o => selectedIds.has(o.id))
    if (!items.length) return
    setSaving(true)
    await Promise.all(items.map(o => {
      const qr = receivedInputs[o.id] ? parseInt(receivedInputs[o.id]) : o.quantity
      return supabase.from('orders').update({ status: nextStatus, quantity_received: qr, updated_at: new Date().toISOString() }).eq('id', o.id)
    }))
    setSelectedIds(new Set()); setSaving(false); load()
  }

  async function stepBack() {
    const tabStatus = ADMIN_TABS.find(t => t.key === activeTab)?.status
    if (!tabStatus) return
    const prevStatus = STATUS_BACK[tabStatus]
    if (!prevStatus) return
    const items = sorted.filter(o => selectedIds.has(o.id))
    if (!items.length) return
    setSaving(true)
    await Promise.all(items.map(o => {
      const base = { status: prevStatus, updated_at: new Date().toISOString() }
      if (tabStatus === 'ordered_supplier')
        return supabase.from('orders').update({ ...base, quantity_received: null }).eq('id', o.id)
      if (tabStatus === 'partially_issued' || tabStatus === 'issued')
        return supabase.from('orders').update({ ...base, quantity_issued: null }).eq('id', o.id)
      return supabase.from('orders').update(base).eq('id', o.id)
    }))
    setSelectedIds(new Set()); setSaving(false); load()
  }

  async function saveReceived(order: Order) {
    const qr = receivedInputs[order.id] !== undefined ? parseInt(receivedInputs[order.id]) : null
    if (qr === null || isNaN(qr)) return
    setSaving(true)
    await supabase.from('orders').update({ quantity_received: qr, updated_at: new Date().toISOString() }).eq('id', order.id)
    setSaving(false); load()
  }

  async function issueOrder(order: Order) {
    const qtyNow = parseInt(issuedInputs[order.id] ?? '') || 0
    if (qtyNow <= 0) return
    const qtyRef = order.quantity_received ?? order.quantity
    const prevIssued = order.quantity_issued ?? 0
    const newTotal = activeTab === 'teilweise' ? prevIssued + qtyNow : qtyNow
    const nextStatus: OrderStatus = newTotal >= qtyRef ? 'issued' : 'partially_issued'
    setSaving(true)
    await supabase.from('orders').update({ status: nextStatus, quantity_issued: newTotal, updated_at: new Date().toISOString() }).eq('id', order.id)
    setSaving(false); load()
  }

  async function createSammelbestellung() {
    const selected = tabOrders.filter(o => selectedIds.has(o.id))
    if (!selected.length) return
    const groups: Record<string, { artNr: string; productName: string; size: string; totalQty: number }> = {}
    selected.forEach(o => {
      const key = `${o.product_id}__${o.size}`
      if (!groups[key]) groups[key] = { artNr: (o as any).products?.article_number ?? '–', productName: (o as any).products?.name ?? '–', size: o.size, totalQty: 0 }
      groups[key].totalQty += o.quantity
    })
    generateKurzbrief(Object.values(groups))
    setSaving(true)
    await Promise.all(selected.map(o => supabase.from('orders').update({ status: 'ordered_supplier', updated_at: new Date().toISOString() }).eq('id', o.id)))
    setSelectedIds(new Set()); setSaving(false); load()
  }

  function generateKurzbrief(items: { artNr: string; productName: string; size: string; totalQty: number }[]) {
    const now = new Date()
    const DE_MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
    const dateLong = `${String(now.getDate()).padStart(2,'0')}. ${DE_MONTHS[now.getMonth()]} ${now.getFullYear()}`
    const dateShort = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`
    const userName = profile?.name ?? '–'
    const tableRows = items.map(g =>
      `<tr><td>${g.artNr}</td><td>${g.productName}</td><td class="b">${g.size}</td><td class="b c">${g.totalQty}</td></tr>`
    ).join('\n')
    const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Kurzbrief</title><style>
  @page{size:A4;margin:20mm 25mm 20mm 25mm}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Calibri,Arial,sans-serif;font-size:12pt;color:#000;line-height:1.4}
  .lh{font-size:8pt;line-height:1.6;margin-bottom:5mm}
  .lh strong{font-weight:bold}
  .ra{font-size:8pt;border-bottom:1px solid #666;padding-bottom:1mm;margin-bottom:4mm;color:#333}
  .ad{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6mm}
  .rc{font-size:12pt;line-height:1.7}
  .dt{font-size:12pt;white-space:nowrap}
  .kt{font-size:18pt;font-weight:bold;margin-bottom:4mm}
  .mt{border-collapse:collapse;margin-bottom:5mm}
  .mt td{font-size:11pt;padding:1px 0;vertical-align:top}
  .mt td:first-child{min-width:60pt;padding-right:8px}
  .bt{font-size:12pt;margin-bottom:3mm}
  .sl{font-size:12pt;font-weight:bold;margin-bottom:2mm}
  .at{width:100%;border-collapse:collapse;margin-bottom:7mm}
  .at th,.at td{border:1px solid #000;padding:2px 5px;font-size:12pt;vertical-align:middle}
  .at th{font-weight:normal;text-align:left}
  .c1{width:22%}.c2{width:47%}.c3{width:14%}.c4{width:17%}
  .b{font-weight:bold}.c{text-align:center}
  .tk{font-size:12pt;margin-bottom:10mm}
  .st{width:100%;border-collapse:collapse}
  .sh td{font-size:11pt;border-top:1px solid #000;padding-top:2mm;width:50%}
  .se td{height:18mm}
  .sn td{font-size:11pt}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="lh">
  STADT DORNBIRN &nbsp;<strong>Polizei</strong><br>
  Rathausplatz 2 &nbsp;A 6850 Dornbirn<br>
  ${userName}<br>
  T +43 5572 222 00 &nbsp;&nbsp; F +43 5572 330 08 &nbsp;&nbsp; polizei@dornbirn.at
</div>
<div class="ra">STADT DORNBIRN Polizei, Rathausplatz 2, A-6850 Dornbirn</div>
<div class="ad">
  <div class="rc">An<br>Bundesministerium für Inneres<br>Bekleidungswirtschaftsfonds der Exekutive<br>Liesinger Flur-Gasse 8<br>1230 Wien</div>
  <div class="dt">Dornbirn, ${dateLong}</div>
</div>
<div class="kt">Kurzbrief</div>
<table class="mt">
  <tr><td>Betreff:</td><td>Auftrag / Bestellung</td></tr>
  <tr><td>&nbsp;</td><td>&nbsp;</td></tr>
  <tr><td>Bezug:</td><td>---</td></tr>
</table>
<p class="bt">Die ho. Dienststelle der Stadtpolizei Dornbirn übermittelt höflichst den Bestellauftrag vom ${dateShort} für folgende ug. Artikel:</p>
<p class="sl">Standartmannschaft</p>
<table class="at">
  <thead><tr><th class="c1">Artikelnummer</th><th class="c2">Artikel</th><th class="c3">Größe</th><th class="c4 c">Anzahl</th></tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<p class="tk">Vielen herzlichen Dank im Voraus</p>
<table class="st">
  <tr class="sh"><td>Bearbeiter/in:</td><td>Kommandant:</td></tr>
  <tr class="se"><td></td><td></td></tr>
  <tr class="sn"><td>${userName}</td><td>ChefInsp Hans Peter SCHWENDINGER</td></tr>
</table>
</body></html>`
    const win = window.open('', '_blank')
    if (!win) { alert('Popup wurde blockiert – bitte Popup-Blocker deaktivieren.'); return }
    win.document.write(html); win.document.close(); win.focus()
    setTimeout(() => win.print(), 400)
  }

  function generateAusgabeliste() {
    const ausgabeOrders = orders
      .filter(o => o.status === 'ready_for_issue')
      .sort((a, b) => ((a as any).profiles?.name ?? '').localeCompare((b as any).profiles?.name ?? ''))

    if (ausgabeOrders.length === 0) return

    // Group by user
    const byUser: Record<string, { name: string; dienstnummer: string | null; orders: Order[] }> = {}
    ausgabeOrders.forEach(o => {
      const uid = o.user_id
      if (!byUser[uid]) byUser[uid] = {
        name: (o as any).profiles?.name ?? '–',
        dienstnummer: (o as any).profiles?.dienstnummer ?? null,
        orders: [],
      }
      byUser[uid].orders.push(o)
    })

    const now = new Date()
    const DE_MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
    const dateLong = `${String(now.getDate()).padStart(2,'0')}. ${DE_MONTHS[now.getMonth()]} ${now.getFullYear()}`

    const userBlocks = Object.values(byUser).map(u => {
      const rows = u.orders.map(o => {
        const avail = o.quantity_received ?? o.quantity
        const issued = o.quantity_issued ?? 0
        const outstanding = avail - issued
        return `<tr>
          <td>${(o as any).products?.name ?? '–'}</td>
          <td>${(o as any).products?.category ?? ''}</td>
          <td class="center">${o.size}</td>
          <td class="center">${o.quantity}</td>
          <td class="center">${avail}</td>
          <td class="center highlight">${outstanding}</td>
          <td class="sig-col"></td>
        </tr>`
      }).join('\n')
      const dg = u.dienstnummer ? ` · DG ${u.dienstnummer}` : ''
      return `<div class="user-block">
        <div class="user-header">${u.name}${dg}</div>
        <table class="items-table">
          <thead><tr>
            <th>Artikel</th>
            <th>Kategorie</th>
            <th class="center">Gr.</th>
            <th class="center">Bestellt</th>
            <th class="center">Verfügbar</th>
            <th class="center">Auszufolgen</th>
            <th class="center">Unterschrift</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
    }).join('\n')

    const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Ausgabeliste</title><style>
  @page { size: A4; margin: 15mm 18mm 18mm 18mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000; line-height: 1.4; }
  .page-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 14px; }
  .page-title { font-size: 16pt; font-weight: bold; }
  .page-meta { font-size: 9pt; color: #444; text-align: right; }
  .user-block { margin-bottom: 18px; break-inside: avoid; }
  .user-header { font-size: 11pt; font-weight: bold; background: #e8edf5; padding: 4px 8px; border-left: 4px solid #1e40af; margin-bottom: 0; }
  .items-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  .items-table th { background: #f1f4f9; font-weight: semibold; padding: 3px 6px; border: 1px solid #ccc; text-align: left; }
  .items-table td { padding: 4px 6px; border: 1px solid #ccc; }
  .center { text-align: center; }
  .highlight { font-weight: bold; background: #fef9c3; }
  .sig-col { min-width: 80px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <div class="page-header">
    <div>
      <div class="page-title">Ausgabeliste – Bereit zur Ausgabe</div>
      <div style="font-size:9pt;color:#555;margin-top:2px">Stadtpolizei Dornbirn</div>
    </div>
    <div class="page-meta">Erstellt: ${dateLong}<br>Einträge: ${ausgabeOrders.length}</div>
  </div>
  ${userBlocks}
</body></html>`

    const win = window.open('', '_blank')
    if (!win) { alert('Popup wurde blockiert – bitte Popup-Blocker deaktivieren.'); return }
    win.document.write(html); win.document.close(); win.focus()
    setTimeout(() => win.print(), 400)
  }

  const thClass = 'text-left px-3 py-2.5 md:px-4 md:py-3 font-semibold text-gray-600 whitespace-nowrap text-xs md:text-sm'
  const thCClass = 'text-center px-3 py-2.5 md:px-4 md:py-3 font-semibold text-gray-600 whitespace-nowrap text-xs md:text-sm'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bestellungen</h1>
        <p className="text-gray-500 text-sm mt-1">Bestellverwaltung</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 scrollbar-hide flex-nowrap">
        {ADMIN_TABS.map(tab => (
          <button key={tab.key} onClick={() => switchTab(tab.key)}
            className={`flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-lg border transition-colors ${
              activeTab === tab.key ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'
            }`}>
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full leading-none ${activeTab === tab.key ? 'bg-white/20' : 'bg-blue-100 text-blue-700'}`}>
                {counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-gray-400">
          <Package className="w-10 h-10 mb-3 opacity-40" />
          <p className="font-medium">Keine Bestellungen</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">

          {/* ── Eingereicht ── */}
          {activeTab === 'eingereicht' && (
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2.5 md:px-4 md:py-3 w-8"><input type="checkbox" className="rounded" checked={allSelected} onChange={toggleSelectAll} /></th>
                <th className={thClass}>Benutzer</th>
                <th className={thClass}>Produkt</th>
                <th className={`${thClass} hidden sm:table-cell`}>Quartal</th>
                <th className={thClass}>Gr. / Anz.</th>
                <th className={`${thCClass} hidden sm:table-cell`}>Lager</th>
                <th className="hidden sm:table-cell text-right px-3 py-2.5 md:px-4 md:py-3 font-semibold text-gray-600 whitespace-nowrap text-xs md:text-sm">Preis</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(o => {
                  const stock = inventoryMap[`${o.product_id}__${o.size}`] ?? 0
                  return (
                    <tr key={o.id} className={`hover:bg-gray-50 ${selectedIds.has(o.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-3 py-2.5 md:px-4 md:py-3"><input type="checkbox" className="rounded" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900">{(o as any).profiles?.name}</p><p className="text-xs text-gray-400">{(o as any).profiles?.dienstnummer ? `DG ${(o as any).profiles.dienstnummer}` : (o as any).profiles?.username}</p></td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900">{(o as any).products?.name}</p><p className="text-xs text-gray-400">{(o as any).products?.category}</p></td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-500 text-sm hidden sm:table-cell">{(o as any).quarters?.name}</td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-600">{o.size} · {o.quantity}×</td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3 text-center hidden sm:table-cell">
                        {stock >= o.quantity ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">{stock}× lagernd</span>
                        ) : stock > 0 ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{stock}× lagernd</span>
                        ) : (
                          <span className="text-xs text-gray-400">–</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3 text-right font-medium text-gray-700 hidden sm:table-cell">€ {(o.unit_price * o.quantity).toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* ── Beim Lieferanten ── */}
          {activeTab === 'lieferant' && (
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2.5 md:px-4 md:py-3 w-8"><input type="checkbox" className="rounded" checked={allSelected} onChange={toggleSelectAll} /></th>
                <th className={thClass}>Benutzer</th>
                <th className={thClass}>Produkt</th>
                <th className={thClass}>Gr.</th>
                <th className={thCClass}>Bestellt</th>
                <th className={thCClass}>Erhalten</th>
                <th className="px-3 py-2.5 md:px-4 md:py-3" />
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(o => {
                  const saved = o.quantity_received != null
                  const dirty = receivedInputs[o.id] !== undefined && receivedInputs[o.id] !== String(o.quantity_received ?? '')
                  return (
                    <tr key={o.id} className={`hover:bg-gray-50 ${selectedIds.has(o.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-3 py-2.5 md:px-4 md:py-3"><input type="checkbox" className="rounded" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900">{(o as any).profiles?.name}</p><p className="text-xs text-gray-400">{(o as any).profiles?.dienstnummer ? `DG ${(o as any).profiles.dienstnummer}` : ''}</p></td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900">{(o as any).products?.name}</p><p className="text-xs text-gray-400">{(o as any).products?.category}</p></td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-600">{o.size}</td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3 text-center font-semibold text-gray-800">{o.quantity}</td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3"><div className="flex justify-center">
                        <input type="number" min="0" max={o.quantity}
                          className={`w-14 text-center border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${dirty ? 'border-amber-400 bg-amber-50' : saved ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}
                          placeholder={String(o.quantity)} value={receivedInputs[o.id] ?? ''}
                          onChange={e => setReceivedInputs(prev => ({ ...prev, [o.id]: e.target.value }))} />
                      </div></td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3">
                        <button onClick={() => saveReceived(o)} disabled={saving || !dirty}
                          className="text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white px-3 py-2 rounded-lg disabled:opacity-30 whitespace-nowrap">
                          Speichern
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* ── Beim Schneider ── */}
          {activeTab === 'schneider' && (
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2.5 md:px-4 md:py-3 w-8"><input type="checkbox" className="rounded" checked={allSelected} onChange={toggleSelectAll} /></th>
                <th className={thClass}>Benutzer</th>
                <th className={thClass}>Produkt</th>
                <th className={thClass}>Gr.</th>
                <th className={thCClass}>Bestellt</th>
                <th className={thCClass}>Erhalten</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(o => (
                  <tr key={o.id} className={`hover:bg-gray-50 ${selectedIds.has(o.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-2.5 md:px-4 md:py-3"><input type="checkbox" className="rounded" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900">{(o as any).profiles?.name}</p><p className="text-xs text-gray-400">{(o as any).profiles?.dienstnummer ? `DG ${(o as any).profiles.dienstnummer}` : ''}</p></td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900">{(o as any).products?.name}</p><p className="text-xs text-gray-400">{(o as any).products?.category}</p></td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-600">{o.size}</td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3 text-center font-semibold text-gray-800">{o.quantity}</td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3 text-center text-gray-600">{o.quantity_received ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Bereit zur Ausgabe + Teilweise ausgegeben ── */}
          {(activeTab === 'ausgabe' || activeTab === 'teilweise') && (
            <>
            {activeTab === 'ausgabe' && (
              <div className="flex justify-end px-4 py-3 border-b border-gray-100">
                <button onClick={generateAusgabeliste}
                  className="flex items-center gap-2 border border-blue-300 text-blue-700 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-blue-50 transition-colors">
                  <FileText className="w-4 h-4" /> Ausgabeliste als PDF
                </button>
              </div>
            )}
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2.5 md:px-4 md:py-3 w-8"><input type="checkbox" className="rounded" checked={allSelected} onChange={toggleSelectAll} /></th>
                <th className={thClass}>Benutzer</th>
                <th className={thClass}>Produkt</th>
                <th className={thClass}>Gr.</th>
                <th className={`${thCClass} hidden sm:table-cell`}>Bestellt</th>
                <th className={`${thCClass} hidden sm:table-cell`}>Geliefert</th>
                {activeTab === 'teilweise' && <th className={thCClass}>Ausgegeben</th>}
                <th className={thCClass}>{activeTab === 'teilweise' ? 'Ausstehend' : 'Verfügbar'}</th>
                <th className={thCClass}>Auszugeben</th>
                <th className="px-3 py-2.5 md:px-4 md:py-3" />
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(o => {
                  const qtyRef = o.quantity_received ?? o.quantity
                  const qtyIssued = o.quantity_issued ?? 0
                  const outstanding = qtyRef - qtyIssued
                  return (
                    <tr key={o.id} className={`hover:bg-gray-50 ${selectedIds.has(o.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-3 py-2.5 md:px-4 md:py-3"><input type="checkbox" className="rounded" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900">{(o as any).profiles?.name}</p><p className="text-xs text-gray-400">{(o as any).profiles?.dienstnummer ? `DG ${(o as any).profiles.dienstnummer}` : ''}</p></td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900">{(o as any).products?.name}</p><p className="text-xs text-gray-400">{(o as any).products?.category}</p></td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-600">{o.size}</td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3 text-center text-gray-700 hidden sm:table-cell">{o.quantity}</td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3 text-center text-gray-700 hidden sm:table-cell">{o.quantity_received ?? '–'}</td>
                      {activeTab === 'teilweise' && <td className="px-3 py-2.5 md:px-4 md:py-3 text-center text-gray-700">{qtyIssued}</td>}
                      <td className="px-3 py-2.5 md:px-4 md:py-3 text-center font-semibold text-blue-700">{outstanding}</td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3"><div className="flex justify-center">
                        <input type="number" min="1" max={outstanding}
                          className="w-14 text-center border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder={String(outstanding)} value={issuedInputs[o.id] ?? ''}
                          onChange={e => setIssuedInputs(prev => ({ ...prev, [o.id]: e.target.value }))} />
                      </div></td>
                      <td className="px-3 py-2.5 md:px-4 md:py-3">
                        <button onClick={() => issueOrder(o)} disabled={saving || !(parseInt(issuedInputs[o.id] ?? '') > 0)}
                          className="text-xs font-medium bg-green-700 hover:bg-green-800 text-white px-3 py-2 rounded-lg disabled:opacity-40 whitespace-nowrap">
                          Ausgeben
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </>
          )}

          {/* ── Ausgegeben ── */}
          {activeTab === 'ausgegeben' && (
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2.5 md:px-4 md:py-3 w-8"><input type="checkbox" className="rounded" checked={allSelected} onChange={toggleSelectAll} /></th>
                <th className={thClass}>Benutzer</th>
                <th className={thClass}>Produkt</th>
                <th className={thClass}>Gr.</th>
                <th className={thCClass}>Bestellt</th>
                <th className={thCClass}>Ausgegeben</th>
                <th className={thClass}>Quartal</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(o => (
                  <tr key={o.id} className={`hover:bg-gray-50 ${selectedIds.has(o.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-2.5 md:px-4 md:py-3"><input type="checkbox" className="rounded" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900">{(o as any).profiles?.name}</p><p className="text-xs text-gray-400">{(o as any).profiles?.dienstnummer ? `DG ${(o as any).profiles.dienstnummer}` : ''}</p></td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900">{(o as any).products?.name}</p><p className="text-xs text-gray-400">{(o as any).products?.category}</p></td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-600">{o.size}</td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3 text-center text-gray-700">{o.quantity}</td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3 text-center text-gray-700">{o.quantity_issued ?? o.quantity}</td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-500">{(o as any).quarters?.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Storniert ── */}
          {activeTab === 'storniert' && (
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2.5 md:px-4 md:py-3 w-8"><input type="checkbox" className="rounded" checked={allSelected} onChange={toggleSelectAll} /></th>
                <th className={thClass}>Benutzer</th>
                <th className={thClass}>Produkt</th>
                <th className={thClass}>Gr. / Anz.</th>
                <th className={thClass}>Grund</th>
                <th className={thClass}>Quartal</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(o => (
                  <tr key={o.id} className={`hover:bg-gray-50 opacity-75 ${selectedIds.has(o.id) ? 'bg-blue-50 !opacity-100' : ''}`}>
                    <td className="px-3 py-2.5 md:px-4 md:py-3"><input type="checkbox" className="rounded" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900">{(o as any).profiles?.name}</p><p className="text-xs text-gray-400">{(o as any).profiles?.dienstnummer ? `DG ${(o as any).profiles.dienstnummer}` : ''}</p></td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900">{(o as any).products?.name}</p><p className="text-xs text-gray-400">{(o as any).products?.category}</p></td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-600">{o.size} · {o.quantity}×</td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3 text-red-600">{o.cancel_reason ?? '–'}</td>
                    <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-500">{(o as any).quarters?.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

        </div>
      )}

      {/* ── Floating action bars ── */}

      {activeTab === 'eingereicht' && selectedIds.size > 0 && (
        <div className="fixed bottom-4 md:bottom-6 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 flex flex-wrap items-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl max-w-[calc(100vw-2rem)] md:max-w-none">
          <span className="text-sm font-medium">{selectedIds.size} Bestellung{selectedIds.size !== 1 ? 'en' : ''} ausgewählt</span>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={createSammelbestellung} disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm font-medium px-4 py-2 rounded-xl">
            <FileText className="w-4 h-4" />
            {saving ? 'Wird gespeichert...' : 'Sammelbestellung erstellen'}
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-white/60 hover:text-white p-2 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
      )}

      {activeTab === 'lieferant' && selectedIds.size > 0 && (
        <div className="fixed bottom-4 md:bottom-6 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 flex flex-wrap items-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl max-w-[calc(100vw-2rem)] md:max-w-none">
          <span className="text-sm font-medium">{selectedIds.size} ausgewählt</span>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={() => advanceWithReceived('at_tailor')} disabled={saving}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-sm font-medium px-4 py-2 rounded-xl">
            <Scissors className="w-4 h-4" /> Zum Schneider
          </button>
          <button onClick={() => advanceWithReceived('ready_for_issue')} disabled={saving}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-sm font-medium px-4 py-2 rounded-xl">
            <Check className="w-4 h-4" /> Bereit zur Ausgabe
          </button>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={stepBack} disabled={saving}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm font-medium px-3 py-2 rounded-xl">
            <RotateCcw className="w-3.5 h-3.5" /> Rückgängig
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-white/60 hover:text-white p-2 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
      )}

      {activeTab === 'schneider' && selectedIds.size > 0 && (
        <div className="fixed bottom-4 md:bottom-6 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 flex flex-wrap items-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl max-w-[calc(100vw-2rem)] md:max-w-none">
          <span className="text-sm font-medium">{selectedIds.size} ausgewählt</span>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={() => advanceSelected('ready_for_issue')} disabled={saving}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-sm font-medium px-4 py-2 rounded-xl">
            <Check className="w-4 h-4" /> Bereit zur Ausgabe
          </button>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={stepBack} disabled={saving}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm font-medium px-3 py-2 rounded-xl">
            <RotateCcw className="w-3.5 h-3.5" /> Rückgängig
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-white/60 hover:text-white p-2 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
      )}

      {(activeTab === 'ausgabe' || activeTab === 'teilweise') && selectedIds.size > 0 && (
        <div className="fixed bottom-4 md:bottom-6 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 flex flex-wrap items-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl max-w-[calc(100vw-2rem)] md:max-w-none">
          <span className="text-sm font-medium">{selectedIds.size} ausgewählt</span>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={stepBack} disabled={saving}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm font-medium px-3 py-2 rounded-xl">
            <RotateCcw className="w-3.5 h-3.5" /> Rückgängig
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-white/60 hover:text-white p-2 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
      )}

      {activeTab === 'ausgegeben' && selectedIds.size > 0 && (
        <div className="fixed bottom-4 md:bottom-6 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 flex flex-wrap items-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl max-w-[calc(100vw-2rem)] md:max-w-none">
          <span className="text-sm font-medium">{selectedIds.size} ausgewählt</span>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={stepBack} disabled={saving}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm font-medium px-3 py-2 rounded-xl">
            <RotateCcw className="w-3.5 h-3.5" /> Rückgängig
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-white/60 hover:text-white p-2 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
      )}

      {activeTab === 'storniert' && selectedIds.size > 0 && (
        <div className="fixed bottom-4 md:bottom-6 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 flex flex-wrap items-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl max-w-[calc(100vw-2rem)] md:max-w-none">
          <span className="text-sm font-medium">{selectedIds.size} ausgewählt</span>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={stepBack} disabled={saving}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm font-medium px-3 py-2 rounded-xl">
            <RotateCcw className="w-3.5 h-3.5" /> Wiederherstellen
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-white/60 hover:text-white p-2 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  )
}
