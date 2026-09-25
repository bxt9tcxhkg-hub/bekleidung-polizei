import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle, Footprints, Package, ShoppingBag, User, Wallet, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Order, ShoeRefund, StockOrder } from '../../lib/types'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, STOCK_ORDER_STATUS_COLORS, STOCK_ORDER_STATUS_LABELS } from '../../lib/types'
import { getCurrentBudget, getUsedBudget, getCurrentShoeRefundCapResult } from '../../lib/budget'
import { logAudit } from '../../lib/audit'
import { fmtEUR } from '../../lib/format'
import { Actions, Empty, GenehmigungenBereichHeader, Table } from '../../components/genehmigungenShared'

const CURRENT_YEAR = new Date().getFullYear()

type PendingOrder = Order & {
  products?: { name: string; category: string; price: number }
  quarters?: { name: string }
  profiles?: { name: string; dienstnummer: string | null; username: string }
}

// Bereichsseite "Bekleidung" (Budgetüberschreitungen, Lagerbestellungen,
// Schuherstattungen) - eine der vier gleich behandelten Genehmigungen-
// Bereichsseiten (siehe GenehmigungenUebersicht.tsx). Inhaltlich unverändert
// gegenüber der vormaligen Bekleidung-Sektion in Approvals.tsx, nur auf eine
// eigene Seite ausgelagert.
export default function GenehmigungenBekleidung() {
  const [orders, setOrders] = useState<PendingOrder[]>([])
  const [stockOrders, setStockOrders] = useState<StockOrder[]>([])
  const [budgets, setBudgets] = useState<Record<string, { total: number; used: number }>>({})
  const [shoeRefunds, setShoeRefunds] = useState<ShoeRefund[]>([])
  const [shoeRefundCap, setShoeRefundCap] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState<{ id: string; reason: string; type: 'order' | 'stock' } | null>(null)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [ordersRes, stockRes, refundRes, capRes] = await Promise.all([
      supabase
        .from('orders')
        .select('*, products(name,category,price,size_mode), quarters(name), profiles(name,dienstnummer,username)')
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: true }),
      supabase
        .from('stock_orders')
        .select('*, products(id,name,article_number,category,size_mode), requester:profiles!stock_orders_requested_by_fkey(id,name)')
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: true }),
      supabase
        .from('shoe_refunds')
        .select('*, profiles!shoe_refunds_user_id_fkey(id,name,username,dienstnummer)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      getCurrentShoeRefundCapResult(),
    ])
    const failed: string[] = []
    const pending = ordersRes.error ? [] : (ordersRes.data ?? []) as PendingOrder[]
    if (ordersRes.error) failed.push('Budgetüberschreitungen')
    else setOrders(pending)
    if (stockRes.error) failed.push('Lagerbestellungen')
    else setStockOrders((stockRes.data ?? []) as StockOrder[])
    if (refundRes.error) failed.push('Schuherstattungen')
    else setShoeRefunds((refundRes.data ?? []) as ShoeRefund[])
    if (capRes.error) { failed.push('Erstattungs-Höchstbetrag'); setShoeRefundCap(null) }
    else setShoeRefundCap(capRes.cap)
    setLoadError(failed.length > 0 ? `Nicht alles konnte geladen werden (${failed.join(', ')}). Bitte Seite neu laden.` : '')
    const userIds = Array.from(new Set(pending.map(o => o.user_id)))
    const budgetEntries = await Promise.all(userIds.map(async uid => {
      const [total, used] = await Promise.all([
        getCurrentBudget(uid, CURRENT_YEAR),
        getUsedBudget(uid, CURRENT_YEAR),
      ])
      return [uid, { total, used }] as const
    }))
    setBudgets(Object.fromEntries(budgetEntries))
    setLoading(false)
  }, [])

  useEffect(() => { load().catch(() => setLoadError('Freigaben konnten nicht geladen werden.')) }, [load])

  const topErrorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (error && !cancelReason) topErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error, cancelReason])

  async function approve(order: PendingOrder) {
    if (processing) return
    setProcessing(order.id)
    setError('')
    const { data: updated, error: err } = await supabase.from('orders')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', order.id).eq('status', 'pending_approval').select('id').maybeSingle()
    setProcessing(null)
    if (err) { setError('Freigabe konnte nicht gespeichert werden. Bitte erneut versuchen.'); return }
    if (!updated) { setError('Diese Bestellung wurde bereits entschieden.'); load(); return }
    logAudit('Bestellung genehmigt', order.profiles?.name ?? '?')
    load()
  }

  async function reject(id: string, reason: string) {
    if (!reason.trim() || processing) return
    setProcessing(id)
    setError('')
    const { data: updated, error: err } = await supabase.from('orders')
      .update({ status: 'cancelled', cancel_reason: reason, updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'pending_approval').select('id').maybeSingle()
    setProcessing(null)
    if (err) { setError('Ablehnung konnte nicht gespeichert werden. Bitte erneut versuchen.'); return }
    if (!updated) { setError('Diese Bestellung wurde bereits entschieden.'); load(); return }
    logAudit('Bestellung abgelehnt', orders.find(o => o.id === id)?.profiles?.name ?? '?')
    setCancelReason(null)
    load()
  }

  async function approveStockOrder(id: string) {
    if (processing) return
    setProcessing(id)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { data: updated, error: err } = await supabase.from('stock_orders').update({
      status: 'approved',
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'pending_approval').select('id').maybeSingle()
    setProcessing(null)
    if (err) { setError('Freigabe konnte nicht gespeichert werden. Bitte erneut versuchen.'); return }
    if (!updated) { setError('Diese Lagerbestellung wurde bereits entschieden.'); load(); return }
    logAudit('Lagerbestellung genehmigt', stockOrders.find(o => o.id === id)?.products?.name ?? '?')
    load()
  }

  async function rejectStockOrder(id: string, reason: string) {
    if (!reason.trim() || processing) return
    setProcessing(id)
    setError('')
    const { data: updated, error: err } = await supabase.from('stock_orders').update({
      status: 'rejected',
      note: reason,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'pending_approval').select('id').maybeSingle()
    setProcessing(null)
    if (err) { setError('Ablehnung konnte nicht gespeichert werden. Bitte erneut versuchen.'); return }
    if (!updated) { setError('Diese Lagerbestellung wurde bereits entschieden.'); load(); return }
    logAudit('Lagerbestellung abgelehnt', stockOrders.find(o => o.id === id)?.products?.name ?? '?')
    setCancelReason(null)
    load()
  }

  async function reviewShoeRefund(refund: ShoeRefund, status: 'approved' | 'rejected') {
    if (processing) return
    setProcessing(refund.id)
    setError('')
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) { setProcessing(null); setError('Anmeldung konnte nicht überprüft werden. Bitte Seite neu laden.'); return }
    const payload: { status: 'approved' | 'rejected'; reviewed_by: string; reviewed_at: string; approved_amount?: number } = {
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }
    if (status === 'approved') {
      if (shoeRefundCap == null) { setProcessing(null); setError('Maximalbetrag ist nicht bekannt. Bitte Seite neu laden.'); return }
      payload.approved_amount = Math.min(Number(refund.amount), shoeRefundCap)
    }
    const { data: updated, error: err } = await supabase
      .from('shoe_refunds')
      .update(payload)
      .eq('id', refund.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    setProcessing(null)
    if (err) { setError(err.message || 'Aktion fehlgeschlagen.'); return }
    if (!updated) { setError('Diese Erstattung wurde bereits entschieden.'); load(); return }
    logAudit(status === 'approved' ? 'Schuherstattung genehmigt' : 'Schuherstattung abgelehnt', refund.profiles?.name ?? '?')
    load()
  }

  function openCancelReason(id: string, type: 'order' | 'stock') {
    setError('')
    setCancelReason({ id, reason: '', type })
  }

  const byUser = orders.reduce<Record<string, PendingOrder[]>>((acc, o) => {
    const key = o.user_id
    if (!acc[key]) acc[key] = []
    acc[key].push(o)
    return acc
  }, {})

  return (
    <div>
      <GenehmigungenBereichHeader title="Bekleidung" description="Budgetüberschreitungen, Lagerbestellungen und Schuherstattungen entscheiden." />

      {loadError && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{loadError}</div>}
      {error && <div ref={topErrorRef} className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="space-y-8">
          {/* Budgetüberschreitungen und Schuherstattungen haben je ein eigenes
              Verwaltungswerkzeug (Jahresbudget/Höchstbetrag festlegen, Verlauf
              einsehen) - der Link dazu gehört direkt in die Kopfzeile der
              jeweiligen Entscheidungsliste, nicht isoliert oben auf die Seite,
              weit weg von der Liste, die er betrifft. Nebeneinander wie bei
              Ausbildung; Lagerbestellungen hat kein eigenes Verwaltungswerkzeug
              und bekommt deshalb die volle Breite darunter. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-blue-700" /> Budgetüberschreitungen</h2>
                <Link to="/budgets" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 flex-shrink-0"><Wallet className="w-3.5 h-3.5" /> Budgetverwaltung</Link>
              </div>
              {orders.length === 0 ? (
              <Empty icon={CheckCircle} title="Keine offenen Freigaben" subtitle="Alle Bestellungen liegen im Budget" />
            ) : (
              <div className="space-y-4">
                {Object.entries(byUser).map(([, userOrders]) => {
                  const user = userOrders[0].profiles
                  const totalValue = userOrders.reduce((s, o) => s + (o.unit_price * o.quantity), 0)
                  const budget = budgets[userOrders[0].user_id]
                  return (
                    <div key={userOrders[0].user_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="flex items-center gap-3 px-5 py-3 bg-amber-50 border-b border-amber-100">
                        <div className="p-1.5 bg-amber-100 rounded-lg">
                          <User className="w-4 h-4 text-amber-700" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{user?.name ?? '–'}</p>
                          <p className="text-xs text-gray-500">{user?.dienstnummer ? `DNr. ${user.dienstnummer}` : user?.username}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-amber-700 font-medium flex items-center gap-1 justify-end">
                            <AlertTriangle className="w-3.5 h-3.5" /> Budget überschritten
                          </p>
                          <p className="text-xs text-gray-500">{userOrders.length} Artikel · {fmtEUR(totalValue)}</p>
                          {budget && (
                            <p className="text-xs text-gray-500">Budget: {fmtEUR(budget.used)} verbraucht / {fmtEUR(budget.total)} gesamt</p>
                          )}
                        </div>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {userOrders.map(o => (
                          <div key={o.id} className="flex items-center gap-4 px-5 py-4">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900">{o.products?.name}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {o.products?.category} · {o.products?.size_mode === 'sizes' ? `Gr. ${o.size} · ` : ''}{o.quantity}× · {o.quarters?.name}
                              </p>
                            </div>
                            <div className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                              {fmtEUR(o.unit_price * o.quantity)}
                            </div>
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ORDER_STATUS_COLORS[o.status]}`}>
                              {ORDER_STATUS_LABELS[o.status]}
                            </span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => approve(o)} disabled={processing === o.id}
                                className="flex items-center gap-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
                                <CheckCircle className="w-3.5 h-3.5" /> Freigeben
                              </button>
                              <button onClick={() => openCancelReason(o.id, 'order')} disabled={processing === o.id}
                                className="flex items-center gap-1.5 text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
                                <XCircle className="w-3.5 h-3.5" /> Ablehnen
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            </div>

            <div className="lg:border-l lg:border-gray-200 lg:pl-8">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Footprints className="w-4 h-4 text-blue-700" /> Schuherstattungen
                  {shoeRefundCap != null && <span className="font-normal text-gray-400">· Höchstbetrag {fmtEUR(shoeRefundCap)}</span>}
                </h2>
                <Link to="/schuherstattungen" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 flex-shrink-0"><Footprints className="w-3.5 h-3.5" /> Verwaltung</Link>
              </div>
              {shoeRefunds.length === 0 ? (
                <Empty icon={Footprints} title="Keine offenen Schuherstattungen" />
              ) : (
                <Table
                  head={['Datum', 'Betrag', 'Erstattungsfähig', 'Beantragt von', 'Notiz', '']}
                  rows={shoeRefunds.map(r => {
                    const capped = shoeRefundCap != null ? Math.min(Number(r.amount), shoeRefundCap) : null
                    return [
                      new Date(r.refund_date).toLocaleDateString('de-AT'),
                      fmtEUR(Number(r.amount)),
                      capped != null
                        ? <span key="cap" className={capped < Number(r.amount) ? 'text-amber-700 font-medium' : ''}>{fmtEUR(capped)}{capped < Number(r.amount) ? ' (gedeckelt)' : ''}</span>
                        : '–',
                      r.profiles?.name ?? '–',
                      r.note ?? '–',
                      <Actions key="ac" disabled={processing === r.id}
                        onApprove={() => void reviewShoeRefund(r, 'approved')}
                        onReject={() => void reviewShoeRefund(r, 'rejected')} />,
                    ]
                  })}
                />
              )}
            </div>
          </div>

          <div className="border-t border-gray-200 pt-8">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-3"><Package className="w-4 h-4 text-blue-700" /> Lagerbestellungen</h2>
            {stockOrders.length === 0 ? (
              <Empty icon={Package} title="Keine offenen Lagerbestellungen" />
            ) : (
              <Table
                head={['Artikel', 'Gr. / Anz.', 'Angefordert von', 'Notiz', 'Status', '']}
                rows={stockOrders.map(o => [
                  <div key="art"><p className="font-medium text-gray-900">{o.products?.name ?? '–'}</p><p className="text-xs text-gray-400">{o.products?.article_number} · {o.products?.category}</p></div>,
                  o.products?.size_mode === 'sizes' ? `${o.size} · ${o.quantity}×` : `${o.quantity}×`,
                  o.requester?.name ?? '–',
                  o.note ?? '–',
                  <span key="st" className={`text-xs font-medium px-2.5 py-1 rounded-full ${STOCK_ORDER_STATUS_COLORS[o.status]}`}>{STOCK_ORDER_STATUS_LABELS[o.status]}</span>,
                  <Actions key="ac" disabled={processing === o.id} onApprove={() => approveStockOrder(o.id)} onReject={() => openCancelReason(o.id, 'stock')} />,
                ])}
              />
            )}
          </div>
        </div>
      )}

      {cancelReason && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">
                {cancelReason.type === 'stock' ? 'Lagerbestellung ablehnen' : 'Bestellung ablehnen'}
              </h2>
            </div>
            <div className="px-6 py-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Begründung *</label>
              <textarea rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                value={cancelReason.reason} onChange={e => setCancelReason(r => r ? { ...r, reason: e.target.value } : r)}
                placeholder="Grund für die Ablehnung..." autoFocus />
              {error && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg mt-3">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setCancelReason(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button
                onClick={() => {
                  if (!cancelReason) return
                  if (cancelReason.type === 'stock') rejectStockOrder(cancelReason.id, cancelReason.reason)
                  else reject(cancelReason.id, cancelReason.reason)
                }}
                disabled={!cancelReason.reason.trim() || processing === cancelReason.id}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">
                Ablehnen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
