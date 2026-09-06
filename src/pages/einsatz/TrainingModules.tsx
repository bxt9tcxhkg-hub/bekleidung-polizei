import { useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { useAuth } from '../../contexts/AuthContext'
import type { EinsatzTrainingCompletion, EinsatzTrainingModule } from '../../lib/types'
import {
  SCHIESSEN_LABEL,
  TRAINING_APPLIES_TO,
  TRAINING_APPLIES_TO_LABELS,
  TRAINING_ET_CLASSES,
  TRAINING_ET_CLASS_LABELS,
  appliesToLabel,
  currentHalfYear,
  etClassCadenceLabel,
  etClassFromModule,
  etClassLabel,
  formatCompletedOn,
  isTrainingAppliesTo,
  isTrainingEtClass,
  moduleFilterLabel,
  officerHasCompletedModule,
  periodLabel,
  trainingModuleDeleteConfirm,
  trainingModuleDeleteUserMessage,
  validateTrainingModule,
  type TrainingAppliesTo,
  type TrainingEtClass,
} from '../../lib/einsatztraining'
import { planOfficialModuleUpserts } from '../../lib/officialTrainingModules'
import { officerDisplayName } from '../../lib/personalEinsatzmittel'
import { OFFICER_LIST_PROFILE_SELECT, isPortalAdminProfile } from '../../lib/portalAdmin'
import { generateTrainingModulesPdf } from '../../lib/einsatzPdf'
import PdfExportButton from './PdfExportButton'

type ClassFilter = 'all' | TrainingEtClass

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

export default function TrainingModulesPanel({ canManage }: { canManage: boolean }) {
  const { profile } = useAuth()
  const [items, setItems] = useState<EinsatzTrainingModule[]>([])
  const [completions, setCompletions] = useState<EinsatzTrainingCompletion[]>([])
  const [filter, setFilter] = useState<ClassFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [etClass, setEtClass] = useState<TrainingEtClass>('intern')
  const [appliesTo, setAppliesTo] = useState<TrainingAppliesTo>('polizei')
  const [active, setActive] = useState(true)
  const [schiesst, setSchiesst] = useState(false)
  const current = currentHalfYear()
  const [periodYear, setPeriodYear] = useState(String(current.year))
  const [periodHalf, setPeriodHalf] = useState<'1' | '2'>(String(current.half) as '1' | '2')
  const [saving, setSaving] = useState(false)
  const [ensuring, setEnsuring] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data, error: loadError }, { data: completionRows }] = await Promise.all([
      supabase.from('einsatz_training_modules').select('*').order('name'),
      supabase
        .from('einsatz_training_completions')
        .select(`officer_id, module_id, completed_on, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`),
    ])
    if (loadError) {
      setError('Module konnten nicht geladen werden.')
      setItems([])
    } else {
      setError('')
      setItems((data ?? []) as EinsatzTrainingModule[])
    }
    setCompletions((completionRows ?? []) as EinsatzTrainingCompletion[])
    setLoading(false)
  }

  useEffect(() => {
    load().catch(() => {
      setError('Module konnten nicht geladen werden.')
      setLoading(false)
    })
  }, [])

  const visible = useMemo(
    () => items.filter(item => filter === 'all' || etClassFromModule(item) === filter),
    [items, filter],
  )

  const audienceCompletions = useMemo(
    () => completions.filter(row => !isPortalAdminProfile(row.officer)),
    [completions],
  )

  const completionCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of audienceCompletions) {
      counts.set(row.module_id, (counts.get(row.module_id) ?? 0) + 1)
    }
    return counts
  }, [audienceCompletions])

  const ownStatus = useMemo(() => {
    if (!profile?.id) return []
    return visible.map(module => ({
      module,
      completed: officerHasCompletedModule(completions, profile.id, module.id, module),
      completedOn: completions.find(row => row.officer_id === profile.id && row.module_id === module.id)?.completed_on,
    }))
  }, [visible, completions, profile])

  function openNew() {
    const now = currentHalfYear()
    setEditId(null)
    setName('')
    setEtClass('intern')
    setAppliesTo('polizei')
    setActive(true)
    setSchiesst(false)
    setPeriodYear(String(now.year))
    setPeriodHalf(String(now.half) as '1' | '2')
    setError('')
    setShowForm(true)
  }

  function openEdit(item: EinsatzTrainingModule) {
    const now = currentHalfYear()
    setEditId(item.id)
    setName(item.name)
    setEtClass(etClassFromModule(item))
    setAppliesTo(isTrainingAppliesTo(item.applies_to) ? item.applies_to : 'polizei')
    setActive(item.active)
    setSchiesst(item.schiesst)
    setPeriodYear(String(item.period_year ?? now.year))
    setPeriodHalf(String(item.period_half ?? now.half) as '1' | '2')
    setError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
    setSaving(false)
  }

  async function save() {
    if (!canManage) return
    const result = validateTrainingModule({
      name,
      etClass,
      appliesTo,
      active,
      schiesst,
      periodYear,
      periodHalf,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSaving(true)
    setError('')
    if (editId) {
      const { error: updateError } = await supabase
        .from('einsatz_training_modules')
        .update(result.payload)
        .eq('id', editId)
      if (updateError) {
        setError(updateError.message || 'Speichern fehlgeschlagen.')
        setSaving(false)
        return
      }
      logAudit('Einsatztraining-Modul bearbeitet', `${result.payload.name} (${etClassFromModule(result.payload)})`)
    } else {
      const { error: insertError } = await supabase
        .from('einsatz_training_modules')
        .insert({ ...result.payload, created_by: profile?.id ?? null })
      if (insertError) {
        setError(insertError.message || 'Anlegen fehlgeschlagen.')
        setSaving(false)
        return
      }
      logAudit('Einsatztraining-Modul angelegt', `${result.payload.name} (${etClassFromModule(result.payload)})`)
    }
    closeForm()
    try {
      await load()
    } catch {
      setError('Gespeichert, Liste konnte nicht aktualisiert werden.')
    }
  }

  async function ensureOfficial() {
    if (!canManage) return
    setEnsuring(true)
    setError('')
    const plan = planOfficialModuleUpserts(items)
    for (const module of plan.inserts) {
      const { error: insertError } = await supabase
        .from('einsatz_training_modules')
        .insert({
          name: module.name,
          kind: module.kind,
          module_type: module.moduleType,
          schiesst: module.schiesst,
          applies_to: module.appliesTo,
          period_year: module.period_year,
          period_half: module.period_half,
          active: true,
          created_by: profile?.id ?? null,
        })
      if (insertError) {
        setError(insertError.message || 'Offizielle Module konnten nicht angelegt werden.')
        setEnsuring(false)
        return
      }
    }
    for (const row of plan.reactivations) {
      const { error: updateError } = await supabase
        .from('einsatz_training_modules')
        .update({
          active: true,
          name: row.name,
          module_type: row.moduleType,
          kind: row.kind,
          applies_to: row.appliesTo,
        })
        .eq('id', row.id)
      if (updateError) {
        setError(updateError.message || 'Offizielle Module konnten nicht aktiviert werden.')
        setEnsuring(false)
        return
      }
    }
    logAudit('Offizielle Einsatztraining-Module sichergestellt', `${plan.inserts.length} neu, ${plan.reactivations.length} aktiviert`)
    setEnsuring(false)
    try {
      await load()
    } catch {
      setError('Gespeichert, Liste konnte nicht aktualisiert werden.')
    }
  }

  async function remove(item: EinsatzTrainingModule) {
    if (!canManage) return
    if (!window.confirm(trainingModuleDeleteConfirm(item.name))) return
    setDeletingId(item.id)
    setError('')
    const { error: deleteError } = await supabase
      .from('einsatz_training_modules')
      .delete()
      .eq('id', item.id)
    if (deleteError) {
      setError(trainingModuleDeleteUserMessage(deleteError, item.name))
      setDeletingId(null)
      return
    }
    logAudit('Einsatztraining-Modul gelöscht', `${item.name} (${etClassFromModule(item)})`)
    if (editId === item.id) closeForm()
    setDeletingId(null)
    try {
      await load()
    } catch {
      setError('Gelöscht, Liste konnte nicht aktualisiert werden.')
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500">
          Geltung: Polizei, Parkaufsicht oder Alle.
        </p>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <PdfExportButton
            disabled={loading}
            onClick={() => generateTrainingModulesPdf({
              modules: visible.map(item => ({
                name: item.name,
                kind: item.kind,
                moduleType: item.module_type,
                etClass: etClassFromModule(item),
                appliesTo: item.applies_to,
                schiesst: item.schiesst,
                periodLabel: etClassFromModule(item) === 'intern' && item.period_year && item.period_half
                  ? periodLabel(item.period_year, item.period_half)
                  : undefined,
                active: item.active,
                completionCount: completionCount.get(item.id) ?? 0,
              })),
              completions: audienceCompletions.flatMap(row => {
                const module = items.find(m => m.id === row.module_id)
                if (!module) return []
                if (filter !== 'all' && etClassFromModule(module) !== filter) return []
                return [{
                  officerName: officerDisplayName(row.officer),
                  moduleName: module.name,
                  kind: module.kind,
                  moduleType: module.module_type,
                  etClass: etClassFromModule(module),
                  completedOn: row.completed_on,
                }]
              }),
            })}
          />
          {canManage && (
            <button
              type="button"
              onClick={() => { void ensureOfficial() }}
              disabled={ensuring}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg hover:bg-gray-50 disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              <span className="hidden sm:inline">{ensuring ? 'Übernehme...' : 'Offizielle Module'}</span>
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={openNew}
              className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Neues Modul</span>
            </button>
          )}
        </div>
      </div>

      {error && !showForm && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit max-w-full flex-wrap">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-all ${
            filter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Alle
        </button>
        {TRAINING_ET_CLASSES.map(id => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-all ${
              filter === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {TRAINING_ET_CLASS_LABELS[id]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-8">
          <p className="text-sm text-gray-500">
            Noch keine Module.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Modul</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Art</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Geltung</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">{SCHIESSEN_LABEL}</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">
                  {canManage ? 'Abschlüsse' : 'Mein Stand'}
                </th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map(item => {
                const own = ownStatus.find(row => row.module.id === item.id)
                const art = etClassFromModule(item)
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{moduleFilterLabel(item)}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <div>{etClassLabel(item)}</div>
                      <div className="text-xs text-gray-500">{etClassCadenceLabel(art)}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 hidden sm:table-cell">{appliesToLabel(item.applies_to)}</td>
                    <td className="px-4 py-3 text-gray-700 hidden sm:table-cell">{item.schiesst ? 'Ja' : 'Nein'}</td>
                    <td className="px-4 py-3 text-gray-700">{item.active ? 'Aktiv' : 'Inaktiv'}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {canManage
                        ? (completionCount.get(item.id) ?? 0)
                        : own?.completed
                          ? `Abgeschlossen${own.completedOn ? ` am ${formatCompletedOn(own.completedOn)}` : ''}`
                          : 'Offen'}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="p-2 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900"
                            title="Bearbeiten"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { void remove(item) }}
                            disabled={deletingId === item.id}
                            className="p-2 hover:bg-red-50 rounded-md text-red-400 hover:text-red-600 disabled:opacity-60"
                            title="Löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editId ? 'Modul bearbeiten' : 'Neues Modul'}</h2>
              <button type="button" onClick={closeForm} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-mod-name">Name *</label>
                <input
                  id="et-mod-name"
                  className={inputClass}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Bezeichnung durch die Dienststelle"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-mod-art">Art *</label>
                <select
                  id="et-mod-art"
                  className={inputClass}
                  value={etClass}
                  onChange={e => {
                    if (isTrainingEtClass(e.target.value)) setEtClass(e.target.value)
                  }}
                >
                  {TRAINING_ET_CLASSES.map(id => (
                    <option key={id} value={id}>
                      {TRAINING_ET_CLASS_LABELS[id]} ({etClassCadenceLabel(id)})
                    </option>
                  ))}
                </select>
              </div>
              {etClass === 'intern' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-mod-year">Jahr *</label>
                    <input
                      id="et-mod-year"
                      className={inputClass}
                      inputMode="numeric"
                      value={periodYear}
                      onChange={e => setPeriodYear(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-mod-half">Halbjahr *</label>
                    <select
                      id="et-mod-half"
                      className={inputClass}
                      value={periodHalf}
                      onChange={e => {
                        if (e.target.value === '1' || e.target.value === '2') setPeriodHalf(e.target.value)
                      }}
                    >
                      <option value="1">1. Halbjahr</option>
                      <option value="2">2. Halbjahr</option>
                    </select>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="et-mod-geltung">Geltung *</label>
                <select
                  id="et-mod-geltung"
                  className={inputClass}
                  value={appliesTo}
                  onChange={e => {
                    if (isTrainingAppliesTo(e.target.value)) setAppliesTo(e.target.value)
                  }}
                >
                  {TRAINING_APPLIES_TO.map(id => (
                    <option key={id} value={id}>{TRAINING_APPLIES_TO_LABELS[id]}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={schiesst} onChange={e => setSchiesst(e.target.checked)} />
                {SCHIESSEN_LABEL} (Munition aus dem Pool möglich)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                Aktiv (zuweisbar / ausgeschrieben)
              </label>
              {error && showForm && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button type="button" onClick={closeForm} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => { void save() }}
                disabled={saving}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60"
              >
                {saving ? 'Speichern...' : editId ? 'Speichern' : 'Anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
