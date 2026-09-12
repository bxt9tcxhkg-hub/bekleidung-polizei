import { useCallback, useEffect, useState } from 'react'
import { Check, Plus, X, XCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import type { PoolEinsatzmittelRequest } from '../../lib/types'
import {
  POOL_EM_CATEGORIES,
  POOL_EM_CATEGORY_LABELS,
  VERWAHRUNGSORTE,
  VERWAHRUNGSORT_LABELS,
  canPurchasePoolEinsatzmittel,
  isVerwahrungsort,
  type PoolEmCategory,
} from '../../lib/poolEinsatzmittel'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const STATUS_LABELS = {
  pending: 'Offen',
  approved: 'Genehmigt',
  rejected: 'Abgelehnt',
  withdrawn: 'Zurückgezogen',
}

const STATUS_COLORS = {
  pending: 'bg-amber-50 text-amber-800',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-600',
}

type RequestWithProfile = PoolEinsatzmittelRequest & {
  requester?: { id: string; name: string | null; dienstnummer: string | null; username: string } | null
}

export default function PoolEinsatzmittelRequestsPanel({ canManage }: { canManage: boolean }) {
  const { profile, isStrictAdmin, isGenehmiger } = useAuth()
  const canPurchase = canPurchasePoolEinsatzmittel({ isStrictAdmin, isGenehmiger })
  const [requests, setRequests] = useState<RequestWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [category, setCategory] = useState<PoolEmCategory>('schild')
  const [verwahrungsort, setVerwahrungsort] = useState('')
  const [anzahl, setAnzahl] = useState('')
  const [begruendung, setBegruendung] = useState('')
  const [saving, setSaving] = useState(false)
  const [reviewing, setReviewing] = useState<RequestWithProfile | null>(null)
  const [reviewNote, setReviewNote] = useState('')

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('pool_einsatzmittel_requests')
      .select('*, requester:profiles!requested_by(id,name,dienstnummer,username)')
      .order('created_at', { ascending: false })
    if (loadError) {
      setError('Beschaffungsanträge konnten nicht geladen werden.')
      setRequests([])
    } else {
      setError('')
      setRequests((data ?? []) as RequestWithProfile[])
    }
    setLoading(false)
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  function openNew() {
    setCategory('schild')
    setVerwahrungsort('')
    setAnzahl('')
    setBegruendung('')
    setError('')
    setNotice('')
    setShowForm(true)
  }

  async function save() {
    if (!profile?.id) return
    const anzahlNum = Number(anzahl)
    if (!isVerwahrungsort(verwahrungsort)) {
      setError('Bitte einen Verwahrungsort wählen.')
      return
    }
    if (!Number.isInteger(anzahlNum) || anzahlNum <= 0) {
      setError('Bitte eine gültige Anzahl (mindestens 1) angeben.')
      return
    }
    if (!begruendung.trim()) {
      setError('Bitte eine Begründung angeben.')
      return
    }
    setSaving(true)
    setError('')
    const { error: insertError } = await supabase.from('pool_einsatzmittel_requests').insert({
      requested_by: profile.id,
      category,
      verwahrungsort,
      anzahl: anzahlNum,
      begruendung: begruendung.trim(),
    })
    setSaving(false)
    if (insertError) {
      setError(insertError.message || 'Antrag konnte nicht angelegt werden.')
      return
    }
    logAudit('Beschaffungsantrag gestellt', `${POOL_EM_CATEGORY_LABELS[category]} · ${anzahlNum}`)
    setShowForm(false)
    setNotice('Beschaffungsantrag wurde dem Genehmiger vorgelegt.')
    await load()
  }

  async function withdraw(row: RequestWithProfile) {
    if (!window.confirm('Diesen offenen Beschaffungsantrag zurückziehen?')) return
    const { error: updateError } = await supabase
      .from('pool_einsatzmittel_requests')
      .update({ status: 'withdrawn' })
      .eq('id', row.id)
      .eq('status', 'pending')
    if (updateError) {
      setError('Antrag konnte nicht zurückgezogen werden.')
      return
    }
    logAudit('Beschaffungsantrag zurückgezogen', `${POOL_EM_CATEGORY_LABELS[row.category]} · ${row.anzahl}`)
    await load()
  }

  async function review(approve: boolean) {
    if (!reviewing) return
    if (!approve && !reviewNote.trim()) {
      setError('Bitte einen Ablehnungsgrund eintragen.')
      return
    }
    setSaving(true)
    const { error: rpcError } = await supabase.rpc('decide_pool_einsatzmittel_request', {
      p_request_id: reviewing.id,
      p_approve: approve,
      p_note: reviewNote.trim() || null,
    })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message || 'Entscheidung fehlgeschlagen.')
      return
    }
    logAudit(
      approve ? 'Beschaffungsantrag genehmigt' : 'Beschaffungsantrag abgelehnt',
      `${POOL_EM_CATEGORY_LABELS[reviewing.category]} · ${reviewing.anzahl} · ${requesterLabel(reviewing)}`,
    )
    setReviewing(null)
    setReviewNote('')
    setNotice(approve ? 'Antrag genehmigt und im Pool-Bestand angelegt.' : 'Antrag wurde abgelehnt.')
    await load()
  }

  const visible = canManage ? requests : requests.filter(row => row.requested_by === profile?.id)

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Beschaffung</h2>
          <p className="text-sm text-gray-500 mt-1">
            {canPurchase
              ? 'Anträge auf neue Pool-Einsatzmittel prüfen und entscheiden.'
              : 'Bedarf an neuen Pool-Einsatzmitteln melden; der Genehmiger entscheidet.'}
          </p>
        </div>
        {canManage && !canPurchase && (
          <button type="button" onClick={openNew} className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-xl">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Beschaffung beantragen</span>
          </button>
        )}
      </div>

      {error && !showForm && !reviewing ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
      {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-center">
          <p className="font-medium text-gray-600">Keine Beschaffungsanträge</p>
          <p className="text-sm text-gray-400 mt-1">
            {canPurchase ? 'Aktuell liegen keine Anträge vor.' : 'Noch keine Anträge gestellt.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(row => (
            <article key={row.id} className="bg-white rounded-xl border border-gray-200 px-4 py-4">
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{POOL_EM_CATEGORY_LABELS[row.category]} · {row.anzahl}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[row.status]}`}>
                      {STATUS_LABELS[row.status]}
                    </span>
                  </div>
                  {canManage ? <p className="text-sm text-gray-700 mt-1">{requesterLabel(row)}</p> : null}
                  <p className="text-sm text-gray-500 mt-1">{VERWAHRUNGSORT_LABELS[row.verwahrungsort]} · {row.begruendung}</p>
                  {row.review_note ? (
                    <p className={`text-sm mt-2 ${row.status === 'rejected' ? 'text-red-700' : 'text-gray-600'}`}>
                      Bemerkung: {row.review_note}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                  {canPurchase && row.status === 'pending' ? (
                    <button type="button" onClick={() => { setReviewing(row); setReviewNote(''); setError('') }} className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg">
                      <Check className="w-4 h-4" /> Prüfen
                    </button>
                  ) : row.status === 'pending' && row.requested_by === profile?.id ? (
                    <button type="button" onClick={() => { void withdraw(row) }} className="text-sm font-medium text-red-700 px-3 py-2 rounded-lg hover:bg-red-50">
                      Zurückziehen
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-bold text-gray-900">Beschaffung beantragen</h2>
                <p className="text-xs text-gray-500 mt-0.5">Wird erst nach Genehmigung im Pool-Bestand angelegt.</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <label className="block text-xs font-medium text-gray-600">
                Kategorie *
                <select className={`${inputClass} mt-1`} value={category} onChange={event => setCategory(event.target.value as PoolEmCategory)}>
                  {POOL_EM_CATEGORIES.map(id => <option key={id} value={id}>{POOL_EM_CATEGORY_LABELS[id]}</option>)}
                </select>
              </label>
              <label className="block text-xs font-medium text-gray-600">
                Verwahrungsort *
                <select className={`${inputClass} mt-1`} value={verwahrungsort} onChange={event => setVerwahrungsort(event.target.value)}>
                  <option value="">Bitte wählen</option>
                  {VERWAHRUNGSORTE.map(ort => <option key={ort} value={ort}>{VERWAHRUNGSORT_LABELS[ort]}</option>)}
                </select>
              </label>
              <label className="block text-xs font-medium text-gray-600">
                Anzahl *
                <input className={`${inputClass} mt-1`} type="number" min={1} step={1} inputMode="numeric" value={anzahl} onChange={event => setAnzahl(event.target.value)} />
              </label>
              <label className="block text-xs font-medium text-gray-600">
                Begründung *
                <textarea className={`${inputClass} mt-1 min-h-24 resize-y`} maxLength={500} value={begruendung} onChange={event => setBegruendung(event.target.value)} />
              </label>
              {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm">Abbrechen</button>
              <button type="button" disabled={saving} onClick={() => { void save() }} className="flex-1 flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
                {saving ? 'Speichern…' : 'Beantragen'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reviewing ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div><h2 className="font-bold text-gray-900">Beschaffungsantrag prüfen</h2><p className="text-sm text-gray-500 mt-0.5">{requesterLabel(reviewing)}</p></div>
              <button type="button" onClick={() => setReviewing(null)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><XCircle className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="font-semibold text-gray-900">{POOL_EM_CATEGORY_LABELS[reviewing.category]} · {reviewing.anzahl}</p>
                <p className="text-sm text-gray-600 mt-1">{VERWAHRUNGSORT_LABELS[reviewing.verwahrungsort]}</p>
                <p className="text-sm text-gray-600 mt-1">{reviewing.begruendung}</p>
              </div>
              <label className="block text-xs font-medium text-gray-600">
                Bemerkung / Ablehnungsgrund
                <textarea className={`${inputClass} mt-1 min-h-24 resize-y`} maxLength={500} value={reviewNote} onChange={event => setReviewNote(event.target.value)} />
              </label>
              {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3 px-6 py-4 border-t">
              <button type="button" disabled={saving} onClick={() => { void review(false) }} className="flex-1 flex items-center justify-center gap-2 border border-red-200 text-red-700 font-medium py-2.5 rounded-lg text-sm hover:bg-red-50">
                <XCircle className="w-4 h-4" /> Ablehnen
              </button>
              <button type="button" disabled={saving} onClick={() => { void review(true) }} className="flex-1 flex items-center justify-center gap-2 bg-green-700 hover:bg-green-800 text-white font-medium py-2.5 rounded-lg text-sm">
                <Check className="w-4 h-4" /> Genehmigen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function requesterLabel(row: RequestWithProfile): string {
  const requester = row.requester
  if (!requester) return 'Unbekannter Benutzer'
  const name = requester.name?.trim() || requester.username
  return requester.dienstnummer ? `${name} · DNr. ${requester.dienstnummer}` : name
}
