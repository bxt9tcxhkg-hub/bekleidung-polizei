import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { useAuth } from '../../contexts/AuthContext'
import type { PoolEinsatzmittel } from '../../lib/types'
import {
  POOL_EM_CATEGORIES,
  POOL_EM_CATEGORY_LABELS,
  POOL_EM_FIELDS,
  VERWAHRUNGSORTE,
  VERWAHRUNGSORT_LABELS,
  canManagePoolEinsatzmittel,
  emptyPoolEmFormValues,
  formValuesFromPoolRecord,
  isPoolEmCategory,
  poolEmDetailText,
  poolEmFieldKind,
  poolEmFieldLabel,
  validatePoolEm,
  type PoolEmCategory,
  type PoolEmFormValues,
} from '../../lib/poolEinsatzmittel'

type CategoryFilter = 'all' | PoolEmCategory

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

export default function PoolEinsatzmittelPanel() {
  const { profile, isStrictAdmin, areaRoles } = useAuth()
  const canManage = canManagePoolEinsatzmittel({ isStrictAdmin, rows: areaRoles })

  const [items, setItems] = useState<PoolEinsatzmittel[]>([])
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [category, setCategory] = useState<PoolEmCategory>('langwaffe_stg77')
  const [verwahrungsort, setVerwahrungsort] = useState('')
  const [values, setValues] = useState<PoolEmFormValues>(emptyPoolEmFormValues())
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('pool_einsatzmittel')
      .select('*')
      .order('created_at', { ascending: false })
    if (loadError) {
      setError('Pool-Einsatzmittel konnten nicht geladen werden.')
      setItems([])
    } else {
      setError('')
      setItems((data ?? []) as PoolEinsatzmittel[])
    }
    setLoading(false)
  }

  useEffect(() => {
    load().catch(() => {
      setError('Pool-Einsatzmittel konnten nicht geladen werden.')
      setLoading(false)
    })
  }, [])

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter(item => item.category === filter)),
    [items, filter],
  )

  function openNew() {
    setEditId(null)
    setCategory('langwaffe_stg77')
    setVerwahrungsort('')
    setValues(emptyPoolEmFormValues())
    setError('')
    setShowForm(true)
  }

  function openEdit(item: PoolEinsatzmittel) {
    setEditId(item.id)
    setCategory(item.category)
    setVerwahrungsort(item.verwahrungsort)
    setValues(formValuesFromPoolRecord(item))
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
    const result = validatePoolEm({ category, verwahrungsort, values })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSaving(true)
    setError('')
    if (editId) {
      const { error: updateError } = await supabase
        .from('pool_einsatzmittel')
        .update(result.payload)
        .eq('id', editId)
      if (updateError) {
        setError(updateError.message || 'Speichern fehlgeschlagen.')
        setSaving(false)
        return
      }
      logAudit('Pool-Einsatzmittel bearbeitet', `${POOL_EM_CATEGORY_LABELS[result.payload.category]}`)
    } else {
      const { error: insertError } = await supabase
        .from('pool_einsatzmittel')
        .insert({ ...result.payload, created_by: profile?.id ?? null })
      if (insertError) {
        setError(insertError.message || 'Anlegen fehlgeschlagen.')
        setSaving(false)
        return
      }
      logAudit('Pool-Einsatzmittel angelegt', `${POOL_EM_CATEGORY_LABELS[result.payload.category]}`)
    }
    closeForm()
    try {
      await load()
    } catch {
      setError('Gespeichert, Liste konnte nicht aktualisiert werden.')
    }
  }

  async function remove(item: PoolEinsatzmittel) {
    if (!canManage) return
    if (!window.confirm(`Eintrag «${POOL_EM_CATEGORY_LABELS[item.category]}» wirklich entfernen?`)) return
    const { error: deleteError } = await supabase.from('pool_einsatzmittel').delete().eq('id', item.id)
    if (deleteError) {
      setError(deleteError.message || 'Löschen fehlgeschlagen.')
      return
    }
    logAudit('Pool-Einsatzmittel entfernt', POOL_EM_CATEGORY_LABELS[item.category])
    try {
      await load()
    } catch {
      setError('Entfernt, Liste konnte nicht aktualisiert werden.')
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pool-Einsatzmittel</h2>
          <p className="text-sm text-gray-500 mt-1">
            {canManage ? 'Gemeinsame Ausrüstung mit Verwahrungsort' : 'Nur Leserecht'}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Neuer Eintrag</span>
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
        {POOL_EM_CATEGORIES.map(id => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-all ${
              filter === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {POOL_EM_CATEGORY_LABELS[id]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-8">
          <p className="text-sm text-gray-500">Keine Pool-Einsatzmittel erfasst.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Kategorie</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Verwahrungsort</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Angaben</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {POOL_EM_CATEGORY_LABELS[item.category]}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {VERWAHRUNGSORT_LABELS[item.verwahrungsort]}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                    {poolEmDetailText(item) || '–'}
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
              <h2 className="font-bold text-gray-900">{editId ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</h2>
              <button type="button" onClick={closeForm} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="pool-category">Kategorie *</label>
                <select
                  id="pool-category"
                  className={inputClass}
                  value={category}
                  onChange={e => {
                    const next = e.target.value
                    if (isPoolEmCategory(next)) setCategory(next)
                  }}
                >
                  {POOL_EM_CATEGORIES.map(id => (
                    <option key={id} value={id}>{POOL_EM_CATEGORY_LABELS[id]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="pool-ort">Verwahrungsort *</label>
                <select
                  id="pool-ort"
                  className={inputClass}
                  value={verwahrungsort}
                  onChange={e => setVerwahrungsort(e.target.value)}
                >
                  <option value="">Bitte wählen</option>
                  {VERWAHRUNGSORTE.map(id => (
                    <option key={id} value={id}>{VERWAHRUNGSORT_LABELS[id]}</option>
                  ))}
                </select>
              </div>
              {POOL_EM_FIELDS[category].map(field => {
                const kind = poolEmFieldKind(field)
                const label = poolEmFieldLabel(field, category)
                return (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={`pool-${field}`}>{label}</label>
                    <input
                      id={`pool-${field}`}
                      className={inputClass}
                      type={kind === 'date' ? 'date' : kind === 'integer' ? 'number' : 'text'}
                      min={kind === 'integer' ? 0 : undefined}
                      step={kind === 'integer' ? 1 : undefined}
                      inputMode={kind === 'integer' ? 'numeric' : undefined}
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
    </div>
  )
}
