import { useEffect, useMemo, useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import BackLink from '../../components/BackLink'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import type { SchulungCompletion, SchulungModule, SchulungRegistration, SchulungSession } from '../../lib/types'
import { formatCompletedOn } from '../../lib/schulungen'
import { officerDisplayName } from '../../lib/personalEinsatzmittel'
import { OFFICER_LIST_PROFILE_SELECT, isPortalAdminProfile } from '../../lib/portalAdmin'
import { loadErrorMessage, withTimeout } from '../../lib/loadTimeout'

export default function SchulungenProtokollPanel({ canManage }: { canManage: boolean }) {
  const [sessions, setSessions] = useState<SchulungSession[]>([])
  const [modules, setModules] = useState<SchulungModule[]>([])
  const [registrations, setRegistrations] = useState<SchulungRegistration[]>([])
  const [completions, setCompletions] = useState<SchulungCompletion[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [sessRes, modRes, regRes, compRes] = await withTimeout(Promise.all([
        supabase.from('schulungen_sessions').select('*, module:schulungen_module(id,name,active)').order('session_date', { ascending: false }),
        supabase.from('schulungen_module').select('*').order('name'),
        supabase.from('schulungen_registrations').select(`*, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`),
        supabase.from('schulungen_completions').select('*'),
      ]))
      const failures: string[] = []
      if (sessRes.error) failures.push('Termine')
      if (modRes.error) failures.push('Module')
      if (regRes.error) failures.push('Anmeldungen')
      if (compRes.error) failures.push('Abschlüsse')
      setError(failures.length > 0 ? `Nicht alles konnte geladen werden (${failures.join(', ')}).` : '')
      setSessions(sessRes.error ? [] : ((sessRes.data ?? []) as SchulungSession[]))
      setModules(modRes.error ? [] : ((modRes.data ?? []) as SchulungModule[]))
      setRegistrations(regRes.error ? [] : ((regRes.data ?? []) as SchulungRegistration[]))
      setCompletions(compRes.error ? [] : ((compRes.data ?? []) as SchulungCompletion[]))
    } catch (err) {
      setError(loadErrorMessage(err, 'Termine konnten nicht geladen werden.'))
      setSessions([])
      setModules([])
      setRegistrations([])
      setCompletions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const selected = sessions.find(s => s.id === selectedId) ?? null
  const selectedModule = selected?.module ?? modules.find(m => m.id === selected?.module_id) ?? null
  const participants = useMemo(
    () => registrations.filter(row => row.session_id === selectedId && !isPortalAdminProfile(row.officer)),
    [registrations, selectedId],
  )

  async function toggleCompletion(row: SchulungRegistration) {
    if (!canManage || !selected) return
    const existing = completions.find(c => c.officer_id === row.officer_id && c.module_id === selected.module_id)
    setBusyId(row.id)
    setError('')
    if (existing) {
      const { error: deleteError } = await supabase.from('schulungen_completions').delete().eq('id', existing.id)
      if (deleteError) {
        setError(deleteError.message || 'Abschluss konnte nicht entfernt werden.')
        setBusyId(null)
        return
      }
      logAudit('Schulungsabschluss entfernt', `${officerDisplayName(row.officer)} · ${selectedModule?.name ?? selected.module_id}`)
    } else {
      const { error: insertError } = await supabase.from('schulungen_completions').insert({
        officer_id: row.officer_id,
        module_id: selected.module_id,
        session_id: selected.id,
        completed_on: selected.session_date,
      })
      if (insertError) {
        setError(insertError.message || 'Abschluss konnte nicht erfasst werden.')
        setBusyId(null)
        return
      }
      logAudit('Schulungsabschluss erfasst', `${officerDisplayName(row.officer)} · ${selectedModule?.name ?? selected.module_id}`)
    }
    setBusyId(null)
    await load()
  }

  if (!canManage) {
    return <p className="text-sm text-gray-500">Protokoll nur für Sachbearbeitung.</p>
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" />
      </div>
    )
  }

  if (selected) {
    return (
      <div>
        <BackLink onClick={() => setSelectedId(null)} label="Zurück zur Terminliste" className="mb-4" />
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-4">
          <p className="font-medium text-gray-900">{formatCompletedOn(selected.session_date)} · {selectedModule?.name ?? 'Modul'}</p>
          {selected.note && <p className="text-sm text-gray-500 mt-1">{selected.note}</p>}
        </div>
        {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
        {participants.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-8">
            <p className="text-sm text-gray-500">Keine Anmeldungen zu diesem Termin.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {participants.map(row => {
                const done = completions.some(c => c.officer_id === row.officer_id && c.module_id === selected.module_id)
                return (
                  <li key={row.id} className="px-4 py-3 flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-800 min-w-0 truncate">{officerDisplayName(row.officer)}</span>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => { void toggleCompletion(row) }}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-60 ${
                        done ? 'border border-red-200 text-red-700 hover:bg-red-50' : 'bg-blue-800 hover:bg-blue-900 text-white'
                      }`}
                    >
                      {done ? <><Trash2 className="w-3.5 h-3.5" /> Abschluss entfernen</> : <><Check className="w-3.5 h-3.5" /> Abschluss erfassen</>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">Termin wählen, um Abschlüsse zu erfassen.</p>
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
      {sessions.length === 0 && loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" />
        </div>
      ) : sessions.length === 0 && error ? (
        <div className="bg-white rounded-xl border border-red-200 px-5 py-8 text-center">
          <p className="text-sm text-red-700">Termine konnten nicht geladen werden.</p>
          <button type="button" onClick={() => { void load() }} className="mt-3 text-sm font-medium text-blue-800 hover:underline">
            Erneut versuchen
          </button>
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-8">
          <p className="text-sm text-gray-500">Noch keine Termine ausgeschrieben.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {sessions.map(session => {
              const module = session.module ?? modules.find(m => m.id === session.module_id)
              const count = registrations.filter(r => r.session_id === session.id && !isPortalAdminProfile(r.officer)).length
              return (
                <li key={session.id}>
                  <button type="button" onClick={() => setSelectedId(session.id)} className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-medium text-gray-900">{formatCompletedOn(session.session_date)} · {module?.name ?? 'Modul'}</span>
                      <span className="text-sm text-gray-500 block">{count} Anmeldung{count === 1 ? '' : 'en'}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
