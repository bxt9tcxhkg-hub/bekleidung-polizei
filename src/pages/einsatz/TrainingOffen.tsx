import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type {
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
import { generateOffenAnmeldungenPdf } from '../../lib/einsatzPdf'
import PdfExportButton from './PdfExportButton'

type OfficerOption = Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active' | 'organisation'>

export default function TrainingOffenPanel({ canManage }: { canManage: boolean }) {
  const { profile } = useAuth()
  const [modules, setModules] = useState<EinsatzTrainingModule[]>([])
  const [completions, setCompletions] = useState<EinsatzTrainingCompletion[]>([])
  const [officers, setOfficers] = useState<OfficerOption[]>([])
  const [sessions, setSessions] = useState<EinsatzTrainingSession[]>([])
  const [registrations, setRegistrations] = useState<EinsatzTrainingRegistration[]>([])
  const [moduleId, setModuleId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const [modRes, compRes, profRes, sessRes, regRes] = await Promise.all([
      supabase.from('einsatz_training_modules').select('*').eq('active', true).order('name'),
      supabase.from('einsatz_training_completions').select('*, officer:profiles!officer_id(id,name,dienstnummer,username,organisation)'),
      supabase.from('profiles').select('id,name,dienstnummer,username,active,organisation').order('name'),
      supabase.from('einsatz_training_sessions').select('*').eq('announced', true).order('session_date', { ascending: true }),
      canManage
        ? supabase.from('einsatz_training_registrations').select('*, officer:profiles!officer_id(id,name,dienstnummer,username,organisation)')
        : supabase.from('einsatz_training_registrations').select('*, officer:profiles!officer_id(id,name,dienstnummer,username,organisation)').eq('officer_id', profile?.id ?? ''),
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
      setOfficers((profRes.data ?? []) as OfficerOption[])
    }
    setSessions((sessRes.data ?? []) as EinsatzTrainingSession[])
    setRegistrations((regRes.data ?? []) as EinsatzTrainingRegistration[])
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

  if (!canManage) {
    return (
      <p className="text-sm text-gray-500">
        Die offene Liste ist für die Sachbearbeitung und den Kommandanten.
      </p>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500">
          Offen = aktive Mitglieder gemäß Geltung des Moduls ohne Abschluss.
          Geltung setzt der Sachbearbeiter: Polizei, Parkaufsicht oder Alle.
          Export für Kommandant / Dienstplan.
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
                  .filter(r => r.session_id === session.id)
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
                  {open.map(row => (
                    <li key={row.id} className="px-4 py-2 text-sm text-gray-800">
                      {officerDisplayName(row)}
                    </li>
                  ))}
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
                  const regs = registrations.filter(r => r.session_id === session.id)
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
        </div>
      )}
    </div>
  )
}
