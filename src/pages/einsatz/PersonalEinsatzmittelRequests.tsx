import { useCallback, useEffect, useState } from 'react'
import { Check, Pencil, Plus, RotateCcw, Send, X, XCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import {
  PERSONAL_EM_CATEGORIES,
  PERSONAL_EM_CATEGORY_LABELS,
  PERSONAL_EM_FIELDS,
  emptyPersonalEmFormValues,
  formValuesFromRecord,
  formatIsoDate,
  personalEmDetailText,
  personalEmFieldKind,
  personalEmFieldLabel,
  validatePersonalEm,
  type PersonalEmCategory,
  type PersonalEmFormValues,
} from '../../lib/personalEinsatzmittel'
import { supabase } from '../../lib/supabase'
import type { PersonalEinsatzmittelRequest } from '../../lib/types'
import { VERWAHRUNGSORTE, VERWAHRUNGSORT_LABELS } from '../../lib/verwahrungsort'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const STATUS_LABELS = {
  pending: 'Zur Bestätigung',
  approved: 'Bestätigt',
  rejected: 'Abgelehnt',
  withdrawn: 'Zurückgezogen',
}

const STATUS_COLORS = {
  pending: 'bg-amber-50 text-amber-800',
  approved: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-600',
}

type RequestWithProfile = PersonalEinsatzmittelRequest & {
  requester?: { id: string; name: string | null; dienstnummer: string | null; username: string } | null
}

export default function PersonalEinsatzmittelRequestsPanel({
  canManage,
  onChanged,
}: {
  canManage: boolean
  onChanged?: () => void
}) {
  const { profile } = useAuth()
  const [requests, setRequests] = useState<RequestWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [category, setCategory] = useState<PersonalEmCategory>('schutzweste')
  const [verwahrungsort, setVerwahrungsort] = useState('')
  const [values, setValues] = useState<PersonalEmFormValues>(emptyPersonalEmFormValues())
  const [saving, setSaving] = useState(false)
  const [reviewing, setReviewing] = useState<RequestWithProfile | null>(null)
  const [reviewNote, setReviewNote] = useState('')

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    let query = supabase
      .from('personal_einsatzmittel_requests')
      .select('*, requester:profiles!requester_id(id,name,dienstnummer,username)')
      .order('created_at', { ascending: false })
    if (!canManage) query = query.eq('requester_id', profile.id)
    const { data, error: loadError } = await query
    if (loadError) {
      setError('Meldungen konnten nicht geladen werden.')
      setRequests([])
    } else {
      setError('')
      setRequests((data ?? []) as RequestWithProfile[])
    }
    setLoading(false)
  }, [canManage, profile])

  useEffect(() => {
    void load()
  }, [load])

  function openNew() {
    setEditId(null)
    setCategory('schutzweste')
    setVerwahrungsort('')
    setValues(emptyPersonalEmFormValues())
    setError('')
    setNotice('')
    setShowForm(true)
  }

  function openEdit(row: PersonalEinsatzmittelRequest) {
    if (row.status !== 'pending') return
    setEditId(row.id)
    setCategory(row.category)
    setVerwahrungsort(row.verwahrungsort ?? '')
    setValues(formValuesFromRecord(row))
    setError('')
    setNotice('')
    setShowForm(true)
  }

  async function save() {
    if (!profile?.id) return
    const result = validatePersonalEm({
      category,
      officer_id: profile.id,
      verwahrungsort,
      values,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    const { officer_id: _officerId, ...requestPayload } = result.payload
    void _officerId
    setSaving(true)
    const response = editId
      ? await supabase
        .from('personal_einsatzmittel_requests')
        .update(requestPayload)
        .eq('id', editId)
        .eq('status', 'pending')
      : await supabase
        .from('personal_einsatzmittel_requests')
        .insert({ ...requestPayload, requester_id: profile.id, status: 'pending' })
    setSaving(false)
    if (response.error) {
      setError(response.error.message || 'Meldung konnte nicht gespeichert werden.')
      return
    }
    logAudit(editId ? 'Einsatzmittel-Meldung bearbeitet' : 'Einsatzmittel-Meldung eingereicht', PERSONAL_EM_CATEGORY_LABELS[category])
    setShowForm(false)
    setNotice(editId ? 'Meldung wurde aktualisiert.' : 'Meldung wurde dem Sachbearbeiter zur Bestätigung vorgelegt.')
    await load()
    onChanged?.()
  }

  async function withdraw(row: PersonalEinsatzmittelRequest) {
    if (!window.confirm('Diese offene Meldung zurückziehen?')) return
    const { error: updateError } = await supabase
      .from('personal_einsatzmittel_requests')
      .update({ status: 'withdrawn' })
      .eq('id', row.id)
      .eq('status', 'pending')
    if (updateError) {
      setError('Meldung konnte nicht zurückgezogen werden.')
      return
    }
    logAudit('Einsatzmittel-Meldung zurückgezogen', PERSONAL_EM_CATEGORY_LABELS[row.category])
    await load()
    onChanged?.()
  }

  async function review(approved: boolean) {
    if (!reviewing) return
    if (!approved && !reviewNote.trim()) {
      setError('Bitte einen Ablehnungsgrund eintragen.')
      return
    }
    setSaving(true)
    const { error: reviewError } = await supabase.rpc('review_personal_einsatzmittel_request', {
      p_request_id: reviewing.id,
      p_approved: approved,
      p_note: reviewNote.trim() || null,
    })
    setSaving(false)
    if (reviewError) {
      setError(reviewError.message || 'Prüfung konnte nicht gespeichert werden.')
      return
    }
    logAudit(
      approved ? 'Einsatzmittel-Meldung bestätigt' : 'Einsatzmittel-Meldung abgelehnt',
      `${PERSONAL_EM_CATEGORY_LABELS[reviewing.category]} · ${requesterLabel(reviewing)}`,
    )
    setReviewing(null)
    setReviewNote('')
    setNotice(approved ? 'Meldung wurde bestätigt und in den Bestand übernommen.' : 'Meldung wurde abgelehnt.')
    await load()
    onChanged?.()
  }

  function resubmit(row: PersonalEinsatzmittelRequest) {
    setEditId(null)
    setCategory(row.category)
    setVerwahrungsort(row.verwahrungsort ?? '')
    setValues(formValuesFromRecord(row))
    setError('')
    setShowForm(true)
  }

  const visible = canManage ? requests.filter(row => row.status === 'pending') : requests

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {canManage ? 'Zur Bestätigung' : 'Meine Meldungen'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {canManage
              ? 'Benutzermeldungen prüfen und in den persönlichen Bestand übernehmen.'
              : 'Eigene Einsatzmittel erfassen und zur Bestätigung vorlegen.'}
          </p>
        </div>
        {!canManage ? (
          <button type="button" onClick={openNew} className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-xl">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Einsatzmittel erfassen</span>
          </button>
        ) : null}
      </div>

      {error && !showForm && !reviewing ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
      {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-center">
          <p className="font-medium text-gray-600">{canManage ? 'Keine offenen Meldungen' : 'Noch keine Meldungen'}</p>
          <p className="text-sm text-gray-400 mt-1">
            {canManage ? 'Alle Benutzermeldungen wurden bearbeitet.' : 'Erfassen Sie ein Einsatzmittel, das noch nicht in Ihrer Liste aufscheint.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(row => (
            <article key={row.id} className="bg-white rounded-xl border border-gray-200 px-4 py-4">
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{PERSONAL_EM_CATEGORY_LABELS[row.category]}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[row.status]}`}>
                      {STATUS_LABELS[row.status]}
                    </span>
                  </div>
                  {canManage ? <p className="text-sm text-gray-700 mt-1">{requesterLabel(row)}</p> : null}
                  <p className="text-sm text-gray-500 mt-1">{personalEmDetailText(row) || 'Keine zusätzlichen Angaben'}</p>
                  <p className="text-xs text-gray-400 mt-1">Gemeldet am {formatIsoDate(row.created_at)}</p>
                  {row.review_note ? (
                    <p className={`text-sm mt-2 ${row.status === 'rejected' ? 'text-red-700' : 'text-gray-600'}`}>
                      Bemerkung: {row.review_note}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                  {canManage ? (
                    <button type="button" onClick={() => { setReviewing(row); setReviewNote(''); setError('') }} className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg">
                      <Check className="w-4 h-4" /> Prüfen
                    </button>
                  ) : row.status === 'pending' ? (
                    <>
                      <button type="button" onClick={() => openEdit(row)} className="flex items-center gap-1.5 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-50">
                        <Pencil className="w-4 h-4" /> Bearbeiten
                      </button>
                      <button type="button" onClick={() => { void withdraw(row) }} className="text-sm font-medium text-red-700 px-3 py-2 rounded-lg hover:bg-red-50">
                        Zurückziehen
                      </button>
                    </>
                  ) : row.status === 'rejected' ? (
                    <button type="button" onClick={() => resubmit(row)} className="flex items-center gap-1.5 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-50">
                      <RotateCcw className="w-4 h-4" /> Korrigieren
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
                <h2 className="font-bold text-gray-900">{editId ? 'Meldung bearbeiten' : 'Einsatzmittel erfassen'}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Wird erst nach Bestätigung in den Bestand übernommen.</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <label className="block text-xs font-medium text-gray-600">
                Kategorie *
                <select className={`${inputClass} mt-1`} value={category} onChange={event => setCategory(event.target.value as PersonalEmCategory)}>
                  {PERSONAL_EM_CATEGORIES.map(id => <option key={id} value={id}>{PERSONAL_EM_CATEGORY_LABELS[id]}</option>)}
                </select>
              </label>
              <label className="block text-xs font-medium text-gray-600">
                Verwahrungsort
                <select className={`${inputClass} mt-1`} value={verwahrungsort} onChange={event => setVerwahrungsort(event.target.value)}>
                  <option value="">Beim Benutzer</option>
                  {VERWAHRUNGSORTE.filter(ort => ort !== 'lager').map(ort => <option key={ort} value={ort}>{VERWAHRUNGSORT_LABELS[ort]}</option>)}
                </select>
              </label>
              {PERSONAL_EM_FIELDS[category].map(field => {
                const kind = personalEmFieldKind(field)
                return (
                  <label key={field} className="block text-xs font-medium text-gray-600">
                    {personalEmFieldLabel(field, category)}
                    <input
                      className={`${inputClass} mt-1`}
                      type={kind === 'date' ? 'date' : kind === 'integer' ? 'number' : 'text'}
                      min={kind === 'integer' ? 0 : undefined}
                      inputMode={kind === 'integer' || kind === 'month_year' ? 'numeric' : undefined}
                      placeholder={kind === 'month_year' ? 'MM/JJJJ' : undefined}
                      value={values[field]}
                      onChange={event => setValues(current => ({ ...current, [field]: event.target.value }))}
                    />
                  </label>
                )
              })}
              {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm">Abbrechen</button>
              <button type="button" disabled={saving} onClick={() => { void save() }} className="flex-1 flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
                <Send className="w-4 h-4" /> {saving ? 'Speichern…' : editId ? 'Speichern' : 'Einreichen'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reviewing ? (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div><h2 className="font-bold text-gray-900">Einsatzmittel prüfen</h2><p className="text-sm text-gray-500 mt-0.5">{requesterLabel(reviewing)}</p></div>
              <button type="button" onClick={() => setReviewing(null)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="font-semibold text-gray-900">{PERSONAL_EM_CATEGORY_LABELS[reviewing.category]}</p>
                <p className="text-sm text-gray-600 mt-1">{personalEmDetailText(reviewing) || 'Keine zusätzlichen Angaben'}</p>
              </div>
              <label className="block text-xs font-medium text-gray-600">
                Bemerkung / Ablehnungsgrund
                <textarea className={`${inputClass} mt-1 min-h-24 resize-y`} maxLength={1000} value={reviewNote} onChange={event => setReviewNote(event.target.value)} />
              </label>
              {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3 px-6 py-4 border-t">
              <button type="button" disabled={saving} onClick={() => { void review(false) }} className="flex-1 flex items-center justify-center gap-2 border border-red-200 text-red-700 font-medium py-2.5 rounded-lg text-sm hover:bg-red-50">
                <XCircle className="w-4 h-4" /> Ablehnen
              </button>
              <button type="button" disabled={saving} onClick={() => { void review(true) }} className="flex-1 flex items-center justify-center gap-2 bg-green-700 hover:bg-green-800 text-white font-medium py-2.5 rounded-lg text-sm">
                <Check className="w-4 h-4" /> Bestätigen
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
  return requester.dienstnummer ? `${name} · DG ${requester.dienstnummer}` : name
}
