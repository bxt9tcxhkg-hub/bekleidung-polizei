import { useEffect, useState } from 'react'
import { Pencil, Check, X, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Profile, UserBudget } from '../lib/types'

const CURRENT_YEAR = new Date().getFullYear()
const DEFAULT_BUDGET = 350

interface UserRow {
  profile: Profile
  budget: UserBudget | null
  used: number
}

export default function Budgets() {
  const [rows, setRows] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [bulkValue, setBulkValue] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)

  async function load() {
    setLoading(true)
    const [profilesRes, budgetsRes, ordersRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('active', true).order('name'),
      supabase.from('user_budgets').select('*').eq('year', CURRENT_YEAR),
      supabase.from('orders')
        .select('user_id, unit_price, quantity')
        .not('status', 'in', '("pending","cancelled")')
        .gte('created_at', `${CURRENT_YEAR}-01-01`),
    ])

    const profiles = profilesRes.data ?? []
    const budgets = budgetsRes.data ?? []
    const orders = ordersRes.data ?? []

    const usedByUser: Record<string, number> = {}
    for (const o of orders) {
      usedByUser[o.user_id] = (usedByUser[o.user_id] ?? 0) + o.unit_price * o.quantity
    }

    setRows(profiles.map(p => ({
      profile: p,
      budget: budgets.find(b => b.user_id === p.id) ?? null,
      used: usedByUser[p.id] ?? 0,
    })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function saveEdit(userId: string) {
    const val = parseFloat(editValue.replace(',', '.'))
    if (isNaN(val) || val < 0) return
    setSaving(true)
    await supabase.from('user_budgets').upsert(
      { user_id: userId, year: CURRENT_YEAR, total_budget: val },
      { onConflict: 'user_id,year' }
    )
    setSaving(false)
    setEditId(null)
    load()
  }

  async function saveBulk() {
    const val = parseFloat(bulkValue.replace(',', '.'))
    if (isNaN(val) || val < 0) return
    setBulkSaving(true)
    await Promise.all(
      rows.map(r =>
        supabase.from('user_budgets').upsert(
          { user_id: r.profile.id, year: CURRENT_YEAR, total_budget: val },
          { onConflict: 'user_id,year' }
        )
      )
    )
    setBulkSaving(false)
    setShowBulk(false)
    setBulkValue('')
    load()
  }

  async function resetToDefault(userId: string) {
    await supabase.from('user_budgets').upsert(
      { user_id: userId, year: CURRENT_YEAR, total_budget: DEFAULT_BUDGET },
      { onConflict: 'user_id,year' }
    )
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budgetverwaltung {CURRENT_YEAR}</h1>
          <p className="text-gray-500 text-sm mt-1">Jahresbudget pro Benutzer – Standard: € {DEFAULT_BUDGET.toFixed(2)}</p>
        </div>
        <button onClick={() => setShowBulk(true)}
          className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
          <RefreshCw className="w-4 h-4" /> Alle anpassen
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Benutzer</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Dienstnummer</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Gesamtbudget</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Verbraucht</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Verbleibend</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ profile, budget, used }) => {
                const total = budget?.total_budget ?? DEFAULT_BUDGET
                const remaining = total - used
                const pct = Math.min(100, (used / total) * 100)
                return (
                  <tr key={profile.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{profile.name}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{profile.dienstnummer ?? '–'}</td>
                    <td className="px-4 py-3 text-right">
                      {editId === profile.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-gray-500">€</span>
                          <input
                            type="number" step="0.01" min="0"
                            className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(profile.id); if (e.key === 'Escape') setEditId(null) }}
                            autoFocus
                          />
                          <button onClick={() => saveEdit(profile.id)} disabled={saving} className="p-1 hover:bg-green-50 rounded text-green-600"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditId(null)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><X className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <span className={budget ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                          € {total.toFixed(2)}{!budget && ' *'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div>
                        <span className={`font-medium ${pct > 90 ? 'text-red-600' : pct > 70 ? 'text-amber-600' : 'text-gray-700'}`}>
                          € {used.toFixed(2)}
                        </span>
                        <div className="h-1.5 bg-gray-100 rounded-full mt-1 w-20 ml-auto">
                          <div className={`h-full rounded-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      € {remaining.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => { setEditId(profile.id); setEditValue(total.toFixed(2)) }}
                          className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {budget && budget.total_budget !== DEFAULT_BUDGET && (
                          <button onClick={() => resetToDefault(profile.id)} title="Auf Standard zurücksetzen"
                            className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-700">
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 px-4 py-2 border-t">* Standardwert (kein individuelles Budget gesetzt)</p>
        </div>
      )}

      {/* Bulk modal */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Alle Budgets anpassen</h2>
              <p className="text-xs text-gray-500 mt-1">Setzt das Budget für alle {rows.length} aktiven Benutzer</p>
            </div>
            <div className="px-6 py-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Neues Jahresbudget (€)</label>
              <input type="number" step="0.01" min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={bulkValue} onChange={e => setBulkValue(e.target.value)}
                placeholder={DEFAULT_BUDGET.toFixed(2)} autoFocus />
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => { setShowBulk(false); setBulkValue('') }} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={saveBulk} disabled={!bulkValue || bulkSaving}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {bulkSaving ? 'Wird gespeichert...' : 'Für alle setzen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
