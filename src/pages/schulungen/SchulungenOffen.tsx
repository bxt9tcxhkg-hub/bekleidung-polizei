import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { useAuth } from '../../contexts/AuthContext'
import type { SchulungAssignment, SchulungCompletion, SchulungModule } from '../../lib/types'
import { formatCompletedOn, officersCompletedForModule, officersOpenForModule } from '../../lib/schulungen'
import { officerDisplayName } from '../../lib/personalEinsatzmittel'
import { OFFICER_LIST_PROFILE_SELECT, excludeAdminsFromOfficerList, type PortalAdminProfile } from '../../lib/portalAdmin'
import { loadErrorMessage, withTimeout } from '../../lib/loadTimeout'
import type { Profile } from '../../lib/types'

type OfficerOption = Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active' | 'organisation' | 'roles'> & Pick<Partial<Profile>, 'admin'> & PortalAdminProfile

export default function SchulungenOffenPanel({ canManage }: { canManage: boolean }) {
  const [modules, setModules] = useState<SchulungModule[]>([])
  const [completions, setCompletions] = useState<SchulungCompletion[]>([])
  const [officers, setOfficers] = useState<OfficerOption[]>([])
  const [assignments, setAssignments] = useState<SchulungAssignment[]>([])
  const [moduleId, setModuleId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [proposingId, setProposingId] = useState<string | null>(null)
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null)
  const { profile } = useAuth()

  async function load() {
    setLoading(true)
    try {
      const [modRes, compRes, profRes, assignRes] = await withTimeout(Promise.all([
        supabase.from('schulungen_module').select('*').eq('active', true).order('name'),
        supabase.from('schulungen_completions').select(`*, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`),
        canManage ? supabase.from('profiles').select(OFFICER_LIST_PROFILE_SELECT).order('name') : Promise.resolve({ data: [] as OfficerOption[], error: null }),
        canManage
          ? supabase.from('schulungen_assignments').select(`*, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`).eq('status', 'vorschlag').is('session_id', null)
          : Promise.resolve({ data: [] as SchulungAssignment[], error: null }),
      ]))
      const failures: string[] = []
      if (modRes.error) failures.push('Module')
      if (compRes.error) failures.push('Abschlüsse')
      if (profRes.error) failures.push('Personen')
      if (assignRes.error) failures.push('Vorschläge')
      setError(failures.length > 0 ? `Nicht alles konnte geladen werden (${failures.join(', ')}).` : '')
      setModules(modRes.error ? [] : ((modRes.data ?? []) as SchulungModule[]))
      setCompletions(compRes.error ? [] : ((compRes.data ?? []) as SchulungCompletion[]))
      setOfficers(profRes.error ? [] : excludeAdminsFromOfficerList((profRes.data ?? []) as OfficerOption[]))
      setAssignments(assignRes.error ? [] : ((assignRes.data ?? []) as SchulungAssignment[]))
    } catch (err) {
      setError(loadErrorMessage(err, 'Offene Liste konnte nicht geladen werden.'))
      setModules([])
      setCompletions([])
      setOfficers([])
      setAssignments([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [canManage])

  const selected = modules.find(m => m.id === moduleId) ?? modules[0] ?? null
  const effectiveId = selected?.id ?? ''

  useEffect(() => {
    if (!moduleId && modules[0]) setModuleId(modules[0].id)
  }, [modules, moduleId])

  const open = useMemo(() => officersOpenForModule({ moduleId: effectiveId, officers, completions }), [effectiveId, officers, completions])
  const done = useMemo(() => officersCompletedForModule({ moduleId: effectiveId, officers, completions }), [effectiveId, officers, completions])
  const moduleAssignments = useMemo(() => assignments.filter(a => a.module_id === effectiveId), [assignments, effectiveId])

  async function proposeForModule(officerId: string) {
    if (!profile?.id || !selected) return
    setProposingId(officerId)
    setError('')
    const { error: insertError } = await supabase.from('schulungen_assignments').insert({
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
    logAudit('Schulungsvorschlag angelegt', `${officer ? officerDisplayName(officer) : officerId} · ${selected.name}`)
    await load()
  }

  async function withdrawProposal(assignment: SchulungAssignment) {
    if (!window.confirm('Diesen Schulungsvorschlag zurückziehen?')) return
    setWithdrawingId(assignment.id)
    setError('')
    const { error: deleteError } = await supabase.from('schulungen_assignments').delete().eq('id', assignment.id)
    setWithdrawingId(null)
    if (deleteError) {
      setError(deleteError.message || 'Vorschlag konnte nicht zurückgezogen werden.')
      return
    }
    logAudit('Schulungsvorschlag zurückgezogen', `${officerDisplayName(assignment.officer)} · ${selected?.name ?? assignment.module_id}`)
    await load()
  }

  if (!canManage) {
    return <p className="text-sm text-gray-500">Offene Liste nur für Sachbearbeitung.</p>
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">Offen laut Modul, ohne Abschluss.</p>
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" />
        </div>
      ) : modules.length === 0 && error ? (
        <div className="bg-white rounded-xl border border-red-200 px-5 py-8 text-center">
          <p className="text-sm text-red-700">Offene Liste konnte nicht geladen werden.</p>
          <button type="button" onClick={() => { void load() }} className="mt-3 text-sm font-medium text-blue-800 hover:underline">
            Erneut versuchen
          </button>
        </div>
      ) : modules.length === 0 ? (
        <p className="text-sm text-gray-500">Zuerst ein Modul anlegen.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="schulung-offen-modul">Modul</label>
            <select id="schulung-offen-modul" className="w-full max-w-xl border border-gray-300 rounded-lg px-3 py-2 text-sm" value={effectiveId} onChange={e => setModuleId(e.target.value)}>
              {modules.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 bg-gray-50 border-b">Offen ({open.length})</h3>
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
              <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 bg-gray-50 border-b">Abgeschlossen ({done.length})</h3>
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
            <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 bg-gray-50 border-b">Trainingsvorschläge ohne Termin ({moduleAssignments.length})</h3>
            {moduleAssignments.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">Keine offenen Vorschläge für dieses Modul.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {moduleAssignments.map(assignment => (
                  <li key={assignment.id} className="px-4 py-3 flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-800 min-w-0 truncate">{officerDisplayName(assignment.officer)}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      {/* Entscheidung erfolgt zentral auf der Seite "Genehmigungen" (Freigaben). */}
                      <span className="text-xs text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">Wartet auf Genehmiger (Freigaben)</span>
                      <button type="button" disabled={withdrawingId === assignment.id} onClick={() => { void withdrawProposal(assignment) }} className="text-xs text-red-700 hover:underline disabled:opacity-60">
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

    </div>
  )
}
