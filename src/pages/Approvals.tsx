import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, User, Package, Shield, ShoppingBag, GraduationCap, Footprints } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type {
  EinsatzTrainingAssignment,
  EinsatzTrainingModule,
  EinsatzTrainingSession,
  Order,
  PersonalEinsatzmittelRequest,
  PoolEinsatzmittelRequest,
  SchulungAssignment,
  SchulungModule,
  SchulungSession,
  ShoeRefund,
  StockOrder,
} from '../lib/types'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, STOCK_ORDER_STATUS_COLORS, STOCK_ORDER_STATUS_LABELS } from '../lib/types'
import { getCurrentBudget, getUsedBudget, getCurrentShoeRefundCap } from '../lib/budget'
import { logAudit } from '../lib/audit'
import { fmtEUR } from '../lib/format'
import { PERSONAL_EM_CATEGORY_LABELS, officerDisplayName, personalEmDetailText } from '../lib/personalEinsatzmittel'
import { POOL_EM_CATEGORY_LABELS } from '../lib/poolEinsatzmittel'
import { VERWAHRUNGSORT_LABELS } from '../lib/verwahrungsort'

const CURRENT_YEAR = new Date().getFullYear()

type PendingOrder = Order & {
  products?: { name: string; category: string; price: number }
  quarters?: { name: string }
  profiles?: { name: string; dienstnummer: string | null; username: string }
}
type ProfileMini = { id: string; name: string | null; dienstnummer: string | null; username: string }
type PersonalEmWithRequester = PersonalEinsatzmittelRequest & { requester?: ProfileMini | null }
type PoolEmWithRequester = PoolEinsatzmittelRequest & { requester?: ProfileMini | null }
type TrainingAssignmentWithOfficer = EinsatzTrainingAssignment & { officer?: ProfileMini | null }
type SchulungAssignmentWithOfficer = SchulungAssignment & { officer?: ProfileMini | null }

// Zwei Vorschlag-Zuteilungen (Einsatztraining/Schulungen) sind strukturell
// identisch - eine Genehmigung braucht zwingend einen gewählten Termin,
// beides läuft über dieselbe Art RPC (nur der Funktionsname unterscheidet
// sich). Gemeinsam behandelt, um die Sektionen nicht zu duplizieren.
type AssignmentKind = 'training' | 'schulung'

export default function Approvals() {
  const [orders, setOrders] = useState<PendingOrder[]>([])
  const [stockOrders, setStockOrders] = useState<StockOrder[]>([])
  const [budgets, setBudgets] = useState<Record<string, { total: number; used: number }>>({})
  const [personalEm, setPersonalEm] = useState<PersonalEmWithRequester[]>([])
  const [poolEm, setPoolEm] = useState<PoolEmWithRequester[]>([])
  const [trainingModules, setTrainingModules] = useState<EinsatzTrainingModule[]>([])
  const [trainingSessions, setTrainingSessions] = useState<EinsatzTrainingSession[]>([])
  const [trainingAssignments, setTrainingAssignments] = useState<TrainingAssignmentWithOfficer[]>([])
  const [schulungModules, setSchulungModules] = useState<SchulungModule[]>([])
  const [schulungSessions, setSchulungSessions] = useState<SchulungSession[]>([])
  const [schulungAssignments, setSchulungAssignments] = useState<SchulungAssignmentWithOfficer[]>([])
  const [shoeRefunds, setShoeRefunds] = useState<ShoeRefund[]>([])
  const [shoeRefundCap, setShoeRefundCap] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState<{ id: string; reason: string; type: 'order' | 'stock' | 'personal' | 'pool' } | null>(null)
  const [reviewingAssignment, setReviewingAssignment] = useState<{ kind: AssignmentKind; item: TrainingAssignmentWithOfficer | SchulungAssignmentWithOfficer } | null>(null)
  const [reviewSessionId, setReviewSessionId] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [error, setError] = useState('')
  // Getrennt von error: eine fehlgeschlagene Teil-Ladung darf nicht verschwinden,
  // nur weil währenddessen ein Dialog geöffnet/geschlossen wird (der error für
  // seine eigenen Aktionsmeldungen zurücksetzt) - sonst zeigt der betroffene
  // Bereich fälschlich "keine offenen ..." ohne jeden Hinweis darauf, dass er
  // nie geladen wurde.
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    // Nicht blockierend: der aktuelle Erstattungs-Cap wird für die Anzeige des
    // tatsächlich erstattungsfähigen Betrags in der Schuherstattungen-Tabelle
    // gebraucht (reviewShoeRefund() rechnet damit ohnehin zum Zeitpunkt der
    // Genehmigung neu).
    getCurrentShoeRefundCap().then(setShoeRefundCap).catch(() => {})
    const [ordersRes, stockRes, personalRes, poolRes, tModRes, tSessRes, tAssignRes, sModRes, sSessRes, sAssignRes, refundRes] = await Promise.all([
      supabase
        .from('orders')
        .select('*, products(name,category,price), quarters(name), profiles(name,dienstnummer,username)')
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: true }),
      supabase
        .from('stock_orders')
        .select('*, products(id,name,article_number,category), requester:profiles!stock_orders_requested_by_fkey(id,name)')
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: true }),
      supabase
        .from('personal_einsatzmittel_requests')
        .select('*, requester:profiles!requester_id(id,name,dienstnummer,username)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('pool_einsatzmittel_requests')
        .select('*, requester:profiles!requested_by(id,name,dienstnummer,username)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase.from('einsatz_training_modules').select('*'),
      supabase.from('einsatz_training_sessions').select('*').eq('announced', true).order('session_date', { ascending: true }),
      supabase
        .from('einsatz_training_assignments')
        .select('*, officer:profiles!officer_id(id,name,dienstnummer,username)')
        .eq('status', 'vorschlag')
        .order('proposed_at', { ascending: true }),
      supabase.from('schulungen_module').select('*'),
      supabase.from('schulungen_sessions').select('*').eq('announced', true).order('session_date', { ascending: true }),
      supabase
        .from('schulungen_assignments')
        .select('*, officer:profiles!officer_id(id,name,dienstnummer,username)')
        .eq('status', 'vorschlag')
        .order('proposed_at', { ascending: true }),
      supabase
        .from('shoe_refunds')
        .select('*, profiles!shoe_refunds_user_id_fkey(id,name,username,dienstnummer)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
    ])
    // Ein fehlgeschlagener Query darf nicht als "keine offenen Fälle" durchgehen -
    // das würde dem Genehmiger echte, noch unentschiedene Fälle verstecken. Bei
    // einem Fehler bleibt die jeweilige Liste unverändert (statt auf [] geleert)
    // und der Bereich wird im Fehlerbanner benannt.
    const failed: string[] = []
    const pending = ordersRes.error ? [] : (ordersRes.data ?? []) as PendingOrder[]
    if (ordersRes.error) failed.push('Budgetüberschreitungen')
    else setOrders(pending)
    if (stockRes.error) failed.push('Lagerbestellungen')
    else setStockOrders((stockRes.data ?? []) as StockOrder[])
    if (personalRes.error) failed.push('Einsatzmittel-Meldungen (persönlich)')
    else setPersonalEm((personalRes.data ?? []) as PersonalEmWithRequester[])
    if (poolRes.error) failed.push('Beschaffungsanträge (Pool-Einsatzmittel)')
    else setPoolEm((poolRes.data ?? []) as PoolEmWithRequester[])
    if (tModRes.error) failed.push('Trainingsmodule')
    else setTrainingModules((tModRes.data ?? []) as EinsatzTrainingModule[])
    if (tSessRes.error) failed.push('Trainings-Termine')
    else setTrainingSessions((tSessRes.data ?? []) as EinsatzTrainingSession[])
    if (tAssignRes.error) failed.push('Trainings-Zuteilungsvorschläge')
    else setTrainingAssignments((tAssignRes.data ?? []) as TrainingAssignmentWithOfficer[])
    if (sModRes.error) failed.push('Schulungsmodule')
    else setSchulungModules((sModRes.data ?? []) as SchulungModule[])
    if (sSessRes.error) failed.push('Schulungs-Termine')
    else setSchulungSessions((sSessRes.data ?? []) as SchulungSession[])
    if (sAssignRes.error) failed.push('Schulungs-Zuteilungsvorschläge')
    else setSchulungAssignments((sAssignRes.data ?? []) as SchulungAssignmentWithOfficer[])
    if (refundRes.error) failed.push('Schuherstattungen')
    else setShoeRefunds((refundRes.data ?? []) as ShoeRefund[])
    setLoadError(failed.length > 0 ? `Nicht alle Freigaben konnten geladen werden (${failed.join(', ')}). Bitte Seite neu laden.` : '')
    // Budget-Kontext pro Benutzer laden (Jahresbudget + bereits verbraucht)
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

  async function approve(order: PendingOrder) {
    if (processing) return
    setProcessing(order.id)
    setError('')
    const { error: err } = await supabase.from('orders').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', order.id)
    setProcessing(null)
    if (err) {
      setError('Freigabe konnte nicht gespeichert werden. Bitte erneut versuchen.')
      return
    }
    logAudit('Bestellung genehmigt', order.profiles?.name ?? '?')
    load()
  }

  async function reject(id: string, reason: string) {
    if (!reason.trim() || processing) return
    setProcessing(id)
    setError('')
    const { error: err } = await supabase.from('orders').update({ status: 'cancelled', cancel_reason: reason, updated_at: new Date().toISOString() }).eq('id', id)
    setProcessing(null)
    if (err) {
      setError('Ablehnung konnte nicht gespeichert werden. Bitte erneut versuchen.')
      return
    }
    logAudit('Bestellung abgelehnt', orders.find(o => o.id === id)?.profiles?.name ?? '?')
    setCancelReason(null)
    load()
  }

  async function approveStockOrder(id: string) {
    if (processing) return
    setProcessing(id)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('stock_orders').update({
      status: 'approved',
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setProcessing(null)
    if (err) {
      setError('Freigabe konnte nicht gespeichert werden. Bitte erneut versuchen.')
      return
    }
    logAudit('Lagerbestellung genehmigt', stockOrders.find(o => o.id === id)?.products?.name ?? '?')
    load()
  }

  async function rejectStockOrder(id: string, reason: string) {
    if (!reason.trim() || processing) return
    setProcessing(id)
    setError('')
    const { error: err } = await supabase.from('stock_orders').update({
      status: 'rejected',
      note: reason,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setProcessing(null)
    if (err) {
      setError('Ablehnung konnte nicht gespeichert werden. Bitte erneut versuchen.')
      return
    }
    logAudit('Lagerbestellung abgelehnt', stockOrders.find(o => o.id === id)?.products?.name ?? '?')
    setCancelReason(null)
    load()
  }

  async function reviewPersonalEm(item: PersonalEmWithRequester, approved: boolean, note: string) {
    if (!approved && !note.trim()) return
    if (processing) return
    setProcessing(item.id)
    setError('')
    const { error: err } = await supabase.rpc('review_personal_einsatzmittel_request', { p_request_id: item.id, p_approved: approved, p_note: note.trim() || null })
    setProcessing(null)
    if (err) { setError(err.message || 'Prüfung konnte nicht gespeichert werden.'); return }
    logAudit(approved ? 'Einsatzmittel-Meldung bestätigt' : 'Einsatzmittel-Meldung abgelehnt', `${PERSONAL_EM_CATEGORY_LABELS[item.category]} · ${officerDisplayName(item.requester)}`)
    setCancelReason(null)
    load()
  }

  async function reviewPoolEm(item: PoolEmWithRequester, approve: boolean, note: string) {
    if (!approve && !note.trim()) return
    if (processing) return
    setProcessing(item.id)
    setError('')
    const { error: err } = await supabase.rpc('decide_pool_einsatzmittel_request', { p_request_id: item.id, p_approve: approve, p_note: note.trim() || null })
    setProcessing(null)
    if (err) { setError(err.message || 'Entscheidung fehlgeschlagen.'); return }
    logAudit(approve ? 'Beschaffungsantrag genehmigt' : 'Beschaffungsantrag abgelehnt', `${POOL_EM_CATEGORY_LABELS[item.category]} · ${item.anzahl} · ${officerDisplayName(item.requester)}`)
    setCancelReason(null)
    load()
  }

  async function reviewShoeRefund(refund: ShoeRefund, status: 'approved' | 'rejected') {
    if (processing) return
    setProcessing(refund.id)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const payload: { status: 'approved' | 'rejected'; reviewed_by: string | null; reviewed_at: string; approved_amount?: number } = {
      status,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    }
    if (status === 'approved') {
      // Genehmigten Betrag zum Zeitpunkt der Genehmigung anhand des aktuellen Caps berechnen (wie ShoeRefunds.tsx)
      const cap = await getCurrentShoeRefundCap()
      payload.approved_amount = Math.min(Number(refund.amount), cap)
    }
    // Die shoe_refunds-UPDATE-Policy prüft (anders als die RPC-gestützten Warteschlangen)
    // den Status nicht selbst - ohne .eq('status', 'pending') könnte eine zweite,
    // zeitgleiche Entscheidung eine bereits final abgeschlossene stillschweigend
    // überschreiben. select() + maybeSingle() macht sichtbar, ob wirklich eine Zeile
    // betroffen war.
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

  function openCancelReason(id: string, type: 'order' | 'stock' | 'personal' | 'pool') {
    setError('')
    setCancelReason({ id, reason: '', type })
  }

  function openAssignmentReview(kind: AssignmentKind, item: TrainingAssignmentWithOfficer | SchulungAssignmentWithOfficer) {
    setReviewingAssignment({ kind, item })
    // Bei einer Selbstanmeldung über die Ausschreibung ist der Termin schon
    // festgelegt (session_id ist gesetzt) - der Genehmiger bestätigt/lehnt dann
    // nur noch ab, statt selbst einen Termin wählen zu müssen. Vorauswählen,
    // bleibt aber änderbar.
    setReviewSessionId(item.session_id ?? '')
    setReviewNote('')
    setError('')
  }

  async function reviewAssignment(approve: boolean) {
    if (!reviewingAssignment) return
    if (approve && !reviewSessionId) { setError('Bitte einen Termin für die Einteilung wählen.'); return }
    const { kind, item } = reviewingAssignment
    setProcessing(item.id)
    setError('')
    const rpcName = kind === 'training' ? 'decide_training_assignment' : 'decide_schulung_assignment'
    const modules = kind === 'training' ? trainingModules : schulungModules
    const moduleName = modules.find(m => m.id === item.module_id)?.name ?? item.module_id
    const { error: err } = await supabase.rpc(rpcName, { p_assignment_id: item.id, p_approve: approve, p_session_id: approve ? reviewSessionId : null, p_note: reviewNote.trim() || null })
    setProcessing(null)
    if (err) { setError(err.message || 'Entscheidung fehlgeschlagen.'); return }
    logAudit(
      approve ? `${kind === 'training' ? 'Trainingsvorschlag' : 'Schulungsvorschlag'} genehmigt` : `${kind === 'training' ? 'Trainingsvorschlag' : 'Schulungsvorschlag'} abgelehnt`,
      `${officerDisplayName(item.officer)} · ${moduleName}`,
    )
    setReviewingAssignment(null)
    load()
  }

  const byUser = orders.reduce<Record<string, PendingOrder[]>>((acc, o) => {
    const key = o.user_id
    if (!acc[key]) acc[key] = []
    acc[key].push(o)
    return acc
  }, {})

  const assignmentSessions = reviewingAssignment
    ? (reviewingAssignment.kind === 'training' ? trainingSessions : schulungSessions).filter(s => s.module_id === reviewingAssignment.item.module_id)
    : []
  const assignmentModuleName = reviewingAssignment
    ? (reviewingAssignment.kind === 'training' ? trainingModules : schulungModules).find(m => m.id === reviewingAssignment.item.module_id)?.name ?? reviewingAssignment.item.module_id
    : ''

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Genehmigungen</h1>
        <p className="text-gray-500 text-sm mt-1">Alles, was auf eine Entscheidung wartet – an einem Ort.</p>
      </div>

      {loadError && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{loadError}</div>}
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <>
          {/* ── Budgetüberschreitungen ── */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> Budgetüberschreitungen</h2>
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
                                {o.products?.category} · Gr. {o.size} · {o.quantity}× · {o.quarters?.name}
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

          {/* ── Lagerbestellungen ── */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2"><Package className="w-4 h-4" /> Lagerbestellungen</h2>
            {stockOrders.length === 0 ? (
              <Empty icon={Package} title="Keine offenen Lagerbestellungen" />
            ) : (
              <Table
                head={['Artikel', 'Gr. / Anz.', 'Angefordert von', 'Notiz', 'Status', '']}
                rows={stockOrders.map(o => [
                  <div key="art"><p className="font-medium text-gray-900">{o.products?.name ?? '–'}</p><p className="text-xs text-gray-400">{o.products?.article_number} · {o.products?.category}</p></div>,
                  `${o.size} · ${o.quantity}×`,
                  o.requester?.name ?? '–',
                  o.note ?? '–',
                  <span key="st" className={`text-xs font-medium px-2.5 py-1 rounded-full ${STOCK_ORDER_STATUS_COLORS[o.status]}`}>{STOCK_ORDER_STATUS_LABELS[o.status]}</span>,
                  <Actions key="ac" disabled={processing === o.id} onApprove={() => approveStockOrder(o.id)} onReject={() => openCancelReason(o.id, 'stock')} />,
                ])}
              />
            )}
          </div>

          {/* ── Schuherstattungen ── */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Footprints className="w-4 h-4" /> Schuherstattungen
              {shoeRefundCap != null && <span className="normal-case font-normal text-gray-400">· Maximalbetrag {fmtEUR(shoeRefundCap)}</span>}
            </h2>
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

          {/* ── Personal-Einsatzmittel-Meldungen ── */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> Einsatzmittel-Meldungen (persönlich)</h2>
            {personalEm.length === 0 ? (
              <Empty icon={Shield} title="Keine offenen Einsatzmittel-Meldungen" />
            ) : (
              <Table
                head={['Kategorie', 'Details', 'Verwahrungsort', 'Gemeldet von', '']}
                rows={personalEm.map(item => [
                  PERSONAL_EM_CATEGORY_LABELS[item.category],
                  personalEmDetailText(item) || '–',
                  item.verwahrungsort ? (VERWAHRUNGSORT_LABELS[item.verwahrungsort as keyof typeof VERWAHRUNGSORT_LABELS] ?? item.verwahrungsort) : '–',
                  officerDisplayName(item.requester),
                  <Actions key="ac" disabled={processing === item.id}
                    onApprove={() => void reviewPersonalEm(item, true, '')}
                    onReject={() => openCancelReason(item.id, 'personal')} />,
                ])}
              />
            )}
          </div>

          {/* ── Pool-Einsatzmittel-Beschaffung ── */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> Beschaffungsanträge (Pool-Einsatzmittel)</h2>
            {poolEm.length === 0 ? (
              <Empty icon={Shield} title="Keine offenen Beschaffungsanträge" />
            ) : (
              <Table
                head={['Kategorie', 'Anzahl', 'Verwahrungsort', 'Begründung', 'Beantragt von', '']}
                rows={poolEm.map(item => [
                  POOL_EM_CATEGORY_LABELS[item.category],
                  String(item.anzahl),
                  VERWAHRUNGSORT_LABELS[item.verwahrungsort as keyof typeof VERWAHRUNGSORT_LABELS] ?? item.verwahrungsort,
                  item.begruendung,
                  officerDisplayName(item.requester),
                  <Actions key="ac" disabled={processing === item.id}
                    onApprove={() => void reviewPoolEm(item, true, '')}
                    onReject={() => openCancelReason(item.id, 'pool')} />,
                ])}
              />
            )}
          </div>

          {/* ── Trainings-Zuteilungsvorschläge ── */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2"><GraduationCap className="w-4 h-4" /> Trainings-Zuteilungsvorschläge</h2>
            {trainingAssignments.length === 0 ? (
              <Empty icon={GraduationCap} title="Keine offenen Trainingsvorschläge" />
            ) : (
              <Table
                head={['Modul', 'Beamter/in', 'Vorgeschlagen', '']}
                rows={trainingAssignments.map(item => [
                  trainingModules.find(m => m.id === item.module_id)?.name ?? item.module_id,
                  officerDisplayName(item.officer),
                  new Date(item.proposed_at).toLocaleDateString('de-AT'),
                  <div key="ac" className="flex justify-end"><button type="button" onClick={() => openAssignmentReview('training', item)} className="text-xs font-semibold text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg">Prüfen</button></div>,
                ])}
              />
            )}
          </div>

          {/* ── Schulungs-Zuteilungsvorschläge ── */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2"><GraduationCap className="w-4 h-4" /> Schulungs-Zuteilungsvorschläge</h2>
            {schulungAssignments.length === 0 ? (
              <Empty icon={GraduationCap} title="Keine offenen Schulungsvorschläge" />
            ) : (
              <Table
                head={['Modul', 'Beamter/in', 'Vorgeschlagen', '']}
                rows={schulungAssignments.map(item => [
                  schulungModules.find(m => m.id === item.module_id)?.name ?? item.module_id,
                  officerDisplayName(item.officer),
                  new Date(item.proposed_at).toLocaleDateString('de-AT'),
                  <div key="ac" className="flex justify-end"><button type="button" onClick={() => openAssignmentReview('schulung', item)} className="text-xs font-semibold text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg">Prüfen</button></div>,
                ])}
              />
            )}
          </div>
        </>
      )}

      {cancelReason && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">
                {cancelReason.type === 'stock' ? 'Lagerbestellung ablehnen'
                  : cancelReason.type === 'personal' ? 'Einsatzmittel-Meldung ablehnen'
                  : cancelReason.type === 'pool' ? 'Beschaffungsantrag ablehnen'
                  : 'Bestellung ablehnen'}
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
                  else if (cancelReason.type === 'personal') { const item = personalEm.find(p => p.id === cancelReason.id); if (item) void reviewPersonalEm(item, false, cancelReason.reason) }
                  else if (cancelReason.type === 'pool') { const item = poolEm.find(p => p.id === cancelReason.id); if (item) void reviewPoolEm(item, false, cancelReason.reason) }
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

      {reviewingAssignment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{reviewingAssignment.kind === 'training' ? 'Trainingsvorschlag' : 'Schulungsvorschlag'} prüfen</h2>
              <p className="text-sm text-gray-500 mt-0.5">{officerDisplayName(reviewingAssignment.item.officer)} · {assignmentModuleName}</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              <label className="block text-xs font-medium text-gray-600">Termin für die Einteilung (bei Genehmigung erforderlich)
                <select className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={reviewSessionId} onChange={e => setReviewSessionId(e.target.value)}>
                  <option value="">– Termin wählen –</option>
                  {assignmentSessions.map(s => <option key={s.id} value={s.id}>{new Date(s.session_date).toLocaleDateString('de-AT')}{s.note ? ` · ${s.note}` : ''}</option>)}
                </select>
                {assignmentSessions.length === 0 ? <span className="text-xs text-amber-700 mt-1 block">Für dieses Modul ist aktuell kein angekündigter Termin vorhanden.</span> : null}
              </label>
              <label className="block text-xs font-medium text-gray-600">Bemerkung (optional)
                <textarea rows={2} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" value={reviewNote} onChange={e => setReviewNote(e.target.value)} />
              </label>
              {error && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setReviewingAssignment(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={() => void reviewAssignment(false)} disabled={processing === reviewingAssignment.item.id} className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">Ablehnen</button>
              <button onClick={() => void reviewAssignment(true)} disabled={processing === reviewingAssignment.item.id || !reviewSessionId} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">Genehmigen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Empty({ icon: Icon, title, subtitle }: { icon: typeof CheckCircle; title: string; subtitle?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-center">
      <Icon className="w-12 h-12 mb-3 text-gray-300" />
      <p className="font-semibold text-gray-500">{title}</p>
      {subtitle ? <p className="text-sm text-gray-400 mt-1">{subtitle}</p> : null}
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {head.map((label, i) => <th key={i} className={`text-left px-5 py-3 font-semibold text-gray-600 ${i === head.length - 1 ? 'text-right' : ''}`}>{label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((cells, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {cells.map((cell, j) => <td key={j} className="px-5 py-4 text-gray-700 align-top">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Actions({ disabled, onApprove, onReject }: { disabled: boolean; onApprove: () => void; onReject: () => void }) {
  return (
    <div className="flex items-center gap-2 justify-end">
      <button onClick={onApprove} disabled={disabled}
        className="flex items-center gap-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
        <CheckCircle className="w-3.5 h-3.5" /> Freigeben
      </button>
      <button onClick={onReject} disabled={disabled}
        className="flex items-center gap-1.5 text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
        <XCircle className="w-3.5 h-3.5" /> Ablehnen
      </button>
    </div>
  )
}
