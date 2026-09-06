import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, UserPlus, Warehouse, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { useAuth } from '../../contexts/AuthContext'
import type { PersonalEinsatzmittel, Profile } from '../../lib/types'
import {
  PERSONAL_EM_CATEGORIES,
  PERSONAL_EM_CATEGORY_LABELS,
  PERSONAL_EM_FIELDS,
  canManagePersonalEinsatzmittel,
  emptyPersonalEmFormValues,
  formValuesFromRecord,
  formatIsoDate,
  isPersonalEmCategory,
  isPersonalEmInLager,
  officerDisplayName,
  personalEmDetailText,
  personalEmFieldKind,
  personalEmFieldLabel,
  personalEmLocationLabel,
  personalEmOfficerLabel,
  toPersonalLagerAssignment,
  validatePersonalEm,
  type PersonalEmCategory,
  type PersonalEmFormValues,
} from '../../lib/personalEinsatzmittel'
import { VERWAHRUNGSORTE, VERWAHRUNGSORT_LABELS } from '../../lib/verwahrungsort'
import {
  activeEinsatzmittel,
  ausbuchungPayload,
  formatRemovalReason,
  isEinsatzmittelRemoved,
  removedEinsatzmittel,
} from '../../lib/einsatzmittelAusbuchung'
import AusbuchungDialog from './AusbuchungDialog'

type CategoryFilter = 'all' | 'lager' | 'ausgebucht' | PersonalEmCategory

type OfficerOption = Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active'>

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

export default function PersonalEinsatzmittelPanel() {
  const { profile, isStrictAdmin, areaRoles } = useAuth()
  const canManage = canManagePersonalEinsatzmittel({ isStrictAdmin, rows: areaRoles })

  const [items, setItems] = useState<PersonalEinsatzmittel[]>([])
  const [officers, setOfficers] = useState<OfficerOption[]>([])
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [category, setCategory] = useState<PersonalEmCategory>('schutzweste')
  const [officerId, setOfficerId] = useState('')
  const [verwahrungsort, setVerwahrungsort] = useState('')
  const [values, setValues] = useState<PersonalEmFormValues>(emptyPersonalEmFormValues())
  const [saving, setSaving] = useState(false)
  const [ausbuchungItem, setAusbuchungItem] = useState<PersonalEinsatzmittel | null>(null)
  const [ausbuchungReason, setAusbuchungReason] = useState('')
  const [ausbuchungSaving, setAusbuchungSaving] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data, error: loadError }, { data: profileRows }] = await Promise.all([
      supabase
        .from('personal_einsatzmittel')
        .select('*, officer:profiles!officer_id(id,name,dienstnummer,username,active)')
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id,name,dienstnummer,username,active')
        .order('name'),
    ])
    if (loadError) {
      setError('Einsatzmittel konnten nicht geladen werden.')
      setItems([])
    } else {
      setError('')
      setItems((data ?? []) as PersonalEinsatzmittel[])
    }
    setOfficers((profileRows ?? []) as OfficerOption[])
    setLoading(false)
  }

  useEffect(() => {
    load().catch(() => {
      setError('Einsatzmittel konnten nicht geladen werden.')
      setLoading(false)
    })
  }, [])

  const visible = useMemo(() => {
    if (filter === 'ausgebucht') return removedEinsatzmittel(items)
    const active = activeEinsatzmittel(items)
    if (filter === 'all') return active
    if (filter === 'lager') return active.filter(isPersonalEmInLager)
    return active.filter(item => item.category === filter)
  }, [items, filter])

  const officerChoices = useMemo(() => {
    const active = officers.filter(o => o.active)
    const current = officers.find(o => o.id === officerId)
    if (current && !current.active) return [current, ...active]
    return active
  }, [officers, officerId])

  function openNew() {
    setEditId(null)
    setCategory('schutzweste')
    setOfficerId('')
    setVerwahrungsort('')
    setValues(emptyPersonalEmFormValues())
    setError('')
    setShowForm(true)
  }

  function openEdit(item: PersonalEinsatzmittel) {
    if (isEinsatzmittelRemoved(item)) return
    setEditId(item.id)
    setCategory(item.category)
    setOfficerId(item.officer_id ?? '')
    setVerwahrungsort(item.verwahrungsort ?? '')
    setValues(formValuesFromRecord(item))
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
    const result = validatePersonalEm({ category, officer_id: officerId, verwahrungsort, values })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSaving(true)
    setError('')
    if (editId) {
      const { error: updateError } = await supabase
        .from('personal_einsatzmittel')
        .update(result.payload)
        .eq('id', editId)
      if (updateError) {
        setError(updateError.message || 'Speichern fehlgeschlagen.')
        setSaving(false)
        return
      }
      logAudit('Persönliches Einsatzmittel bearbeitet', `${PERSONAL_EM_CATEGORY_LABELS[result.payload.category]}`)
    } else {
      const { error: insertError } = await supabase
        .from('personal_einsatzmittel')
        .insert({ ...result.payload, created_by: profile?.id ?? null })
      if (insertError) {
        setError(insertError.message || 'Anlegen fehlgeschlagen.')
        setSaving(false)
        return
      }
      logAudit('Persönliches Einsatzmittel angelegt', `${PERSONAL_EM_CATEGORY_LABELS[result.payload.category]}`)
    }
    closeForm()
    try {
      await load()
    } catch {
      setError('Gespeichert, Liste konnte nicht aktualisiert werden.')
    }
  }

  function openAusbuchung(item: PersonalEinsatzmittel) {
    if (!canManage || isEinsatzmittelRemoved(item)) return
    setAusbuchungItem(item)
    setAusbuchungReason('')
    setError('')
  }

  async function confirmAusbuchung() {
    if (!canManage || !ausbuchungItem) return
    const result = ausbuchungPayload({ reason: ausbuchungReason, removedBy: profile?.id ?? null })
    if (!result.ok || !result.payload) {
      setError(result.ok ? 'Ausbuchung fehlgeschlagen.' : result.error)
      return
    }
    setAusbuchungSaving(true)
    setError('')
    const { error: updateError } = await supabase
      .from('personal_einsatzmittel')
      .update(result.payload)
      .eq('id', ausbuchungItem.id)
      .is('removed_at', null)
    if (updateError) {
      setError(updateError.message || 'Ausbuchen fehlgeschlagen.')
      setAusbuchungSaving(false)
      return
    }
    logAudit('Persönliches Einsatzmittel ausgebucht', PERSONAL_EM_CATEGORY_LABELS[ausbuchungItem.category])
    setAusbuchungItem(null)
    setAusbuchungSaving(false)
    try {
      await load()
    } catch {
      setError('Ausgebucht, Liste konnte nicht aktualisiert werden.')
    }
  }

  async function moveToLager(item: PersonalEinsatzmittel) {
    if (!canManage || isEinsatzmittelRemoved(item)) return
    if (isPersonalEmInLager(item) && !item.officer_id) return
    if (!window.confirm(`«${PERSONAL_EM_CATEGORY_LABELS[item.category]}» ins Lager stellen? Die Zuweisung an den Polizisten wird aufgehoben.`)) return
    const { error: updateError } = await supabase
      .from('personal_einsatzmittel')
      .update(toPersonalLagerAssignment())
      .eq('id', item.id)
    if (updateError) {
      setError(updateError.message || 'Einlagern fehlgeschlagen.')
      return
    }
    logAudit('Persönliches Einsatzmittel eingelagert', PERSONAL_EM_CATEGORY_LABELS[item.category])
    try {
      await load()
    } catch {
      setError('Eingelagert, Liste konnte nicht aktualisiert werden.')
    }
  }

  function openAssign(item: PersonalEinsatzmittel) {
    openEdit(item)
    setOfficerId(item.officer_id ?? '')
    setVerwahrungsort(item.verwahrungsort ?? '')
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Persönliche Einsatzmittel</h2>
          <p className="text-sm text-gray-500 mt-1">
            {canManage
              ? 'Zuweisung an Polizistinnen und Polizisten oder Einlagerung (z. B. nach Austritt)'
              : 'Nur Leserecht'}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Neue Zuweisung</span>
          </button>
        )}
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
        <button
          type="button"
          onClick={() => setFilter('lager')}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-all ${
            filter === 'lager' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Im Lager
        </button>
        <button
          type="button"
          onClick={() => setFilter('ausgebucht')}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-all ${
            filter === 'ausgebucht' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Ausgebucht
        </button>
        {PERSONAL_EM_CATEGORIES.map(id => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-all ${
              filter === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {PERSONAL_EM_CATEGORY_LABELS[id]}
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
            {filter === 'ausgebucht'
              ? 'Keine ausgebuchten persönlichen Einsatzmittel.'
              : 'Keine persönlichen Einsatzmittel erfasst.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Kategorie</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Polizist</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Verwahrungsort</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">
                  {filter === 'ausgebucht' ? 'Ausbuchung' : 'Angaben'}
                </th>
                {canManage && filter !== 'ausgebucht' && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {PERSONAL_EM_CATEGORY_LABELS[item.category]}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{personalEmOfficerLabel(item.officer, item.officer_id)}</td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                    {personalEmLocationLabel(item.verwahrungsort)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                    {filter === 'ausgebucht'
                      ? `${formatIsoDate(item.removed_at)} · ${formatRemovalReason(item.removal_reason)}`
                      : (personalEmDetailText(item) || '–')}
                  </td>
                  {canManage && filter !== 'ausgebucht' && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {!(isPersonalEmInLager(item) && !item.officer_id) && (
                          <button
                            type="button"
                            onClick={() => { void moveToLager(item) }}
                            className="p-2 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900"
                            title="Ins Lager stellen"
                          >
                            <Warehouse className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!item.officer_id && (
                          <button
                            type="button"
                            onClick={() => openAssign(item)}
                            className="p-2 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900"
                            title="Polizisten zuweisen"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                          </button>
                        )}
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
                          onClick={() => openAusbuchung(item)}
                          className="px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md"
                          title="Aus Bestand entfernen"
                        >
                          Ausbuchen
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
              <h2 className="font-bold text-gray-900">{editId ? 'Zuweisung bearbeiten' : 'Neue Zuweisung'}</h2>
              <button type="button" onClick={closeForm} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="em-category">Kategorie *</label>
                <select
                  id="em-category"
                  className={inputClass}
                  value={category}
                  onChange={e => {
                    const next = e.target.value
                    if (isPersonalEmCategory(next)) setCategory(next)
                  }}
                >
                  {PERSONAL_EM_CATEGORIES.map(id => (
                    <option key={id} value={id}>{PERSONAL_EM_CATEGORY_LABELS[id]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="em-officer">
                  Polizist{verwahrungsort ? '' : ' *'}
                </label>
                <select
                  id="em-officer"
                  className={inputClass}
                  value={officerId}
                  onChange={e => setOfficerId(e.target.value)}
                >
                  <option value="">{verwahrungsort ? 'nicht zugewiesen' : 'Bitte wählen'}</option>
                  {officerChoices.map(o => (
                    <option key={o.id} value={o.id}>
                      {officerDisplayName(o)}{o.active ? '' : ' (inaktiv)'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="em-ort">
                  Verwahrungsort{officerId ? '' : ' *'}
                </label>
                <select
                  id="em-ort"
                  className={inputClass}
                  value={verwahrungsort}
                  onChange={e => setVerwahrungsort(e.target.value)}
                >
                  <option value="">{officerId ? 'Beim Polizisten' : 'Bitte wählen'}</option>
                  {VERWAHRUNGSORTE.map(ort => (
                    <option key={ort} value={ort}>{VERWAHRUNGSORT_LABELS[ort]}</option>
                  ))}
                </select>
              </div>
              {PERSONAL_EM_FIELDS[category].map(field => {
                const kind = personalEmFieldKind(field)
                const label = personalEmFieldLabel(field, category)
                return (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={`em-${field}`}>{label}</label>
                    <input
                      id={`em-${field}`}
                      className={inputClass}
                      type={kind === 'date' ? 'date' : kind === 'integer' ? 'number' : 'text'}
                      min={kind === 'integer' ? 0 : undefined}
                      step={kind === 'integer' ? 1 : undefined}
                      inputMode={kind === 'integer' ? 'numeric' : kind === 'month_year' ? 'numeric' : undefined}
                      placeholder={kind === 'month_year' ? 'MM/JJJJ' : undefined}
                      value={values[field]}
                      onChange={e => setValues(v => ({ ...v, [field]: e.target.value }))}
                    />
                  </div>
                )
              })}
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

      {ausbuchungItem && (
        <AusbuchungDialog
          itemLabel={PERSONAL_EM_CATEGORY_LABELS[ausbuchungItem.category]}
          reason={ausbuchungReason}
          onReasonChange={setAusbuchungReason}
          onCancel={() => { setAusbuchungItem(null); setAusbuchungSaving(false) }}
          onConfirm={() => { void confirmAusbuchung() }}
          saving={ausbuchungSaving}
          error={error && ausbuchungItem ? error : ''}
        />
      )}
    </div>
  )
}
