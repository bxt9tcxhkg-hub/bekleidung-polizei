import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { useAuth } from '../../contexts/AuthContext'
import type {
  EinsatzTrainingCompletion,
  EinsatzTrainingModule,
  EinsatzTrainingRegistration,
  EinsatzTrainingSession,
} from '../../lib/types'
import {
  canSelfRegister,
  formatCompletedOn,
  isModuleLockDbError,
  moduleFilterLabel,
  moduleLockUserMessage,
  selfRegisterBlockReason,
  validateSession,
} from '../../lib/einsatztraining'
import { officerDisplayName } from '../../lib/personalEinsatzmittel'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

export default function TrainingAusschreibungPanel({ canManage }: { canManage: boolean }) {
  const { profile } = useAuth()
  const [sessions, setSessions] = useState<EinsatzTrainingSession[]>([])
  const [modules, setModules] = useState<EinsatzTrainingModule[]>([])
  const [completions, setCompletions] = useState<EinsatzTrainingCompletion[]>([])
  const [registrations, setRegistrations] = useState<EinsatzTrainingRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [sessionDate, setSessionDate] = useState('')
  const [sessionNote, setSessionNote] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [capacity, setCapacity] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [sessRes, modRes, compRes, regRes] = await Promise.all([
      supabase
        .from('einsatz_training_sessions')
        .select('*, module:einsatz_training_modules(id,name,kind,module_type,schiesst,applies_to,period_year,period_half,active)')
        .eq('announced', true)
        .order('session_date', { ascending: true }),
      supabase.from('einsatz_training_modules').select('*').eq('active', true).order('name'),
      supabase.from('einsatz_training_completions').select('*'),
      canManage
        ? supabase.from('einsatz_training_registrations').select('*, officer:profiles!officer_id(id,name,dienstnummer,username,organisation)')
        : supabase.from('einsatz_training_registrations').select('*, officer:profiles!officer_id(id,name,dienstnummer,username,organisation)').eq('officer_id', profile?.id ?? ''),
    ])
    if (sessRes.error) {
      setError('Ausschreibungen konnten nicht geladen werden.')
      setSessions([])
    } else {
      setError('')
      setSessions((sessRes.data ?? []) as EinsatzTrainingSession[])
    }
    setModules((modRes.data ?? []) as EinsatzTrainingModule[])
    setCompletions((compRes.data ?? []) as EinsatzTrainingCompletion[])
    setRegistrations((regRes.data ?? []) as EinsatzTrainingRegistration[])
    setLoading(false)
  }

  useEffect(() => {
    load().catch(() => {
      setError('Ausschreibungen konnten nicht geladen werden.')
      setLoading(false)
    })
  }, [canManage, profile?.id])

  const regsBySession = useMemo(() => {
    const map = new Map<string, EinsatzTrainingRegistration[]>()
    for (const row of registrations) {
      const list = map.get(row.session_id) ?? []
      list.push(row)
      map.set(row.session_id, list)
    }
    return map
  }, [registrations])

  function openForm() {
    setSessionDate('')
    setSessionNote('')
    setModuleId(modules[0]?.id ?? '')
    setCapacity('')
    setError('')
    setShowForm(true)
  }

  async function save() {
    if (!canManage) return
    const module = modules.find(m => m.id === moduleId)
    const result = validateSession({
      kind: module?.kind ?? 'intern',
      sessionDate,
      note: sessionNote,
      moduleId,
      capacity,
      announced: true,
      module,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSaving(true)
    setError('')
    const { error: insertError } = await supabase
      .from('einsatz_training_sessions')
      .insert({ ...result.payload, created_by: profile?.id ?? null })
    if (insertError) {
      setError(insertError.message || 'Anlegen fehlgeschlagen.')
      setSaving(false)
      return
    }
    logAudit('Einsatztraining ausgeschrieben', `${module?.name ?? moduleId} ${result.payload.session_date}`)
    setShowForm(false)
    setSaving(false)
    try {
      await load()
    } catch {
      setError('Gespeichert, Liste konnte nicht aktualisiert werden.')
    }
  }

  function registerHint(session: EinsatzTrainingSession) {
    if (!profile?.id || !session.module_id) return 'Bitte anmelden, um sich einzutragen.'
    const module = session.module ?? modules.find(m => m.id === session.module_id)
    const regs = regsBySession.get(session.id) ?? []
    return selfRegisterBlockReason({
      officerId: profile.id,
      moduleId: session.module_id,
      moduleName: module?.name,
      module,
      officerOrganisation: profile.organisation,
      completions,
      announced: session.announced,
      capacity: session.capacity,
      registrationCount: regs.length,
      alreadyRegistered: regs.some(r => r.officer_id === profile.id),
      isOwnRegistration: true,
    })
  }

  async function register(session: EinsatzTrainingSession) {
    if (!profile?.id) return
    const hint = registerHint(session)
    if (hint) {
      setError(hint)
      return
    }
    setBusyId(session.id)
    setError('')
    const { error: insertError } = await supabase.from('einsatz_training_registrations').insert({
      session_id: session.id,
      officer_id: profile.id,
    })
    if (insertError) {
      setError(
        isModuleLockDbError(insertError.message)
          ? moduleLockUserMessage(session.module?.name)
          : (insertError.message || 'Anmeldung fehlgeschlagen.'),
      )
      setBusyId(null)
      return
    }
    logAudit('Einsatztraining-Anmeldung', `${session.module?.name ?? session.module_id} ${session.session_date}`)
    setBusyId(null)
    await load()
  }

  async function unregister(session: EinsatzTrainingSession) {
    if (!profile?.id) return
    setBusyId(session.id)
    setError('')
    const { error: deleteError } = await supabase
      .from('einsatz_training_registrations')
      .delete()
      .eq('session_id', session.id)
      .eq('officer_id', profile.id)
    if (deleteError) {
      setError(deleteError.message || 'Abmeldung fehlgeschlagen.')
      setBusyId(null)
      return
    }
    setBusyId(null)
    await load()
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500">
          Ausgeschriebene Trainingsprogramme. Selbstanmeldung nur, wenn das Modul noch nicht abgeschlossen ist.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={openForm}
            className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Ausschreiben</span>
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
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-8">
          <p className="text-sm text-gray-500">Noch kein Trainingsprogramm ausgeschrieben.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => {
            const module = session.module ?? modules.find(m => m.id === session.module_id)
            const regs = regsBySession.get(session.id) ?? []
            const own = Boolean(profile?.id && regs.some(r => r.officer_id === profile.id))
            const hint = registerHint(session)
            const allowed = canSelfRegister({
              officerId: profile?.id ?? '',
              moduleId: session.module_id ?? '',
              moduleName: module?.name,
              module,
              completions,
              announced: session.announced,
              capacity: session.capacity,
              registrationCount: regs.length,
              alreadyRegistered: own,
              isOwnRegistration: true,
            })
            return (
              <div key={session.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      {formatCompletedOn(session.session_date)} · {module ? moduleFilterLabel(module) : 'Modul'}
                    </p>
                    {session.note && <p className="text-sm text-gray-500 mt-1">{session.note}</p>}
                    <p className="text-sm text-gray-500 mt-1">
                      {regs.length} Anmeldung{regs.length === 1 ? '' : 'en'}
                      {session.capacity != null ? ` / ${session.capacity}` : ''}
                    </p>
                    {canManage && regs.length > 0 && (
                      <p className="text-sm text-gray-700 mt-1">
                        {regs.map(r => officerDisplayName(r.officer)).join(', ')}
                      </p>
                    )}
                    {!canManage && own && (
                      <p className="text-sm text-green-800 mt-1">Du bist angemeldet.</p>
                    )}
                    {!own && hint && (
                      <p className="text-xs text-amber-800 mt-1">{hint}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {own ? (
                      <button
                        type="button"
                        disabled={busyId === session.id}
                        onClick={() => { void unregister(session) }}
                        className="border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-60"
                      >
                        Abmelden
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === session.id || !allowed}
                        onClick={() => { void register(session) }}
                        className="bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white text-sm font-medium px-3 py-2 rounded-lg"
                      >
                        Anmelden
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Trainingsprogramm ausschreiben</h2>
              <button type="button" onClick={() => { setShowForm(false); setSaving(false) }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-off-date">Datum *</label>
                <input id="et-off-date" type="date" className={inputClass} value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-off-module">Modul *</label>
                <select id="et-off-module" className={inputClass} value={moduleId} onChange={e => setModuleId(e.target.value)}>
                  <option value="">Bitte wählen</option>
                  {modules.map(module => (
                    <option key={module.id} value={module.id}>{moduleFilterLabel(module)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-off-cap">Kapazität</label>
                <input id="et-off-cap" className={inputClass} value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="optional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-off-note">Hinweis</label>
                <input id="et-off-note" className={inputClass} value={sessionNote} onChange={e => setSessionNote(e.target.value)} />
              </div>
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
                disabled={saving}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60"
              >
                {saving ? 'Speichern...' : 'Ausschreiben'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
