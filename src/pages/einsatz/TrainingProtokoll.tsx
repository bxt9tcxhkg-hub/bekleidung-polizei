import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { useAuth } from '../../contexts/AuthContext'
import type {
  EinsatzTrainingAttendance,
  EinsatzTrainingCompletion,
  EinsatzTrainingModule,
  EinsatzTrainingParticipation,
  EinsatzTrainingSession,
  Profile,
} from '../../lib/types'
import { officerDisplayName } from '../../lib/personalEinsatzmittel'
import { isEinsatzmittelActive } from '../../lib/einsatzmittelAusbuchung'
import {
  ATTENDANCE_STATUS_LABELS,
  cadenceLabel,
  emptyMunitionVerbrauchInput,
  formatCompletedOn,
  formatMunitionVerbrauch,
  geschossenFromSession,
  isAttendanceStatus,
  isModuleLockDbError,
  moduleAssignmentOptions,
  moduleLockUserMessage,
  munitionVerbrauchInputFromSession,
  validateAttendance,
  validateParticipation,
  validateSession,
  type AttendanceStatus,
  type GeschossenAnswer,
  type MunitionVerbrauchInput,
} from '../../lib/einsatztraining'
import { poolEmLocationLabel } from '../../lib/poolEinsatzmittel'
import { isVerwahrungsort } from '../../lib/verwahrungsort'
import MunitionVerbrauchFields, { GeschossenFrage, type PoolMunitionChoice } from './MunitionVerbrauchFields'
import { loadPoolMunitionChoices, saveMunitionVerbrauch } from './saveMunitionVerbrauch'

type OfficerOption = Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active'>

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

export default function TrainingProtokollPanel({ canManage }: { canManage: boolean }) {
  const { profile } = useAuth()
  const [sessions, setSessions] = useState<EinsatzTrainingSession[]>([])
  const [modules, setModules] = useState<EinsatzTrainingModule[]>([])
  const [completions, setCompletions] = useState<EinsatzTrainingCompletion[]>([])
  const [officers, setOfficers] = useState<OfficerOption[]>([])
  const [attendance, setAttendance] = useState<EinsatzTrainingAttendance[]>([])
  const [participations, setParticipations] = useState<EinsatzTrainingParticipation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showSessionForm, setShowSessionForm] = useState(false)
  const [sessionDate, setSessionDate] = useState('')
  const [sessionNote, setSessionNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [addOfficerId, setAddOfficerId] = useState('')
  const [drafts, setDrafts] = useState<Record<string, { moduleId: string; interval: string }>>({})
  const [munition, setMunition] = useState<MunitionVerbrauchInput>(emptyMunitionVerbrauchInput())
  const [geschossen, setGeschossen] = useState<GeschossenAnswer>('')
  const [poolMunition, setPoolMunition] = useState<PoolMunitionChoice[]>([])
  const [savingMunition, setSavingMunition] = useState(false)

  const selected = sessions.find(s => s.id === selectedId) ?? null

  async function loadList() {
    setLoading(true)
    const [{ data, error: loadError }, { data: moduleRows }, { data: completionRows }, { data: profileRows }] = await Promise.all([
      supabase.from('einsatz_training_sessions').select('*').eq('kind', 'intern').order('session_date', { ascending: false }),
      supabase.from('einsatz_training_modules').select('*').order('name'),
      supabase.from('einsatz_training_completions').select('*'),
      supabase.from('profiles').select('id,name,dienstnummer,username,active').order('name'),
    ])
    if (loadError) {
      setError('Trainingstage konnten nicht geladen werden.')
      setSessions([])
    } else {
      setError('')
      setSessions((data ?? []) as EinsatzTrainingSession[])
    }
    setModules((moduleRows ?? []) as EinsatzTrainingModule[])
    setCompletions((completionRows ?? []) as EinsatzTrainingCompletion[])
    setOfficers((profileRows ?? []) as OfficerOption[])
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
    const [{ data: attRows, error: attError }, { data: partRows, error: partError }] = await Promise.all([
      supabase
        .from('einsatz_training_attendance')
        .select('*, officer:profiles!officer_id(id,name,dienstnummer,username,active)')
        .eq('session_id', sessionId),
      supabase
        .from('einsatz_training_participations')
        .select('*, module:einsatz_training_modules(id,name,kind,active)')
        .eq('session_id', sessionId),
    ])
    if (attError || partError) {
      setError('Protokoll konnte nicht geladen werden.')
      return
    }
    setAttendance((attRows ?? []) as EinsatzTrainingAttendance[])
    setParticipations((partRows ?? []) as EinsatzTrainingParticipation[])
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

  const addableOfficers = useMemo(() => {
    const taken = new Set(attendance.map(row => row.officer_id))
    return officers.filter(o => o.active && !taken.has(o.id))
  }, [officers, attendance])

  function openNewSession() {
    setSessionDate('')
    setSessionNote('')
    setError('')
    setShowSessionForm(true)
  }

  async function createSession() {
    if (!canManage) return
    const result = validateSession({ kind: 'intern', sessionDate, note: sessionNote })
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
    logAudit('Internes Einsatztraining angelegt', result.payload.session_date)
    setShowSessionForm(false)
    setSaving(false)
    await loadList()
    setSelectedId(data.id)
  }

  async function addOfficer(officerId: string, status: AttendanceStatus = 'present') {
    if (!canManage || !selectedId) return
    const result = validateAttendance({ sessionKind: 'intern', officerId, status })
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
    setAddOfficerId('')
    await loadProtocol(selectedId)
  }

  async function addAllActive() {
    if (!canManage || !selectedId) return
    if (addableOfficers.length === 0) return
    const rows = addableOfficers.map(o => ({
      session_id: selectedId,
      officer_id: o.id,
      status: 'present' as const,
    }))
    const { error: insertError } = await supabase.from('einsatz_training_attendance').insert(rows)
    if (insertError) {
      setError(insertError.message || 'Übernahme fehlgeschlagen.')
      return
    }
    logAudit('Einsatztraining-Protokoll: aktive Personen übernommen', selected?.session_date ?? selectedId)
    await loadProtocol(selectedId)
  }

  async function setStatus(row: EinsatzTrainingAttendance, status: AttendanceStatus) {
    if (!canManage || !selectedId) return
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
        setError(deleteError.message || 'Modulzuweisungen der abwesenden Person konnten nicht entfernt werden.')
      }
    }
    await Promise.all([loadProtocol(selectedId), reloadCompletions()])
  }

  async function reloadCompletions() {
    const { data } = await supabase.from('einsatz_training_completions').select('*')
    setCompletions((data ?? []) as EinsatzTrainingCompletion[])
  }

  async function assignModule(officerId: string) {
    if (!canManage || !selectedId) return
    const draft = drafts[officerId] ?? { moduleId: '', interval: '' }
    const module = modules.find(m => m.id === draft.moduleId)
    const result = validateParticipation({
      sessionKind: 'intern',
      officerId,
      moduleId: draft.moduleId,
      moduleKind: module?.kind,
      intervalLabel: draft.interval,
      attendanceStatus: attendance.find(a => a.officer_id === officerId)?.status ?? null,
      completions,
      moduleName: module?.name,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    const { error: insertError } = await supabase.from('einsatz_training_participations').insert({
      session_id: selectedId,
      officer_id: result.payload.officer_id,
      module_id: result.payload.module_id,
      interval_label: result.payload.interval_label,
      created_by: profile?.id ?? null,
    })
    if (insertError) {
      setError(
        isModuleLockDbError(insertError.message)
          ? moduleLockUserMessage(module?.name)
          : (insertError.message || 'Zuweisung fehlgeschlagen.'),
      )
      return
    }
    logAudit('Einsatztraining-Modul zugewiesen', `${module?.name ?? result.payload.module_id}`)
    setDrafts(d => ({ ...d, [officerId]: { moduleId: '', interval: '' } }))
    setError('')
    await Promise.all([loadProtocol(selectedId), reloadCompletions()])
  }

  async function removeParticipation(row: EinsatzTrainingParticipation) {
    if (!canManage || !selectedId) return
    const { error: deleteError } = await supabase.from('einsatz_training_participations').delete().eq('id', row.id)
    if (deleteError) {
      setError(deleteError.message || 'Zuweisung konnte nicht entfernt werden.')
      return
    }
    await Promise.all([loadProtocol(selectedId), reloadCompletions()])
  }

  function participationsFor(officerId: string) {
    return participations.filter(row => row.officer_id === officerId)
  }

  const poolChoicesForForm = useMemo(() => {
    const extraId = selected?.munition_pool_id
    if (extraId && !poolMunition.some(item => item.id === extraId)) {
      return [...poolMunition, {
        id: extraId,
        marke: selected.munition_marke,
        typ: null,
        art: selected.munition_art,
        anzahl: null,
        locationLabel: 'ausgebucht oder unbekannt',
      }]
    }
    return poolMunition
  }, [poolMunition, selected])

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
    return (
      <div>
        <button
          type="button"
          onClick={() => { setSelectedId(null); setError('') }}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Alle internen Trainingstage
        </button>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-gray-900">
            Protokoll {formatCompletedOn(selected.session_date)}
          </h3>
          {selected.note && <p className="text-sm text-gray-500 mt-1">{selected.note}</p>}
          <p className="text-sm text-gray-500 mt-1">
            Anwesend/Abwesend und Intervall je Person. Ein abgeschlossenes Modul kann nicht erneut zugewiesen werden.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-4 py-4 mb-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Munition</h4>
          {canManage ? (
            <div className="space-y-4">
              <GeschossenFrage
                idPrefix="et-int-munition"
                value={geschossen}
                onChange={next => {
                  setGeschossen(next)
                  if (next === 'no') setMunition(emptyMunitionVerbrauchInput())
                }}
              />
              {geschossen === 'yes' && (
                <MunitionVerbrauchFields
                  idPrefix="et-int-munition"
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
              onClick={() => { void addAllActive() }}
              className="border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              Alle Aktiven übernehmen
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
              const assigned = participationsFor(row.officer_id)
              const options = moduleAssignmentOptions({
                officerId: row.officer_id,
                kind: 'intern',
                modules,
                completions,
              })
              const draft = drafts[row.officer_id] ?? { moduleId: '', interval: '' }
              return (
                <div key={row.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{officerDisplayName(officer)}</p>
                      <p className="text-xs text-gray-500">{ATTENDANCE_STATUS_LABELS[row.status]}</p>
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

                  {assigned.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {assigned.map(part => (
                        <li key={part.id} className="flex items-center justify-between gap-2 text-sm text-gray-700">
                          <span>
                            Intervall {part.interval_label ?? '–'} · {part.module?.name ?? 'Modul'}
                          </span>
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => { void removeParticipation(part) }}
                              className="p-1.5 hover:bg-red-50 rounded-md text-red-400 hover:text-red-600"
                              title="Zuweisung entfernen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {row.status === 'present' && canManage && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        className={inputClass}
                        placeholder="Intervall"
                        value={draft.interval}
                        onChange={e => setDrafts(d => ({
                          ...d,
                          [row.officer_id]: { ...draft, interval: e.target.value },
                        }))}
                        aria-label={`Intervall ${officerDisplayName(officer)}`}
                      />
                      <select
                        className={inputClass}
                        value={draft.moduleId}
                        onChange={e => setDrafts(d => ({
                          ...d,
                          [row.officer_id]: { ...draft, moduleId: e.target.value },
                        }))}
                        aria-label={`Modul ${officerDisplayName(officer)}`}
                      >
                        <option value="">Modul wählen</option>
                        {options.map(opt => (
                          <option key={opt.module.id} value={opt.module.id} disabled={opt.blocked}>
                            {opt.blocked
                              ? `${opt.module.name} — bereits abgeschlossen`
                              : opt.module.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => { void assignModule(row.officer_id) }}
                        className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"
                      >
                        Zuweisen
                      </button>
                    </div>
                  )}

                  {row.status === 'present' && options.some(opt => opt.blocked) && (
                    <ul className="mt-2 space-y-1">
                      {options.filter(opt => opt.blocked).map(opt => (
                        <li key={opt.module.id} className="text-xs text-amber-800 bg-amber-50 px-2 py-1 rounded">
                          {opt.reason}
                        </li>
                      ))}
                    </ul>
                  )}
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
          Am internen Trainingstag: Anwesenheit und Intervall je Modul. Taktung {cadenceLabel('intern')}.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={openNewSession}
            className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors flex-shrink-0"
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
          <p className="text-sm text-gray-500">Noch kein internes Einsatztraining erfasst.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Datum</th>
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
              <h2 className="font-bold text-gray-900">Interner Trainingstag</h2>
              <button type="button" onClick={() => { setShowSessionForm(false); setSaving(false) }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-session-date">Datum *</label>
                <input
                  id="et-session-date"
                  type="date"
                  className={inputClass}
                  value={sessionDate}
                  onChange={e => setSessionDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-session-note">Hinweis</label>
                <input
                  id="et-session-note"
                  className={inputClass}
                  value={sessionNote}
                  onChange={e => setSessionNote(e.target.value)}
                />
              </div>
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
