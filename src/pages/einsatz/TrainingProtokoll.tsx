import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { useAuth } from '../../contexts/AuthContext'
import type {
  EinsatzTrainingAttendance,
  EinsatzTrainingCompletion,
  EinsatzTrainingModule,
  EinsatzTrainingParticipation,
  EinsatzTrainingRegistration,
  EinsatzTrainingSession,
  Profile,
} from '../../lib/types'
import { officerDisplayName } from '../../lib/personalEinsatzmittel'
import { OFFICER_LIST_PROFILE_SELECT, excludeAdminsFromOfficerList } from '../../lib/portalAdmin'
import { isEinsatzmittelActive } from '../../lib/einsatzmittelAusbuchung'
import {
  ATTENDANCE_STATUS_LABELS,
  emptyMunitionVerbrauchInput,
  formatCompletedOn,
  formatMunitionVerbrauch,
  geschossenFromSession,
  isAttendanceStatus,
  isModuleLockDbError,
  moduleAssignmentBlockReason,
  moduleFilterLabel,
  munitionVerbrauchInputFromSession,
  preferGeschossenQuestion,
  shouldAskGeschossen,
  officersEligibleForModule,
  validateAttendance,
  validateParticipation,
  validateSession,
  type AttendanceStatus,
  type GeschossenAnswer,
  type MunitionVerbrauchInput,
} from '../../lib/einsatztraining'
import { poolEmLocationLabel } from '../../lib/poolEinsatzmittel'
import { isVerwahrungsort } from '../../lib/verwahrungsort'
import { generateTrainingProtocolPdf } from '../../lib/einsatzPdf'
import MunitionVerbrauchFields, { GeschossenFrage, type PoolMunitionChoice } from './MunitionVerbrauchFields'
import { loadPoolMunitionChoices, saveMunitionVerbrauch } from './saveMunitionVerbrauch'
import PdfExportButton from './PdfExportButton'

type OfficerOption = Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active' | 'organisation' | 'roles'> & Pick<Partial<Profile>, 'admin'>

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

export default function TrainingProtokollPanel({ canManage }: { canManage: boolean }) {
  const { profile } = useAuth()
  const [sessions, setSessions] = useState<EinsatzTrainingSession[]>([])
  const [modules, setModules] = useState<EinsatzTrainingModule[]>([])
  const [completions, setCompletions] = useState<EinsatzTrainingCompletion[]>([])
  const [officers, setOfficers] = useState<OfficerOption[]>([])
  const [attendance, setAttendance] = useState<EinsatzTrainingAttendance[]>([])
  const [participations, setParticipations] = useState<EinsatzTrainingParticipation[]>([])
  const [registrations, setRegistrations] = useState<EinsatzTrainingRegistration[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showSessionForm, setShowSessionForm] = useState(false)
  const [sessionDate, setSessionDate] = useState('')
  const [sessionNote, setSessionNote] = useState('')
  const [sessionModuleId, setSessionModuleId] = useState('')
  const [sessionCapacity, setSessionCapacity] = useState('')
  const [sessionAnnounced, setSessionAnnounced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addOfficerId, setAddOfficerId] = useState('')
  const [munition, setMunition] = useState<MunitionVerbrauchInput>(emptyMunitionVerbrauchInput())
  const [geschossen, setGeschossen] = useState<GeschossenAnswer>('')
  const [poolMunition, setPoolMunition] = useState<PoolMunitionChoice[]>([])
  const [savingMunition, setSavingMunition] = useState(false)

  const selected = sessions.find(s => s.id === selectedId) ?? null
  const selectedModule = selected?.module ?? modules.find(m => m.id === selected?.module_id) ?? null

  async function loadList() {
    setLoading(true)
    const [sessRes, modRes, compRes, profRes] = await Promise.all([
      supabase
        .from('einsatz_training_sessions')
        .select('*, module:einsatz_training_modules(id,name,kind,module_type,schiesst,applies_to,period_year,period_half,active)')
        .order('session_date', { ascending: false }),
      supabase.from('einsatz_training_modules').select('*').order('name'),
      supabase.from('einsatz_training_completions').select('*'),
      supabase.from('profiles').select(OFFICER_LIST_PROFILE_SELECT).order('name'),
    ])
    if (sessRes.error) {
      setError('Trainingstage konnten nicht geladen werden.')
      setSessions([])
    } else {
      setError('')
      setSessions((sessRes.data ?? []) as EinsatzTrainingSession[])
    }
    setModules((modRes.data ?? []) as EinsatzTrainingModule[])
    setCompletions((compRes.data ?? []) as EinsatzTrainingCompletion[])
    setOfficers(excludeAdminsFromOfficerList((profRes.data ?? []) as OfficerOption[]))
    const poolRes = await loadPoolMunitionChoices()
    if (poolRes.ok) {
      setPoolMunition(poolRes.items.filter(isEinsatzmittelActive).map(item => ({
        id: item.id,
        marke: item.marke,
        typ: item.typ,
        art: item.art,
        anzahl: item.anzahl,
        locationLabel: isVerwahrungsort(item.verwahrungsort)
          ? poolEmLocationLabel(item.verwahrungsort, item.lager_notiz)
          : item.verwahrungsort,
      })))
    }
    setLoading(false)
  }

  async function loadProtocol(sessionId: string) {
    const [attRes, partRes, regRes] = await Promise.all([
      supabase
        .from('einsatz_training_attendance')
        .select(`*, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`)
        .eq('session_id', sessionId),
      supabase
        .from('einsatz_training_participations')
        .select('*, module:einsatz_training_modules(id,name,kind,module_type,schiesst,applies_to,active)')
        .eq('session_id', sessionId),
      canManage
        ? supabase
          .from('einsatz_training_registrations')
          .select(`*, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`)
          .eq('session_id', sessionId)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (attRes.error || partRes.error) {
      setError('Protokoll konnte nicht geladen werden.')
      return
    }
    setAttendance((attRes.data ?? []) as EinsatzTrainingAttendance[])
    setParticipations((partRes.data ?? []) as EinsatzTrainingParticipation[])
    setRegistrations((regRes.data ?? []) as EinsatzTrainingRegistration[])
  }

  useEffect(() => {
    loadList().catch(() => {
      setError('Trainingstage konnten nicht geladen werden.')
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setAttendance([])
      setParticipations([])
      setRegistrations([])
      return
    }
    loadProtocol(selectedId).catch(() => setError('Protokoll konnte nicht geladen werden.'))
  }, [selectedId])

  useEffect(() => {
    if (!selected) {
      setMunition(emptyMunitionVerbrauchInput())
      setGeschossen('')
      return
    }
    setMunition(munitionVerbrauchInputFromSession(selected))
    setGeschossen(geschossenFromSession(selected))
  }, [selected])

  const officerById = useMemo(() => new Map(officers.map(o => [o.id, o])), [officers])
  const dutyOfficers = useMemo(
    () => selectedModule
      ? officersEligibleForModule({ module: selectedModule, officers })
      : officersEligibleForModule({ module: { applies_to: 'polizei' }, officers }),
    [officers, selectedModule],
  )
  const addableOfficers = useMemo(() => {
    const taken = new Set(attendance.map(row => row.officer_id))
    return dutyOfficers.filter(o => !taken.has(o.id))
  }, [dutyOfficers, attendance])

  async function reloadCompletions() {
    const { data } = await supabase.from('einsatz_training_completions').select('*')
    setCompletions((data ?? []) as EinsatzTrainingCompletion[])
  }

  async function createSession() {
    if (!canManage) return
    const module = modules.find(m => m.id === sessionModuleId)
    const result = validateSession({
      kind: module?.kind ?? 'intern',
      sessionDate,
      note: sessionNote,
      moduleId: sessionModuleId,
      capacity: sessionCapacity,
      announced: sessionAnnounced,
      module,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSaving(true)
    setError('')
    const { data, error: insertError } = await supabase
      .from('einsatz_training_sessions')
      .insert({ ...result.payload, created_by: profile?.id ?? null })
      .select('id')
      .single()
    if (insertError || !data) {
      setError(insertError?.message || 'Anlegen fehlgeschlagen.')
      setSaving(false)
      return
    }
    logAudit('Einsatztraining-Protokoll angelegt', `${module?.name ?? sessionModuleId} ${result.payload.session_date}`)
    setShowSessionForm(false)
    setSaving(false)
    await loadList()
    setSelectedId(data.id)
  }

  async function assignIfNeeded(officerId: string, session: EinsatzTrainingSession) {
    if (!session.module_id) return
    const module = session.module ?? modules.find(m => m.id === session.module_id)
    const lock = moduleAssignmentBlockReason({
      officerId,
      moduleId: session.module_id,
      moduleName: module?.name,
      completions,
      module,
    })
    if (lock) return
    const result = validateParticipation({
      sessionKind: session.kind,
      officerId,
      moduleId: session.module_id,
      intervalLabel: '',
      attendanceStatus: 'present',
      completions,
      moduleName: module?.name,
      sessionModuleId: session.module_id,
      sessionDate: session.session_date,
      module,
    })
    if (!result.ok) return
    const { error: insertError } = await supabase.from('einsatz_training_participations').insert({
      session_id: session.id,
      officer_id: result.payload.officer_id,
      module_id: result.payload.module_id,
      interval_label: result.payload.interval_label,
      created_by: profile?.id ?? null,
    })
    if (insertError && !isModuleLockDbError(insertError.message)) {
      setError(insertError.message || 'Abschluss konnte nicht gesetzt werden.')
    }
  }

  async function addOfficer(officerId: string, status: AttendanceStatus = 'present') {
    if (!canManage || !selectedId || !selected) return
    const result = validateAttendance({ sessionKind: selected.kind, officerId, status })
    if (!result.ok) {
      setError(result.error)
      return
    }
    const { error: insertError } = await supabase.from('einsatz_training_attendance').insert({
      session_id: selectedId,
      officer_id: result.payload.officer_id,
      status: result.payload.status,
    })
    if (insertError) {
      setError(insertError.message || 'Person konnte nicht übernommen werden.')
      return
    }
    if (status === 'present') await assignIfNeeded(officerId, selected)
    setAddOfficerId('')
    await Promise.all([loadProtocol(selectedId), reloadCompletions()])
  }

  async function importRegistrations() {
    if (!canManage || !selectedId || !selected) return
    const taken = new Set(attendance.map(row => row.officer_id))
    const missing = registrations.filter(r => !taken.has(r.officer_id))
    if (missing.length === 0) return
    const rows = missing.map(r => ({
      session_id: selectedId,
      officer_id: r.officer_id,
      status: 'present' as const,
    }))
    const { error: insertError } = await supabase.from('einsatz_training_attendance').insert(rows)
    if (insertError) {
      setError(insertError.message || 'Anmeldungen konnten nicht übernommen werden.')
      return
    }
    for (const row of missing) {
      await assignIfNeeded(row.officer_id, selected)
    }
    logAudit('Einsatztraining-Anmeldungen übernommen', selected.session_date)
    await Promise.all([loadProtocol(selectedId), reloadCompletions()])
  }

  async function setStatus(row: EinsatzTrainingAttendance, status: AttendanceStatus) {
    if (!canManage || !selectedId || !selected) return
    const { error: updateError } = await supabase
      .from('einsatz_training_attendance')
      .update({ status })
      .eq('id', row.id)
    if (updateError) {
      setError(updateError.message || 'Status konnte nicht gespeichert werden.')
      return
    }
    if (status === 'absent') {
      const { error: deleteError } = await supabase
        .from('einsatz_training_participations')
        .delete()
        .eq('session_id', selectedId)
        .eq('officer_id', row.officer_id)
      if (deleteError) {
        setError(deleteError.message || 'Abschluss der abwesenden Person konnte nicht entfernt werden.')
      }
    } else {
      await assignIfNeeded(row.officer_id, selected)
    }
    await Promise.all([loadProtocol(selectedId), reloadCompletions()])
  }

  const selectedPoolId = selected?.munition_pool_id ?? null
  const selectedMarke = selected?.munition_marke ?? null
  const selectedArt = selected?.munition_art ?? null
  const poolChoicesForForm = useMemo(() => {
    if (selectedPoolId && !poolMunition.some(item => item.id === selectedPoolId)) {
      return [...poolMunition, {
        id: selectedPoolId,
        marke: selectedMarke,
        typ: null,
        art: selectedArt,
        anzahl: null,
        locationLabel: 'ausgebucht oder unbekannt',
      }]
    }
    return poolMunition
  }, [poolMunition, selectedPoolId, selectedMarke, selectedArt])

  async function saveMunition() {
    if (!canManage || !selected) return
    setSavingMunition(true)
    setError('')
    const result = await saveMunitionVerbrauch({
      sessionId: selected.id,
      previous: selected,
      form: geschossen === 'yes' ? munition : emptyMunitionVerbrauchInput(),
      geschossen,
      recordedBy: profile?.id ?? null,
    })
    if (!result.ok) {
      setError(result.error)
      setSavingMunition(false)
      return
    }
    logAudit('Munitionsverbrauch Einsatztraining', `${selected.session_date} ${munition.anzahl || 'leer'}`)
    setSavingMunition(false)
    await loadList()
  }

  if (loading && !selected) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" />
      </div>
    )
  }

  if (selected) {
    const askMunition = shouldAskGeschossen(selectedModule)
    return (
      <div>
        <button
          type="button"
          onClick={() => { setSelectedId(null); setError('') }}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Alle Trainingstage
        </button>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Protokoll {formatCompletedOn(selected.session_date)}
            </h3>
            <p className="text-sm text-gray-700 mt-1">
              {selectedModule ? moduleFilterLabel(selectedModule) : 'Kein Modul gesetzt'}
            </p>
            {selected.note && <p className="text-sm text-gray-500 mt-1">{selected.note}</p>}
            <p className="text-sm text-gray-500 mt-1">
              Anwesend schließt das Modul ab.
            </p>
          </div>
          <PdfExportButton
            onClick={() => generateTrainingProtocolPdf({
              session: { ...selected, moduleName: selectedModule?.name },
              attendance,
              participations,
            })}
          />
        </div>

        {askMunition && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-4 mb-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              Munition{preferGeschossenQuestion(selectedModule) ? ' (Mit Schießen)' : ''}
            </h4>
            {canManage ? (
              <div className="space-y-4">
                <GeschossenFrage
                  idPrefix="et-prot-munition"
                  value={geschossen}
                  onChange={next => {
                    setGeschossen(next)
                    if (next === 'no') setMunition(emptyMunitionVerbrauchInput())
                  }}
                />
                {geschossen === 'yes' && (
                  <MunitionVerbrauchFields
                    idPrefix="et-prot-munition"
                    value={munition}
                    onChange={setMunition}
                    poolItems={poolChoicesForForm.filter(item => (item.anzahl ?? 0) > 0 || item.id === selected.munition_pool_id)}
                    requirePool
                  />
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => { void saveMunition() }}
                    disabled={savingMunition}
                    className="bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg"
                  >
                    {savingMunition ? 'Speichern...' : 'Speichern'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                {formatMunitionVerbrauch(selected) || 'Noch nicht erfasst.'}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
        )}

        {canManage && (
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <select
              className={inputClass}
              value={addOfficerId}
              onChange={e => setAddOfficerId(e.target.value)}
              aria-label="Polizist zum Protokoll"
            >
              <option value="">Polizist hinzufügen</option>
              {addableOfficers.map(o => (
                <option key={o.id} value={o.id}>{officerDisplayName(o)}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!addOfficerId}
              onClick={() => { void addOfficer(addOfficerId) }}
              className="bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              Übernehmen
            </button>
            <button
              type="button"
              onClick={() => { void importRegistrations() }}
              className="border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              Anmeldungen übernehmen
            </button>
          </div>
        )}

        {attendance.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-8">
            <p className="text-sm text-gray-500">Noch niemand im Protokoll.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {attendance.map(row => {
              const officer = row.officer ?? officerById.get(row.officer_id)
              const assigned = participations.filter(p => p.officer_id === row.officer_id)
              const lock = selected.module_id
                ? moduleAssignmentBlockReason({
                  officerId: row.officer_id,
                  moduleId: selected.module_id,
                  moduleName: selectedModule?.name,
                  completions,
                  module: selectedModule,
                })
                : null
              return (
                <div key={row.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{officerDisplayName(officer)}</p>
                      <p className="text-xs text-gray-500">{ATTENDANCE_STATUS_LABELS[row.status]}</p>
                      {assigned.length > 0 && (
                        <p className="text-xs text-green-800 mt-1">
                          Abschluss {assigned.map(p => p.module?.name ?? selectedModule?.name ?? 'Modul').join(', ')}
                        </p>
                      )}
                      {lock && row.status === 'present' && assigned.length === 0 && (
                        <p className="text-xs text-amber-800 mt-1">{lock}</p>
                      )}
                    </div>
                    {canManage && (
                      <select
                        className={`${inputClass} sm:w-44`}
                        value={row.status}
                        onChange={e => {
                          if (isAttendanceStatus(e.target.value)) void setStatus(row, e.target.value)
                        }}
                        aria-label={`Anwesenheit ${officerDisplayName(officer)}`}
                      >
                        <option value="present">Anwesend</option>
                        <option value="absent">Abwesend</option>
                      </select>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500">
          Trainingstag, Anwesenheit, Munition.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setSessionDate('')
              setSessionNote('')
              setSessionModuleId(modules.find(m => m.active)?.id ?? '')
              setSessionCapacity('')
              setSessionAnnounced(false)
              setError('')
              setShowSessionForm(true)
            }}
            className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Trainingstag</span>
          </button>
        )}
      </div>

      {error && !showSessionForm && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-8">
          <p className="text-sm text-gray-500">Noch kein Trainingstag erfasst.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Datum</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Modul</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Hinweis</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Munition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sessions.map(session => (
                <tr key={session.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(session.id)}
                      className="font-medium text-blue-800 hover:underline"
                    >
                      {formatCompletedOn(session.session_date)}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {session.module ? moduleFilterLabel(session.module) : '–'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{session.note || '–'}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                    {formatMunitionVerbrauch(session) || '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showSessionForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Trainingstag</h2>
              <button type="button" onClick={() => { setShowSessionForm(false); setSaving(false) }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-session-date">Datum *</label>
                <input id="et-session-date" type="date" className={inputClass} value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-session-module">Modul *</label>
                <select id="et-session-module" className={inputClass} value={sessionModuleId} onChange={e => setSessionModuleId(e.target.value)}>
                  <option value="">Bitte wählen</option>
                  {modules.filter(m => m.active).map(module => (
                    <option key={module.id} value={module.id}>{moduleFilterLabel(module)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-session-note">Hinweis</label>
                <input id="et-session-note" className={inputClass} value={sessionNote} onChange={e => setSessionNote(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-session-cap">Kapazität</label>
                <input id="et-session-cap" className={inputClass} value={sessionCapacity} onChange={e => setSessionCapacity(e.target.value)} placeholder="optional" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={sessionAnnounced} onChange={e => setSessionAnnounced(e.target.checked)} />
                Ausschreiben (Selbstanmeldung)
              </label>
              {error && showSessionForm && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button type="button" onClick={() => { setShowSessionForm(false); setSaving(false) }} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => { void createSession() }}
                disabled={saving}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60"
              >
                {saving ? 'Speichern...' : 'Anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
