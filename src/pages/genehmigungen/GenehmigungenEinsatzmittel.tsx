import { useCallback, useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { PersonalEinsatzmittelRequest, PoolEinsatzmittelRequest } from '../../lib/types'
import { logAudit } from '../../lib/audit'
import { PERSONAL_EM_CATEGORY_LABELS, officerDisplayName, personalEmDetailText } from '../../lib/personalEinsatzmittel'
import { POOL_EM_CATEGORY_LABELS } from '../../lib/poolEinsatzmittel'
import { VERWAHRUNGSORT_LABELS } from '../../lib/verwahrungsort'
import { Empty, GenehmigungenBereichHeader, Table } from '../../components/genehmigungenShared'

type ProfileMini = { id: string; name: string | null; dienstnummer: string | null; username: string }
type PersonalEmWithRequester = PersonalEinsatzmittelRequest & { requester?: ProfileMini | null }
type PoolEmWithRequester = PoolEinsatzmittelRequest & { requester?: ProfileMini | null }

// Bereichsseite "Einsatzmittel" (persönliche Meldungen + Pool-Beschaffung) -
// eine der vier gleich behandelten Genehmigungen-Bereichsseiten (siehe
// GenehmigungenUebersicht.tsx). Inhaltlich unverändert gegenüber der
// vormaligen Einsatzmittel-Sektion in Approvals.tsx, nur auf eine eigene
// Seite ausgelagert.
export default function GenehmigungenEinsatzmittel() {
  const [personalEm, setPersonalEm] = useState<PersonalEmWithRequester[]>([])
  const [poolEm, setPoolEm] = useState<PoolEmWithRequester[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  // Ein Dialog für Genehmigen UND Ablehnen (wie die Fachseiten), statt zwei
  // getrennter Ein-Klick-Buttons - sonst gäbe es beim Genehmigen keine
  // Möglichkeit, eine Bemerkung zu hinterlegen, und die RPCs lehnen eine
  // zweite Entscheidung ab, sobald der Status nicht mehr "pending" ist.
  const [reviewingEm, setReviewingEm] = useState<{ kind: 'personal' | 'pool'; item: PersonalEmWithRequester | PoolEmWithRequester } | null>(null)
  const [emReviewNote, setEmReviewNote] = useState('')
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [personalRes, poolRes] = await Promise.all([
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
    ])
    const failed: string[] = []
    if (personalRes.error) failed.push('Einsatzmittel-Meldungen (persönlich)')
    else setPersonalEm((personalRes.data ?? []) as PersonalEmWithRequester[])
    if (poolRes.error) failed.push('Beschaffungsanträge (Pool-Einsatzmittel)')
    else setPoolEm((poolRes.data ?? []) as PoolEmWithRequester[])
    setLoadError(failed.length > 0 ? `Nicht alles konnte geladen werden (${failed.join(', ')}). Bitte Seite neu laden.` : '')
    setLoading(false)
  }, [])

  useEffect(() => { load().catch(() => setLoadError('Freigaben konnten nicht geladen werden.')) }, [load])

  async function reviewPersonalEm(item: PersonalEmWithRequester, approved: boolean, note: string) {
    if (!approved && !note.trim()) return
    if (processing) return
    setProcessing(item.id)
    setError('')
    const { error: err } = await supabase.rpc('review_personal_einsatzmittel_request', { p_request_id: item.id, p_approved: approved, p_note: note.trim() || null })
    setProcessing(null)
    if (err) { setError(err.message || 'Prüfung konnte nicht gespeichert werden.'); return }
    logAudit(approved ? 'Einsatzmittel-Meldung bestätigt' : 'Einsatzmittel-Meldung abgelehnt', `${PERSONAL_EM_CATEGORY_LABELS[item.category]} · ${officerDisplayName(item.requester)}`)
    setReviewingEm(null)
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
    setReviewingEm(null)
    load()
  }

  function openEmReview(kind: 'personal' | 'pool', item: PersonalEmWithRequester | PoolEmWithRequester) {
    setReviewingEm({ kind, item })
    setEmReviewNote('')
    setError('')
  }

  async function decideEmReview(approve: boolean) {
    if (!reviewingEm) return
    if (!approve && !emReviewNote.trim()) { setError('Bitte einen Ablehnungsgrund eintragen.'); return }
    const { kind, item } = reviewingEm
    if (kind === 'personal') await reviewPersonalEm(item as PersonalEmWithRequester, approve, emReviewNote)
    else await reviewPoolEm(item as PoolEmWithRequester, approve, emReviewNote)
  }

  const emReviewCategoryLabel = reviewingEm
    ? reviewingEm.kind === 'personal'
      ? PERSONAL_EM_CATEGORY_LABELS[(reviewingEm.item as PersonalEmWithRequester).category]
      : POOL_EM_CATEGORY_LABELS[(reviewingEm.item as PoolEmWithRequester).category]
    : ''
  // Hat derselbe Beamte mehrere offene Meldungen/Anträge in derselben Kategorie,
  // reicht "Offizier · Kategorie" allein nicht, um sie auseinanderzuhalten - vor
  // allem am Handy, wo die Tabelle dahinter vom Dialog verdeckt ist. Genehmigen/
  // Ablehnen wirken auf eine konkrete ID, der Genehmiger muss also sehen können,
  // welche der (ggf. identisch aussehenden) Zeilen er gerade entscheidet.
  const emReviewDetailLines: string[] = reviewingEm
    ? reviewingEm.kind === 'personal'
      ? (() => {
          const item = reviewingEm.item as PersonalEmWithRequester
          const lines: string[] = []
          const detail = personalEmDetailText(item)
          if (detail) lines.push(detail)
          if (item.verwahrungsort) lines.push(`Verwahrungsort: ${VERWAHRUNGSORT_LABELS[item.verwahrungsort as keyof typeof VERWAHRUNGSORT_LABELS] ?? item.verwahrungsort}`)
          return lines
        })()
      : (() => {
          const item = reviewingEm.item as PoolEmWithRequester
          const lines = [
            `Anzahl: ${item.anzahl}`,
            `Verwahrungsort: ${VERWAHRUNGSORT_LABELS[item.verwahrungsort as keyof typeof VERWAHRUNGSORT_LABELS] ?? item.verwahrungsort}`,
          ]
          if (item.begruendung) lines.push(`Begründung: ${item.begruendung}`)
          return lines
        })()
    : []

  return (
    <div>
      <GenehmigungenBereichHeader title="Einsatzmittel" description="Persönliche Meldungen und Pool-Beschaffungsanträge entscheiden." />

      {loadError && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{loadError}</div>}
      {error && !reviewingEm && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="space-y-8">
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
                  <div key="ac" className="flex justify-end"><button type="button" onClick={() => openEmReview('personal', item)} className="text-xs font-semibold text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg">Prüfen</button></div>,
                ])}
              />
            )}
          </div>

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
                  <div key="ac" className="flex justify-end"><button type="button" onClick={() => openEmReview('pool', item)} className="text-xs font-semibold text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg">Prüfen</button></div>,
                ])}
              />
            )}
          </div>
        </div>
      )}

      {reviewingEm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{reviewingEm.kind === 'personal' ? 'Einsatzmittel-Meldung' : 'Beschaffungsantrag'} prüfen</h2>
              <p className="text-sm text-gray-500 mt-0.5">{officerDisplayName(reviewingEm.item.requester)} · {emReviewCategoryLabel}</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              {emReviewDetailLines.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 space-y-0.5">
                  {emReviewDetailLines.map((line, i) => <p key={i}>{line}</p>)}
                </div>
              )}
              <label className="block text-xs font-medium text-gray-600">Bemerkung (bei Ablehnung erforderlich)
                <textarea rows={3} maxLength={reviewingEm.kind === 'personal' ? 1000 : 500} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" value={emReviewNote} onChange={e => setEmReviewNote(e.target.value)} autoFocus />
              </label>
              {error && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setReviewingEm(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={() => void decideEmReview(false)} disabled={processing === reviewingEm.item.id} className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">Ablehnen</button>
              <button onClick={() => void decideEmReview(true)} disabled={processing === reviewingEm.item.id} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">Genehmigen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
