import { useEffect, useState } from 'react'
import { X, ChevronDown, ShoppingCart, List, FileText } from 'lucide-react'
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAdvancing, setBulkAdvancing] = useState(false)

  async function load() {
    setLoading(true)
    const query = supabase
      .from('orders')
      .select('*, products(id,name,category,sizes,article_number), quarters(id,name,status), profiles(id,name,username,dienstnummer)')
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
  const advanceable = filtered.filter(o => STATUS_FLOW[o.status] !== null)
  const allSelected = advanceable.length > 0 && advanceable.every(o => selectedIds.has(o.id))

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(advanceable.map(o => o.id)))
  }

  async function bulkAdvance() {
    const toAdvance = filtered.filter(o => selectedIds.has(o.id) && STATUS_FLOW[o.status])
    if (toAdvance.length === 0) return
    setBulkAdvancing(true)
    await Promise.all(toAdvance.map(o =>
      supabase.from('orders').update({ status: STATUS_FLOW[o.status]!, updated_at: new Date().toISOString() }).eq('id', o.id)
    ))
    setSelectedIds(new Set())
    setBulkAdvancing(false)
    load()
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

  function generateKurzbrief() {
    const quarterName = quarters.find(q => q.id === sammelQuarterId)?.name ?? ''
    const now = new Date()
    const DE_MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
    const dateLong = `${String(now.getDate()).padStart(2,'0')}. ${DE_MONTHS[now.getMonth()]} ${now.getFullYear()}`
    const dateShort = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`
    const userName = profile?.name ?? '–'

    const tableRows = sammelGroups.map(g => `
      <tr>
        <td>${(g.orders[0] as any).products?.article_number ?? '–'}</td>
        <td>${g.productName}</td>
        <td>${g.size}</td>
        <td class="center">${g.totalQty}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Kurzbrief ${quarterName}</title>
  <style>
    @page { size: A4; margin: 15mm 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; line-height: 1.45; }
    .header-bar { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #003399; padding-bottom: 8px; margin-bottom: 14px; }
    .header-org { font-size: 15pt; font-weight: bold; color: #003399; }
    .header-sub { font-size: 9pt; color: #555; margin-top: 2px; }
    .header-contact { text-align: right; font-size: 8.5pt; color: #333; line-height: 1.6; }
    .address-block { display: flex; justify-content: space-between; margin: 18px 0 10px; }
    .recipient { font-size: 9.5pt; line-height: 1.6; }
    .date-right { text-align: right; font-size: 10pt; padding-top: 2px; }
    .doc-title { font-size: 15pt; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 3px; margin: 18px 0 6px; }
    .meta-line { font-size: 10pt; margin-bottom: 2px; }
    .body-text { margin: 14px 0 8px; font-size: 10pt; }
    .section-label { font-weight: bold; font-size: 10pt; margin: 6px 0 3px; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    thead tr { background: #003399; color: #fff; }
    thead th { padding: 5px 8px; text-align: left; font-weight: bold; }
    thead th.center { text-align: center; }
    tbody tr:nth-child(even) { background: #f2f4f8; }
    tbody td { padding: 3px 8px; border-bottom: 1px solid #ddd; }
    tbody td.center { text-align: center; }
    .thanks { margin-top: 18px; font-size: 10pt; }
    .signatures { display: flex; justify-content: space-between; margin-top: 38px; }
    .sig-block { width: 44%; }
    .sig-role { font-size: 9pt; color: #555; margin-bottom: 28px; }
    .sig-line { border-top: 1px solid #000; padding-top: 4px; font-size: 9.5pt; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header-bar">
    <div>
      <div class="header-org">STADTPOLIZEI DORNBIRN</div>
      <div class="header-sub">Rathausplatz 2 · A-6850 Dornbirn</div>
    </div>
    <div class="header-contact">
      ${userName}<br>
      T +43 5572 222 00<br>
      F +43 5572 33 0 08<br>
      polizei@dornbirn.at
    </div>
  </div>

  <div class="address-block">
    <div class="recipient">
      Bundesministerium für Inneres<br>
      Bekleidungswirtschaftsfonds der Exekutive<br>
      Liesinger Flur-Gasse 8<br>
      1230 Wien
    </div>
    <div class="date-right">Dornbirn, ${dateLong}</div>
  </div>

  <div class="doc-title">Kurzbrief</div>
  <div class="meta-line"><strong>Betreff:</strong> Auftrag / Bestellung</div>
  <div class="meta-line"><strong>Bezug:</strong> &mdash;&mdash;&mdash;</div>

  <div class="body-text">
    Die ho. Dienststelle der Stadtpolizei Dornbirn übermittelt höflichst den Bestellauftrag
    vom ${dateShort} für folgende ug. Artikel:
  </div>

  <div class="section-label">Standardmannschaft</div>
  <table>
    <thead>
      <tr>
        <th>Artikelnummer</th>
        <th>Artikel</th>
        <th>Größe</th>
        <th class="center">Anzahl</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div class="thanks">Vielen herzlichen Dank im Voraus</div>

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-role">Bearbeiter/in:</div>
      <div class="sig-line">${userName}</div>
    </div>
    <div class="sig-block">
      <div class="sig-role">Kommandant:</div>
      <div class="sig-line">&nbsp;</div>
    </div>
  </div>
</body>
</html>`

    const win = window.open('', '_blank')
    if (!win) { alert('Popup wurde blockiert – bitte Popup-Blocker deaktivieren.'); return }
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 400)
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
                    {isAdmin && (
                      <th className="px-4 py-3 w-8">
                        <input type="checkbox" className="rounded" checked={allSelected} onChange={toggleSelectAll} />
                      </th>
                    )}
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
                    <tr><td colSpan={7} className="text-center py-10 text-gray-400">Keine Bestellungen</td></tr>
                  ) : filtered.map(o => {
                    const canAdvance = !!STATUS_FLOW[o.status]
                    const isSelected = selectedIds.has(o.id)
                    return (
                      <tr key={o.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                        {isAdmin && (
                          <td className="px-4 py-3 w-8">
                            {canAdvance && (
                              <input type="checkbox" className="rounded" checked={isSelected} onChange={() => toggleSelect(o.id)} />
                            )}
                          </td>
                        )}
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
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl">
              <span className="text-sm font-medium">{selectedIds.size} Bestellung{selectedIds.size !== 1 ? 'en' : ''} ausgewählt</span>
              <div className="w-px h-5 bg-white/20" />
              <button
                onClick={bulkAdvance}
                disabled={bulkAdvancing}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-medium px-4 py-1.5 rounded-xl transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
                {bulkAdvancing ? 'Wird gespeichert...' : 'Nächster Status'}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-white/60 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'sammel' && isAdmin && (
        <div className="space-y-4">
          {/* Quartal-Auswahl */}
          <div className="flex items-center gap-3 flex-wrap">
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
            {sammelGroups.length > 0 && (
              <button
                onClick={generateKurzbrief}
                className="ml-auto flex items-center gap-2 border border-blue-300 text-blue-700 text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <FileText className="w-4 h-4" /> Kurzbrief als PDF
              </button>
            )}
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
