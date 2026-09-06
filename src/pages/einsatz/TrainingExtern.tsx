import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { useAuth } from '../../contexts/AuthContext'
import type {
  EinsatzTrainingCompletion,
  EinsatzTrainingModule,
  EinsatzTrainingParticipation,
  EinsatzTrainingSession,
  Profile,
} from '../../lib/types'
import { officerDisplayName } from '../../lib/personalEinsatzmittel'
import {
  cadenceLabel,
  formatCompletedOn,
  isModuleLockDbError,
  moduleAssignmentBlockReason,
  moduleAssignmentOptions,
  moduleLockUserMessage,
  validateParticipation,
  validateSession,
} from '../../lib/einsatztraining'

type OfficerOption = Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active'>

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

export default function TrainingExternPanel({ canManage }: { canManage: boolean }) {
  const { profile } = useAuth()
  const [sessions, setSessions] = useState<EinsatzTrainingSession[]>([])
  const [modules, setModules] = useState<EinsatzTrainingModule[]>([])
  const [completions, setCompletions] = useState<EinsatzTrainingCompletion[]>([])
  const [participations, setParticipations] = useState<EinsatzTrainingParticipation[]>([])
  const [officers, setOfficers] = useState<OfficerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [sessionDate, setSessionDate] = useState('')
  const [sessionNote, setSessionNote] = useState('')
  const [officerId, setOfficerId] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [interval, setInterval] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const [sessionsRes, modulesRes, completionsRes, partsRes, profilesRes] = await Promise.all([
      supabase.from('einsatz_training_sessions').select('*').eq('kind', 'extern').order('session_date', { ascending: false }),
      supabase.from('einsatz_training_modules').select('*').eq('kind', 'extern').order('name'),
      supabase.from('einsatz_training_completions').select('*'),
      supabase
        .from('einsatz_training_participations')
        .select('*, module:einsatz_training_modules(id,name,kind,active), officer:profiles!officer_id(id,name,dienstnummer,username,active)'),
      supabase.from('profiles').select('id,name,dienstnummer,username,active').order('name'),
    ])
    if (sessionsRes.error || partsRes.error) {
      setError('Externes Training konnte nicht geladen werden.')
      setSessions([])
      setParticipations([])
    } else {
      setError('')
      setSessions((sessionsRes.data ?? []) as EinsatzTrainingSession[])
      const externIds = new Set((sessionsRes.data ?? []).map(s => s.id))
      setParticipations(
        ((partsRes.data ?? []) as EinsatzTrainingParticipation[]).filter(row => externIds.has(row.session_id)),
      )
    }
    setModules((modulesRes.data ?? []) as EinsatzTrainingModule[])
    setCompletions((completionsRes.data ?? []) as EinsatzTrainingCompletion[])
    setOfficers((profilesRes.data ?? []) as OfficerOption[])
    setLoading(false)
  }

  useEffect(() => {
    load().catch(() => {
      setError('Externes Training konnte nicht geladen werden.')
      setLoading(false)
    })
  }, [])

  const officerChoices = useMemo(() => officers.filter(o => o.active), [officers])
  const sessionById = useMemo(() => new Map(sessions.map(s => [s.id, s])), [sessions])

  const assignmentHint = useMemo(() => {
    if (!officerId || !moduleId) return null
    const module = modules.find(m => m.id === moduleId)
    return moduleAssignmentBlockReason({
      officerId,
      moduleId,
      moduleName: module?.name,
      completions,
    })
  }, [officerId, moduleId, modules, completions])

  function openForm() {
    setSessionDate('')
    setSessionNote('')
    setOfficerId('')
    setModuleId('')
    setInterval('')
    setError('')
    setShowForm(true)
  }

  async function save() {
    if (!canManage) return
    const sessionResult = validateSession({ kind: 'extern', sessionDate, note: sessionNote })
    if (!sessionResult.ok) {
      setError(sessionResult.error)
      return
    }
    const module = modules.find(m => m.id === moduleId)
    const partResult = validateParticipation({
      sessionKind: 'extern',
      officerId,
      moduleId,
      moduleKind: module?.kind,
      intervalLabel: interval,
      attendanceStatus: null,
      completions,
      moduleName: module?.name,
    })
    if (!partResult.ok) {
      setError(partResult.error)
      return
    }
    setSaving(true)
    setError('')
    const { data: session, error: sessionError } = await supabase
      .from('einsatz_training_sessions')
      .insert({ ...sessionResult.payload, created_by: profile?.id ?? null })
      .select('id')
      .single()
    if (sessionError || !session) {
      setError(sessionError?.message || 'Anlegen fehlgeschlagen.')
      setSaving(false)
      return
    }
    const { error: partError } = await supabase.from('einsatz_training_participations').insert({
      session_id: session.id,
      officer_id: partResult.payload.officer_id,
      module_id: partResult.payload.module_id,
      interval_label: partResult.payload.interval_label,
      created_by: profile?.id ?? null,
    })
    if (partError) {
      await supabase.from('einsatz_training_sessions').delete().eq('id', session.id)
      setError(
        isModuleLockDbError(partError.message)
          ? moduleLockUserMessage(module?.name)
          : (partError.message || 'Zuweisung fehlgeschlagen.'),
      )
      setSaving(false)
      return
    }
    logAudit('Externes Einsatztraining erfasst', `${module?.name ?? moduleId} ${sessionResult.payload.session_date}`)
    setShowForm(false)
    setSaving(false)
    try {
      await load()
    } catch {
      setError('Gespeichert, Liste konnte nicht aktualisiert werden.')
    }
  }

  async function remove(row: EinsatzTrainingParticipation) {
    if (!canManage) return
    if (!window.confirm('Teilnahme wirklich entfernen? Der Modul-Abschluss entfällt damit.')) return
    const { error: deleteError } = await supabase.from('einsatz_training_participations').delete().eq('id', row.id)
    if (deleteError) {
      setError(deleteError.message || 'Entfernen fehlgeschlagen.')
      return
    }
    const others = participations.filter(p => p.session_id === row.session_id && p.id !== row.id)
    if (others.length === 0) {
      await supabase.from('einsatz_training_sessions').delete().eq('id', row.session_id)
    }
    try {
      await load()
    } catch {
      setError('Entfernt, Liste konnte nicht aktualisiert werden.')
    }
  }

  const options = officerId
    ? moduleAssignmentOptions({ officerId, kind: 'extern', modules, completions })
    : modules.filter(m => m.active).map(module => ({ module, blocked: false, reason: null }))

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500">
          Externe Teilnahmen gegen angelegte Module. Taktung {cadenceLabel('extern')}.
          Bereits abgeschlossene Module sind gesperrt.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={openForm}
            className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Teilnahme</span>
          </button>
        )}
      </div>

      {error && !showForm && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" />
        </div>
      ) : participations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-8">
          <p className="text-sm text-gray-500">Noch keine externen Teilnahmen erfasst.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Datum</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Polizist</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Modul</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Intervall</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {participations.map(row => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {formatCompletedOn(sessionById.get(row.session_id)?.session_date)}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{officerDisplayName(row.officer)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.module?.name ?? '–'}</td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{row.interval_label || '–'}</td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => { void remove(row) }}
                          className="p-2 hover:bg-red-50 rounded-md text-red-400 hover:text-red-600"
                          title="Entfernen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Externe Teilnahme</h2>
              <button type="button" onClick={() => { setShowForm(false); setSaving(false) }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-ext-date">Datum *</label>
                <input
                  id="et-ext-date"
                  type="date"
                  className={inputClass}
                  value={sessionDate}
                  onChange={e => setSessionDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-ext-officer">Polizist *</label>
                <select
                  id="et-ext-officer"
                  className={inputClass}
                  value={officerId}
                  onChange={e => { setOfficerId(e.target.value); setModuleId('') }}
                >
                  <option value="">Bitte wählen</option>
                  {officerChoices.map(o => (
                    <option key={o.id} value={o.id}>{officerDisplayName(o)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-ext-module">Modul *</label>
                <select
                  id="et-ext-module"
                  className={inputClass}
                  value={moduleId}
                  onChange={e => setModuleId(e.target.value)}
                >
                  <option value="">Bitte wählen</option>
                  {options.map(opt => (
                    <option key={opt.module.id} value={opt.module.id} disabled={opt.blocked}>
                      {opt.blocked ? `${opt.module.name} — bereits abgeschlossen` : opt.module.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-ext-interval">Intervall</label>
                <input
                  id="et-ext-interval"
                  className={inputClass}
                  value={interval}
                  onChange={e => setInterval(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-ext-note">Hinweis</label>
                <input
                  id="et-ext-note"
                  className={inputClass}
                  value={sessionNote}
                  onChange={e => setSessionNote(e.target.value)}
                />
              </div>
              {assignmentHint && (
                <p className="text-sm text-amber-800 bg-amber-50 px-3 py-2 rounded-lg">{assignmentHint}</p>
              )}
              {error && showForm && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button type="button" onClick={() => { setShowForm(false); setSaving(false) }} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => { void save() }}
                disabled={saving || Boolean(assignmentHint)}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60"
              >
                {saving ? 'Speichern...' : 'Erfassen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
