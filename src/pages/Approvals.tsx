import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, User, Package, Shield, ShoppingBag, GraduationCap } from 'lucide-react'
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
  StockOrder,
} from '../lib/types'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, STOCK_ORDER_STATUS_COLORS, STOCK_ORDER_STATUS_LABELS } from '../lib/types'
import { getCurrentBudget, getUsedBudget } from '../lib/budget'
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
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState<{ id: string; reason: string; type: 'order' | 'stock' | 'personal' | 'pool' } | null>(null)
  const [reviewingAssignment, setReviewingAssignment] = useState<{ kind: AssignmentKind; item: TrainingAssignmentWithOfficer | SchulungAssignmentWithOfficer } | null>(null)
  const [reviewSessionId, setReviewSessionId] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [ordersRes, stockRes, personalRes, poolRes, tModRes, tSessRes, tAssignRes, sModRes, sSessRes, sAssignRes] = await Promise.all([
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
    ])
    const pending = (ordersRes.data ?? []) as PendingOrder[]
    setOrders(pending)
    setStockOrders((stockRes.data ?? []) as StockOrder[])
    setPersonalEm((personalRes.data ?? []) as PersonalEmWithRequester[])
    setPoolEm((poolRes.data ?? []) as PoolEmWithRequester[])
    setTrainingModules((tModRes.data ?? []) as EinsatzTrainingModule[])
    setTrainingSessions((tSessRes.data ?? []) as EinsatzTrainingSession[])
    setTrainingAssignments((tAssignRes.data ?? []) as TrainingAssignmentWithOfficer[])
    setSchulungModules((sModRes.data ?? []) as SchulungModule[])
    setSchulungSessions((sSessRes.data ?? []) as SchulungSession[])
    setSchulungAssignments((sAssignRes.data ?? []) as SchulungAssignmentWithOfficer[])
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

  useEffect(() => { load().catch(() => setError('Freigaben konnten nicht geladen werden.')) }, [load])

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
                              <button onClick={() => setCancelReason({ id: o.id, reason: '', type: 'order' })} disabled={processing === o.id}
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
                  <Actions key="ac" disabled={processing === o.id} onApprove={() => approveStockOrder(o.id)} onReject={() => setCancelReason({ id: o.id, reason: '', type: 'stock' })} />,
                ])}
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
                    onReject={() => setCancelReason({ id: item.id, reason: '', type: 'personal' })} />,
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
                    onReject={() => setCancelReason({ id: item.id, reason: '', type: 'pool' })} />,
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
                  {assignmentSessions.map(s => <option key={s.id} value={s.id}>{new Date(s.session_date).toLocaleDateString('de-AT')}</option>)}
                </select>
                {assignmentSessions.length === 0 ? <span className="text-xs text-amber-700 mt-1 block">Für dieses Modul ist aktuell kein angekündigter Termin vorhanden.</span> : null}
              </label>
              <label className="block text-xs font-medium text-gray-600">Bemerkung (optional)
                <textarea rows={2} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" value={reviewNote} onChange={e => setReviewNote(e.target.value)} />
              </label>
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
