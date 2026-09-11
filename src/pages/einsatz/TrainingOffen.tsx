import { useEffect, useMemo, useState } from 'react'
import { Check, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { useAuth } from '../../contexts/AuthContext'
import type {
  EinsatzTrainingAssignment,
  EinsatzTrainingCompletion,
  EinsatzTrainingModule,
  EinsatzTrainingRegistration,
  EinsatzTrainingSession,
  Profile,
} from '../../lib/types'
import {
  SCHIESSEN_LABEL,
  appliesToLabel,
  etClassCadenceLabel,
  etClassFromModule,
  etClassLabel,
  formatCompletedOn,
  isTrainingPeriodHalf,
  moduleFilterLabel,
  officersCompletedForModule,
  officersOpenForModule,
  periodLabel,
} from '../../lib/einsatztraining'
import { officerDisplayName } from '../../lib/personalEinsatzmittel'
import { OFFICER_LIST_PROFILE_SELECT, excludeAdminsFromOfficerList, isPortalAdminProfile } from '../../lib/portalAdmin'
import { generateOffenAnmeldungenPdf } from '../../lib/einsatzPdf'
import PdfExportButton from './PdfExportButton'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

type OfficerOption = Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active' | 'organisation' | 'roles'> & Pick<Partial<Profile>, 'admin'>

export default function TrainingOffenPanel({ canManage, isGenehmiger }: { canManage: boolean; isGenehmiger: boolean }) {
  const { profile } = useAuth()
  const [modules, setModules] = useState<EinsatzTrainingModule[]>([])
  const [completions, setCompletions] = useState<EinsatzTrainingCompletion[]>([])
  const [officers, setOfficers] = useState<OfficerOption[]>([])
  const [sessions, setSessions] = useState<EinsatzTrainingSession[]>([])
  const [registrations, setRegistrations] = useState<EinsatzTrainingRegistration[]>([])
  const [assignments, setAssignments] = useState<EinsatzTrainingAssignment[]>([])
  const [moduleId, setModuleId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [proposingId, setProposingId] = useState<string | null>(null)
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<EinsatzTrainingAssignment | null>(null)
  const [reviewSessionId, setReviewSessionId] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)

  async function load() {
    setLoading(true)
    const [modRes, compRes, profRes, sessRes, regRes, assignRes] = await Promise.all([
      supabase.from('einsatz_training_modules').select('*').eq('active', true).order('name'),
      supabase.from('einsatz_training_completions').select(`*, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`),
      supabase.from('profiles').select(OFFICER_LIST_PROFILE_SELECT).order('name'),
      supabase.from('einsatz_training_sessions').select('*').eq('announced', true).order('session_date', { ascending: true }),
      canManage
        ? supabase.from('einsatz_training_registrations').select(`*, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`)
        : supabase.from('einsatz_training_registrations').select(`*, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`).eq('officer_id', profile?.id ?? ''),
      canManage
        ? supabase.from('einsatz_training_assignments').select(`*, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`).eq('status', 'vorschlag').is('session_id', null)
        : Promise.resolve({ data: [] as EinsatzTrainingAssignment[], error: null }),
    ])
    if (modRes.error || compRes.error || profRes.error) {
      setError('Offene Liste konnte nicht geladen werden.')
      setModules([])
      setCompletions([])
      setOfficers([])
    } else {
      setError('')
      setModules((modRes.data ?? []) as EinsatzTrainingModule[])
      setCompletions((compRes.data ?? []) as EinsatzTrainingCompletion[])
      setOfficers(excludeAdminsFromOfficerList((profRes.data ?? []) as OfficerOption[]))
    }
    setSessions((sessRes.data ?? []) as EinsatzTrainingSession[])
    setRegistrations((regRes.data ?? []) as EinsatzTrainingRegistration[])
    setAssignments((assignRes.data ?? []) as EinsatzTrainingAssignment[])
    setLoading(false)
  }

  useEffect(() => {
    load().catch(() => {
      setError('Offene Liste konnte nicht geladen werden.')
      setLoading(false)
    })
  }, [canManage, profile?.id])

  const selected = modules.find(m => m.id === moduleId) ?? modules[0] ?? null
  const effectiveId = selected?.id ?? ''

  useEffect(() => {
    if (!moduleId && modules[0]) setModuleId(modules[0].id)
  }, [modules, moduleId])

  const open = useMemo(
    () => selected ? officersOpenForModule({ module: selected, officers, completions }) : [],
    [selected, officers, completions],
  )
  const done = useMemo(
    () => selected ? officersCompletedForModule({ module: selected, officers, completions }) : [],
    [selected, officers, completions],
  )
  const offerings = useMemo(
    () => sessions.filter(s => s.module_id === effectiveId),
    [sessions, effectiveId],
  )
  const moduleAssignments = useMemo(
    () => assignments.filter(a => a.module_id === effectiveId),
    [assignments, effectiveId],
  )

  async function proposeForModule(officerId: string) {
    if (!profile?.id || !selected) return
    setProposingId(officerId)
    setError('')
    const { error: insertError } = await supabase.from('einsatz_training_assignments').insert({
      officer_id: officerId,
      module_id: selected.id,
      proposed_by: profile.id,
    })
    setProposingId(null)
    if (insertError) {
      setError(insertError.message || 'Vorschlag fehlgeschlagen.')
      return
    }
    const officer = officers.find(row => row.id === officerId)
    logAudit('Trainingsvorschlag angelegt', `${officer ? officerDisplayName(officer) : officerId} · ${selected.name}`)
    await load()
  }

  async function withdrawProposal(assignment: EinsatzTrainingAssignment) {
    if (!window.confirm('Diesen Trainingsvorschlag zurückziehen?')) return
    setWithdrawingId(assignment.id)
    setError('')
    const { error: deleteError } = await supabase.from('einsatz_training_assignments').delete().eq('id', assignment.id)
    setWithdrawingId(null)
    if (deleteError) {
      setError(deleteError.message || 'Vorschlag konnte nicht zurückgezogen werden.')
      return
    }
    logAudit('Trainingsvorschlag zurückgezogen', `${officerDisplayName(assignment.officer)} · ${selected?.name ?? assignment.module_id}`)
    await load()
  }

  function openReview(assignment: EinsatzTrainingAssignment) {
    setReviewing(assignment)
    setReviewSessionId('')
    setReviewNote('')
    setError('')
  }

  async function review(approve: boolean) {
    if (!reviewing) return
    if (approve && !reviewSessionId) {
      setError('Bitte einen Termin für die Einteilung wählen.')
      return
    }
    setReviewSaving(true)
    const { error: rpcError } = await supabase.rpc('decide_training_assignment', {
      p_assignment_id: reviewing.id,
      p_approve: approve,
      p_session_id: approve ? reviewSessionId : null,
      p_note: reviewNote.trim() || null,
    })
    setReviewSaving(false)
    if (rpcError) {
      setError(rpcError.message || 'Entscheidung fehlgeschlagen.')
      return
    }
    logAudit(
      approve ? 'Trainingsvorschlag genehmigt' : 'Trainingsvorschlag abgelehnt',
      `${officerDisplayName(reviewing.officer)} · ${selected?.name ?? reviewing.module_id}`,
    )
    setReviewing(null)
    await load()
  }

  if (!canManage) {
    return (
      <p className="text-sm text-gray-500">
        Offene Liste nur für Sachbearbeitung.
      </p>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500">
          Offen laut Geltung, ohne Abschluss.
        </p>
        {selected && (
          <PdfExportButton
            label="Offen / Anmeldungen"
            disabled={loading}
            onClick={() => generateOffenAnmeldungenPdf({
              moduleName: selected.name,
              moduleType: selected.module_type,
              etClass: etClassFromModule(selected),
              appliesTo: selected.applies_to,
              periodLabel: etClassFromModule(selected) === 'intern'
                && selected.period_year != null
                && isTrainingPeriodHalf(selected.period_half ?? 0)
                ? periodLabel(selected.period_year, selected.period_half ?? 1)
                : null,
              openOfficers: open.map(row => ({
                officerName: officerDisplayName(row),
                dienstnummer: row.dienstnummer,
              })),
              completedOfficers: done.map(row => ({
                officerName: officerDisplayName(row),
                completedOn: completions.find(c => c.officer_id === row.id && c.module_id === selected.id)?.completed_on ?? '',
              })),
              offerings: offerings.map(session => ({
                date: session.session_date,
                note: session.note,
                capacity: session.capacity,
                registrations: registrations
                  .filter(r => r.session_id === session.id && !isPortalAdminProfile(r.officer))
                  .map(r => ({ officerName: officerDisplayName(r.officer) })),
              })),
            })}
          />
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" />
        </div>
      ) : modules.length === 0 ? (
        <p className="text-sm text-gray-500">Zuerst ein Modul anlegen.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-offen-module">Modul</label>
            <select
              id="et-offen-module"
              className="w-full max-w-xl border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={effectiveId}
              onChange={e => setModuleId(e.target.value)}
            >
              {modules.map(module => (
                <option key={module.id} value={module.id}>{moduleFilterLabel(module)}</option>
              ))}
            </select>
            {selected && (
              <p className="text-xs text-gray-500 mt-1">
                {etClassLabel(selected)} · {etClassCadenceLabel(etClassFromModule(selected))}
                {' · '}{appliesToLabel(selected.applies_to)}
                {selected.schiesst ? ` · ${SCHIESSEN_LABEL}` : ''}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 bg-gray-50 border-b">
                Offen ({open.length})
              </h3>
              {open.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-500">Niemand offen.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {open.map(row => {
                    const alreadyProposed = moduleAssignments.some(a => a.officer_id === row.id)
                    return (
                      <li key={row.id} className="px-4 py-2 text-sm text-gray-800 flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{officerDisplayName(row)}</span>
                        {alreadyProposed ? (
                          <span className="shrink-0 text-xs text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">Vorgeschlagen</span>
                        ) : (
                          <button
                            type="button"
                            disabled={proposingId === row.id}
                            onClick={() => { void proposeForModule(row.id) }}
                            className="shrink-0 text-xs text-blue-800 hover:underline disabled:opacity-60"
                          >
                            Vorschlagen
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
            <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 bg-gray-50 border-b">
                Abgeschlossen ({done.length})
              </h3>
              {done.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-500">Noch keine Abschlüsse.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {done.map(row => {
                    const when = completions.find(c => c.officer_id === row.id && c.module_id === selected?.id)?.completed_on
                    return (
                      <li key={row.id} className="px-4 py-2 text-sm text-gray-800 flex justify-between gap-2">
                        <span>{officerDisplayName(row)}</span>
                        <span className="text-gray-500">{formatCompletedOn(when)}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>

          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 bg-gray-50 border-b">
              Anmeldungen zu ausgeschriebenen Terminen
            </h3>
            {offerings.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">Kein ausgeschriebener Termin für dieses Modul.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {offerings.map(session => {
                  const regs = registrations.filter(r => r.session_id === session.id && !isPortalAdminProfile(r.officer))
                  return (
                    <div key={session.id} className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {formatCompletedOn(session.session_date)}
                        {session.capacity != null ? ` · Kapazität ${session.capacity}` : ''}
                        {` · ${regs.length} Anmeldung${regs.length === 1 ? '' : 'en'}`}
                      </p>
                      {session.note && <p className="text-xs text-gray-500 mt-0.5">{session.note}</p>}
                      <p className="text-sm text-gray-700 mt-1">
                        {regs.length === 0
                          ? 'Keine Anmeldungen.'
                          : regs.map(r => officerDisplayName(r.officer)).join(', ')}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 bg-gray-50 border-b">
              Trainingsvorschläge ohne Termin ({moduleAssignments.length})
            </h3>
            {moduleAssignments.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">Keine offenen Vorschläge für dieses Modul.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {moduleAssignments.map(assignment => (
                  <li key={assignment.id} className="px-4 py-3 flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-800 min-w-0 truncate">{officerDisplayName(assignment.officer)}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      {isGenehmiger ? (
                        <button
                          type="button"
                          onClick={() => openReview(assignment)}
                          className="flex items-center gap-1.5 bg-blue-800 hover:bg-blue-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                        >
                          Prüfen
                        </button>
                      ) : (
                        <span className="text-xs text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">Wartet auf Genehmiger</span>
                      )}
                      <button
                        type="button"
                        disabled={withdrawingId === assignment.id}
                        onClick={() => { void withdrawProposal(assignment) }}
                        className="text-xs text-red-700 hover:underline disabled:opacity-60"
                      >
                        Zurückziehen
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {reviewing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-bold text-gray-900">Trainingsvorschlag prüfen</h2>
                <p className="text-sm text-gray-500 mt-0.5">{officerDisplayName(reviewing.officer)} · {selected?.name ?? reviewing.module_id}</p>
              </div>
              <button type="button" onClick={() => setReviewing(null)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <label className="block text-xs font-medium text-gray-600">
                Termin für die Einteilung *
                <select className={`${inputClass} mt-1`} value={reviewSessionId} onChange={e => setReviewSessionId(e.target.value)}>
                  <option value="">Bitte wählen</option>
                  {offerings.map(session => (
                    <option key={session.id} value={session.id}>{formatCompletedOn(session.session_date)}{session.note ? ` · ${session.note}` : ''}</option>
                  ))}
                </select>
                {offerings.length === 0 && (
                  <p className="text-xs text-amber-800 mt-1">Für dieses Modul ist noch kein Termin ausgeschrieben.</p>
                )}
              </label>
              <label className="block text-xs font-medium text-gray-600">
                Bemerkung / Ablehnungsgrund
                <textarea className={`${inputClass} mt-1 min-h-24 resize-y`} maxLength={500} value={reviewNote} onChange={e => setReviewNote(e.target.value)} />
              </label>
              {error && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3 px-6 py-4 border-t">
              <button
                type="button"
                disabled={reviewSaving}
                onClick={() => { void review(false) }}
                className="flex-1 flex items-center justify-center gap-2 border border-red-200 text-red-700 font-medium py-2.5 rounded-lg text-sm hover:bg-red-50 disabled:opacity-60"
              >
                <XCircle className="w-4 h-4" /> Ablehnen
              </button>
              <button
                type="button"
                disabled={reviewSaving || offerings.length === 0}
                onClick={() => { void review(true) }}
                className="flex-1 flex items-center justify-center gap-2 bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm"
              >
                <Check className="w-4 h-4" /> Einteilen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
