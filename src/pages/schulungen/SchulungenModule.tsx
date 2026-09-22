import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { useAuth } from '../../contexts/AuthContext'
import type { SchulungCompletion, SchulungModule } from '../../lib/types'
import { formatCompletedOn, validateSchulungModuleName } from '../../lib/schulungen'
import { OFFICER_LIST_PROFILE_SELECT, isPortalAdminProfile } from '../../lib/portalAdmin'
import { loadErrorMessage, withTimeout } from '../../lib/loadTimeout'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

export default function SchulungenModulePanel({ canManage }: { canManage: boolean }) {
  const { profile } = useAuth()
  const [items, setItems] = useState<SchulungModule[]>([])
  const [completions, setCompletions] = useState<SchulungCompletion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [{ data, error: loadError }, { data: completionRows, error: completionError }] = await withTimeout(Promise.all([
        supabase.from('schulungen_module').select('*').order('name'),
        supabase.from('schulungen_completions').select(`*, officer:profiles!officer_id(${OFFICER_LIST_PROFILE_SELECT})`),
      ]))
      const failures: string[] = []
      if (loadError) failures.push('Module')
      if (completionError) failures.push('Abschlüsse')
      setError(failures.length > 0 ? `Nicht alles konnte geladen werden (${failures.join(', ')}).` : '')
      setItems(loadError ? [] : ((data ?? []) as SchulungModule[]))
      setCompletions(completionError ? [] : ((completionRows ?? []) as SchulungCompletion[]))
    } catch (err) {
      setError(loadErrorMessage(err, 'Module konnten nicht geladen werden.'))
      setItems([])
      setCompletions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const audienceCompletions = useMemo(() => completions.filter(row => !isPortalAdminProfile(row.officer)), [completions])
  const completionCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of audienceCompletions) counts.set(row.module_id, (counts.get(row.module_id) ?? 0) + 1)
    return counts
  }, [audienceCompletions])
  const ownStatus = useMemo(() => {
    if (!profile?.id) return new Map<string, string | undefined>()
    const map = new Map<string, string | undefined>()
    for (const row of completions) {
      if (row.officer_id === profile.id) map.set(row.module_id, row.completed_on)
    }
    return map
  }, [completions, profile])

  function openNew() {
    setEditId(null)
    setName('')
    setActive(true)
    setError('')
    setShowForm(true)
  }
  function openEdit(item: SchulungModule) {
    setEditId(item.id)
    setName(item.name)
    setActive(item.active)
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
    const nameError = validateSchulungModuleName(name)
    if (nameError) {
      setError(nameError)
      return
    }
    setSaving(true)
    setError('')
    const payload = { name: name.trim(), active }
    const { error: saveError } = editId
      ? await supabase.from('schulungen_module').update(payload).eq('id', editId)
      : await supabase.from('schulungen_module').insert({ ...payload, created_by: profile?.id ?? null })
    setSaving(false)
    if (saveError) {
      setError(saveError.message || 'Speichern fehlgeschlagen.')
      return
    }
    logAudit(editId ? 'Schulungsmodul bearbeitet' : 'Schulungsmodul angelegt', payload.name)
    closeForm()
    await load()
  }

  async function remove(item: SchulungModule) {
    if (!canManage) return
    if (!window.confirm(`Modul „${item.name}“ wirklich löschen? Verknüpfte Termine/Anmeldungen müssen vorher entfernt werden.`)) return
    setDeletingId(item.id)
    setError('')
    const { error: deleteError } = await supabase.from('schulungen_module').delete().eq('id', item.id)
    if (deleteError) {
      setError(deleteError.message || 'Modul konnte nicht gelöscht werden (evtl. noch in Verwendung).')
      setDeletingId(null)
      return
    }
    logAudit('Schulungsmodul gelöscht', item.name)
    if (editId === item.id) closeForm()
    setDeletingId(null)
    await load()
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500">Was geschult werden muss.</p>
        {canManage && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Neues Modul</span>
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
      ) : items.length === 0 && error ? (
        <div className="bg-white rounded-xl border border-red-200 px-5 py-8 text-center">
          <p className="text-sm text-red-700">Module konnten nicht geladen werden.</p>
          <button type="button" onClick={() => { void load() }} className="mt-3 text-sm font-medium text-blue-800 hover:underline">
            Erneut versuchen
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-8">
          <p className="text-sm text-gray-500">Noch keine Module.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Modul</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">
                  {canManage ? 'Abschlüsse' : 'Mein Stand'}
                </th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => {
                const ownCompletedOn = ownStatus.get(item.id)
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                    <td className="px-4 py-3 text-gray-700">{item.active ? 'Aktiv' : 'Inaktiv'}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {canManage
                        ? (completionCount.get(item.id) ?? 0)
                        : ownStatus.has(item.id)
                          ? `Abgeschlossen${ownCompletedOn ? ` am ${formatCompletedOn(ownCompletedOn)}` : ''}`
                          : 'Offen'}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button type="button" onClick={() => openEdit(item)} className="p-2 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900" title="Bearbeiten">
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editId ? 'Modul bearbeiten' : 'Neues Modul'}</h2>
              <button type="button" onClick={closeForm} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="schulung-mod-name">Name *</label>
                <input id="schulung-mod-name" className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="z. B. Erste Hilfe" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                Aktiv (zuweisbar / ausgeschrieben)
              </label>
              {error && showForm && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
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
