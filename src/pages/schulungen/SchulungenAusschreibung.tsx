import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { useAuth } from '../../contexts/AuthContext'
import type {
  SchulungAssignment,
  SchulungCompletion,
  SchulungModule,
  SchulungRegistration,
  SchulungSession,
  Profile,
} from '../../lib/types'
import {
  canSelfRegisterSchulung,
  officerMatchesSearch,
  officersForSchulungPicker,
  formatCompletedOn,
  selfRegisterBlockReasonSchulung,
  validateSchulungSession,
} from '../../lib/schulungen'
import { officerDisplayName } from '../../lib/personalEinsatzmittel'
import { OFFICER_LIST_PROFILE_SELECT, excludeAdminsFromOfficerList, isPortalAdminProfile, type PortalAdminProfile } from '../../lib/portalAdmin'
import { loadErrorMessage, withTimeout } from '../../lib/loadTimeout'

type OfficerOption = Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'organisation' | 'active' | 'roles'> & Pick<Partial<Profile>, 'admin'> & PortalAdminProfile

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

function OfficerEnrollPicker({ sessionId, officers, disabled, onEnroll }: {
  sessionId: string
  officers: OfficerOption[]
  disabled: boolean
  onEnroll: (officer: OfficerOption) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [pickedId, setPickedId] = useState('')
  const filtered = officers.filter(officer => officerMatchesSearch(officer, query))
  const picked = officers.find(officer => officer.id === pickedId) ?? null

  function choose(officer: OfficerOption) {
    setPickedId(officer.id)
    setQuery(officerDisplayName(officer))
    setOpen(false)
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 mt-2">
      <div className="relative flex-1 min-w-0">
        <label className="sr-only" htmlFor={`schulung-enroll-${sessionId}`}>Person suchen</label>
        <input
          id={`schulung-enroll-${sessionId}`}
          type="text"
          className={inputClass}
          placeholder="Name oder Dienstnummer…"
          disabled={disabled || officers.length === 0}
          value={query}
          onChange={e => { setQuery(e.target.value); setPickedId(''); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && filtered.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
            {filtered.map(officer => (
              <li key={officer.id}>
                <button type="button" onMouseDown={() => choose(officer)} className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors">
                  <p className="text-sm font-medium text-gray-900">{officerDisplayName(officer)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        disabled={disabled || !picked}
        onClick={() => { if (!picked) return; onEnroll(picked); setQuery(''); setPickedId('') }}
        className="bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white text-sm font-medium px-3 py-2 rounded-lg"
      >
        Anmelden
      </button>
    </div>
  )
}

/** Vereinheitlichte Teilnahme je Termin: bestätigte Anmeldung oder noch offener Vorschlag. */
type SessionParticipant = {
  id: string
  session_id: string
  officer_id: string
  officer?: OfficerOption
  confirmed: boolean
  assignmentId?: string
}

export default function SchulungenAusschreibungPanel({ canManage }: { canManage: boolean }) {
  const { profile } = useAuth()
  const [sessions, setSessions] = useState<SchulungSession[]>([])
  const [modules, setModules] = useState<SchulungModule[]>([])
  const [completions, setCompletions] = useState<SchulungCompletion[]>([])
  const [registrations, setRegistrations] = useState<SchulungRegistration[]>([])
  const [assignments, setAssignments] = useState<SchulungAssignment[]>([])
  const [officers, setOfficers] = useState<OfficerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [sessionDate, setSessionDate] = useState('')
  const [sessionNote, setSessionNote] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [capacity, setCapacity] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [sessRes, modRes, compRes, regRes, assignRes, profRes] = await withTimeout(Promise.all([
        supabase.from('schulungen_sessions').select('*, module:schulungen_module(id,name,active)').eq('announced', true).order('session_date', { ascending: true }),
        supabase.from('schulungen_module').select('*').eq('active', true).order('name'),
        supabase.from('schulungen_completions').select('*'),
        canManage
          ? supabase.from('schulungen_registrations').select(`*, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`)
          : supabase.from('schulungen_registrations').select(`*, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`).eq('officer_id', profile?.id ?? ''),
        canManage
          ? supabase.from('schulungen_assignments').select(`*, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`).eq('status', 'vorschlag').not('session_id', 'is', null)
          : supabase.from('schulungen_assignments').select(`*, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`).eq('status', 'vorschlag').eq('officer_id', profile?.id ?? ''),
        canManage
          ? supabase.from('profiles').select(OFFICER_LIST_PROFILE_SELECT).order('name')
          : Promise.resolve({ data: [] as OfficerOption[], error: null }),
      ]))
      const failures: string[] = []
      if (sessRes.error) failures.push('Ausschreibungen')
      if (modRes.error) failures.push('Module')
      if (compRes.error) failures.push('Abschlüsse')
      if (regRes.error) failures.push('Anmeldungen')
      if (assignRes.error) failures.push('Vorschläge')
      if (profRes.error) failures.push('Personen')
      setError(failures.length > 0 ? `Nicht alles konnte geladen werden (${failures.join(', ')}).` : '')
      setSessions(sessRes.error ? [] : ((sessRes.data ?? []) as SchulungSession[]))
      setModules(modRes.error ? [] : ((modRes.data ?? []) as SchulungModule[]))
      setCompletions(compRes.error ? [] : ((compRes.data ?? []) as SchulungCompletion[]))
      setRegistrations(regRes.error ? [] : ((regRes.data ?? []) as SchulungRegistration[]))
      setAssignments(assignRes.error ? [] : ((assignRes.data ?? []) as SchulungAssignment[]))
      setOfficers(profRes.error ? [] : excludeAdminsFromOfficerList((profRes.data ?? []) as OfficerOption[]))
    } catch (err) {
      setError(loadErrorMessage(err, 'Ausschreibungen konnten nicht geladen werden.'))
      setSessions([])
      setModules([])
      setCompletions([])
      setRegistrations([])
      setAssignments([])
      setOfficers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [canManage, profile?.id])

  const regsBySession = useMemo(() => {
    const map = new Map<string, SessionParticipant[]>()
    for (const row of registrations) {
      const list = map.get(row.session_id) ?? []
      list.push({ id: row.id, session_id: row.session_id, officer_id: row.officer_id, officer: row.officer, confirmed: true })
      map.set(row.session_id, list)
    }
    for (const row of assignments) {
      if (!row.session_id) continue
      const list = map.get(row.session_id) ?? []
      list.push({ id: row.id, session_id: row.session_id, officer_id: row.officer_id, officer: row.officer, confirmed: false, assignmentId: row.id })
      map.set(row.session_id, list)
    }
    return map
  }, [registrations, assignments])

  function openForm() {
    setEditingId(null)
    setSessionDate('')
    setSessionNote('')
    setModuleId(modules[0]?.id ?? '')
    setCapacity('')
    setError('')
    setShowForm(true)
  }

  function openEdit(session: SchulungSession) {
    setEditingId(session.id)
    setSessionDate(session.session_date)
    setSessionNote(session.note ?? '')
    setModuleId(session.module_id ?? '')
    setCapacity(session.capacity != null ? String(session.capacity) : '')
    setError('')
    setShowForm(true)
  }

  async function save() {
    if (!canManage) return
    const result = validateSchulungSession({ moduleId, sessionDate, note: sessionNote, capacity, announced: true })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSaving(true)
    setError('')
    const { error: saveError } = editingId
      ? await supabase.from('schulungen_sessions').update(result.payload).eq('id', editingId)
      : await supabase.from('schulungen_sessions').insert({ ...result.payload, created_by: profile?.id ?? null })
    if (saveError) {
      setError(saveError.message || (editingId ? 'Ändern fehlgeschlagen.' : 'Anlegen fehlgeschlagen.'))
      setSaving(false)
      return
    }
    const module = modules.find(m => m.id === moduleId)
    logAudit(
      editingId ? 'Schulungs-Ausschreibung geändert' : 'Schulung ausgeschrieben',
      `${module?.name ?? moduleId} ${result.payload.session_date}`,
    )
    setShowForm(false)
    setEditingId(null)
    setSaving(false)
    try {
      await load()
    } catch {
      setError('Gespeichert, Liste konnte nicht aktualisiert werden.')
    }
  }

  function enrollBlockReason(session: SchulungSession, officerId: string) {
    const regs = regsBySession.get(session.id) ?? []
    const isOwn = Boolean(profile?.id && officerId === profile.id)
    return selfRegisterBlockReasonSchulung({
      officerId,
      moduleId: session.module_id,
      completions,
      announced: session.announced,
      capacity: session.capacity,
      registrationCount: regs.length,
      alreadyRegistered: regs.some(r => r.officer_id === officerId),
      isOwnRegistration: isOwn,
      isManagerEnrollment: canManage && !isOwn,
    })
  }

  function registerHint(session: SchulungSession) {
    if (!profile?.id) return 'Bitte anmelden, um sich einzutragen.'
    return enrollBlockReason(session, profile.id)
  }

  async function proposeAssignment(session: SchulungSession, officerId: string, auditAction: string, auditDetails: string) {
    if (!profile?.id) return
    setBusyId(session.id)
    setError('')
    const { error: insertError } = await supabase.from('schulungen_assignments').insert({
      officer_id: officerId,
      module_id: session.module_id,
      session_id: session.id,
      proposed_by: profile.id,
    })
    if (insertError) {
      setError(insertError.message || 'Vorschlag fehlgeschlagen.')
      setBusyId(null)
      return
    }
    logAudit(auditAction, auditDetails)
    setBusyId(null)
    await load()
  }

  async function register(session: SchulungSession) {
    if (!profile?.id) return
    const hint = registerHint(session)
    if (hint) {
      setError(hint)
      return
    }
    await proposeAssignment(session, profile.id, 'Schulungsanmeldung vorgeschlagen', `${session.module?.name ?? session.module_id} ${session.session_date}`)
  }

  async function enrollOfficer(session: SchulungSession, officer: OfficerOption) {
    if (!canManage) return
    const hint = enrollBlockReason(session, officer.id)
    if (hint) {
      setError(hint)
      return
    }
    const isOwn = officer.id === profile?.id
    await proposeAssignment(
      session,
      officer.id,
      isOwn ? 'Schulungsanmeldung vorgeschlagen' : 'Schulungsanmeldung durch Sachbearbeiter vorgeschlagen',
      `${officerDisplayName(officer)} · ${session.module?.name ?? session.module_id} ${session.session_date}`,
    )
  }

  async function unregisterParticipant(session: SchulungSession, participant: SessionParticipant) {
    const isOwn = participant.officer_id === profile?.id
    if (!isOwn && !canManage) return
    setBusyId(session.id)
    setError('')
    const { error: deleteError } = participant.confirmed
      ? await supabase.from('schulungen_registrations').delete().eq('session_id', session.id).eq('officer_id', participant.officer_id)
      : await supabase.from('schulungen_assignments').delete().eq('id', participant.assignmentId ?? participant.id)
    if (deleteError) {
      setError(deleteError.message || 'Abmeldung fehlgeschlagen.')
      setBusyId(null)
      return
    }
    if (canManage && !isOwn) {
      const officer = officers.find(row => row.id === participant.officer_id) ?? participant.officer
      logAudit(
        participant.confirmed ? 'Schulungsabmeldung durch Sachbearbeiter' : 'Schulungsvorschlag durch Sachbearbeiter zurückgezogen',
        `${officerDisplayName(officer)} · ${session.module?.name ?? session.module_id} ${session.session_date}`,
      )
    }
    setBusyId(null)
    await load()
  }

  async function unregister(session: SchulungSession) {
    if (!profile?.id) return
    const participant = (regsBySession.get(session.id) ?? []).find(row => row.officer_id === profile.id)
    if (!participant) return
    await unregisterParticipant(session, participant)
  }


  async function removeSession(session: SchulungSession) {
    if (!canManage) return
    const label = `${formatCompletedOn(session.session_date)} · ${session.module?.name ?? 'Ausschreibung'}`
    if (!window.confirm(`Ausschreibung „${label}“ wirklich löschen? Verknüpfte Anmeldungen müssen vorher einzeln entfernt werden.`)) return
    setBusyId(session.id)
    setError('')
    const { error: deleteError } = await supabase.from('schulungen_sessions').delete().eq('id', session.id)
    if (deleteError) {
      setError(deleteError.message || 'Ausschreibung konnte nicht gelöscht werden.')
      setBusyId(null)
      return
    }
    logAudit('Schulungs-Ausschreibung gelöscht', label)
    setBusyId(null)
    await load()
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500">{canManage ? 'Anmeldung nur ohne Abschluss. Personen hier eintragen.' : 'Anmeldung nur ohne Abschluss.'}</p>
        {canManage && (
          <button type="button" onClick={openForm} className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Ausschreiben</span>
          </button>
        )}
      </div>

      {error && !showForm && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" />
        </div>
      ) : sessions.length === 0 && error ? (
        <div className="bg-white rounded-xl border border-red-200 px-5 py-8 text-center">
          <p className="text-sm text-red-700">Ausschreibungen konnten nicht geladen werden.</p>
          <button type="button" onClick={() => { void load() }} className="mt-3 text-sm font-medium text-blue-800 hover:underline">
            Erneut versuchen
          </button>
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-8">
          <p className="text-sm text-gray-500">Noch kein Schulungsprogramm ausgeschrieben.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => {
            const module = session.module ?? modules.find(m => m.id === session.module_id)
            const regs = regsBySession.get(session.id) ?? []
            const ownParticipant = regs.find(r => r.officer_id === profile?.id)
            const own = Boolean(profile?.id && ownParticipant)
            const confirmedCount = regs.filter(r => r.confirmed).length
            const pendingCount = regs.length - confirmedCount
            const hint = registerHint(session)
            const allowed = canSelfRegisterSchulung({
              officerId: profile?.id ?? '',
              moduleId: session.module_id,
              completions,
              announced: session.announced,
              capacity: session.capacity,
              registrationCount: regs.length,
              alreadyRegistered: own,
              isOwnRegistration: true,
            })
            const pickerOfficers = officersForSchulungPicker({ officers, registeredIds: new Set(regs.map(row => row.officer_id)) })
            const capacityFull = session.capacity != null && regs.length >= session.capacity
            return (
              <div key={session.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{formatCompletedOn(session.session_date)} · {module?.name ?? 'Modul'}</p>
                    {session.note && <p className="text-sm text-gray-500 mt-1">{session.note}</p>}
                    <p className="text-sm text-gray-500 mt-1">
                      {confirmedCount} Anmeldung{confirmedCount === 1 ? '' : 'en'}
                      {pendingCount > 0 ? ` · ${pendingCount} Vorschlag${pendingCount === 1 ? '' : 'e'}` : ''}
                      {session.capacity != null ? ` / ${session.capacity}` : ''}
                    </p>
                    {canManage && regs.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {regs.filter(row => !isPortalAdminProfile(row.officer)).map(row => (
                          <li key={row.id} className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                            <span className="min-w-0 truncate">{officerDisplayName(row.officer)}</span>
                            {!row.confirmed && (
                              // Entscheidung erfolgt zentral auf der Seite "Genehmigungen" (Freigaben).
                              <span className="shrink-0 text-xs text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">Wartet auf Genehmigung (Freigaben)</span>
                            )}
                            <button type="button" disabled={busyId === session.id} onClick={() => { void unregisterParticipant(session, row) }} className="shrink-0 text-xs text-red-700 hover:underline disabled:opacity-60">
                              Entfernen
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!canManage && own && (
                      <p className={`text-sm mt-1 ${ownParticipant?.confirmed ? 'text-green-800' : 'text-amber-800'}`}>
                        {ownParticipant?.confirmed ? 'Du bist angemeldet.' : 'Dein Vorschlag wartet auf Genehmigung.'}
                      </p>
                    )}
                    {!own && hint && <p className="text-xs text-amber-800 mt-1">{hint}</p>}
                    {canManage && capacityFull && (own || !hint) && <p className="text-xs text-amber-800 mt-1">Keine freien Plätze mehr.</p>}
                    {canManage && !capacityFull && (
                      <OfficerEnrollPicker sessionId={session.id} officers={pickerOfficers} disabled={busyId === session.id} onEnroll={officer => { void enrollOfficer(session, officer) }} />
                    )}
                  </div>
                  <div className="flex gap-2">
                    {canManage && (
                      <button
                        type="button"
                        disabled={busyId === session.id}
                        onClick={() => openEdit(session)}
                        className="border border-gray-300 text-gray-700 p-2 rounded-lg hover:bg-gray-50 disabled:opacity-60"
                        title="Ausschreibung bearbeiten"
                        aria-label="Ausschreibung bearbeiten"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        disabled={busyId === session.id}
                        onClick={() => { void removeSession(session) }}
                        className="border border-red-200 text-red-700 p-2 rounded-lg hover:bg-red-50 disabled:opacity-60"
                        title="Ausschreibung löschen"
                        aria-label="Ausschreibung löschen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {own ? (
                      <button type="button" disabled={busyId === session.id} onClick={() => { void unregister(session) }} className="border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-60">
                        {ownParticipant?.confirmed ? 'Abmelden' : 'Vorschlag zurückziehen'}
                      </button>
                    ) : (
                      <button type="button" disabled={busyId === session.id || !allowed} onClick={() => { void register(session) }} className="bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white text-sm font-medium px-3 py-2 rounded-lg">
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
              <h2 className="font-bold text-gray-900">{editingId ? 'Ausschreibung bearbeiten' : 'Schulung ausschreiben'}</h2>
              <button type="button" onClick={() => { setShowForm(false); setSaving(false); setEditingId(null) }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="schulung-off-date">Datum *</label>
                <input id="schulung-off-date" type="date" className={inputClass} value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="schulung-off-module">Modul *</label>
                <select id="schulung-off-module" className={inputClass} value={moduleId} onChange={e => setModuleId(e.target.value)}>
                  <option value="">Bitte wählen</option>
                  {modules.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="schulung-off-cap">Kapazität</label>
                <input id="schulung-off-cap" className={inputClass} value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="optional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="schulung-off-note">Hinweis</label>
                <input id="schulung-off-note" className={inputClass} value={sessionNote} onChange={e => setSessionNote(e.target.value)} />
              </div>
              {error && showForm && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button type="button" onClick={() => { setShowForm(false); setSaving(false); setEditingId(null) }} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">
                Abbrechen
              </button>
              <button type="button" onClick={() => { void save() }} disabled={saving} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Speichern...' : editingId ? 'Speichern' : 'Ausschreiben'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
