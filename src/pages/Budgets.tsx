import { useEffect, useState } from 'react'
import { Pencil, Check, X, RefreshCw, Plus, CalendarClock, Footprints } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Profile, UserBudget, ShoeRefundCap } from '../lib/types'

const CURRENT_YEAR = new Date().getFullYear()
const DEFAULT_BUDGET = 350
const today = () => new Date().toISOString().split('T')[0]

interface UserRow {
  profile: Profile
  currentBudget: UserBudget | null
  scheduledBudget: UserBudget | null
  used: number
}

export default function Budgets() {
  const { profile: authProfile } = useAuth()
  const [rows, setRows] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ amount: '', valid_from: today() })
  const [saving, setSaving] = useState(false)
  const [bulkForm, setBulkForm] = useState({ amount: '', valid_from: today() })
  const [showBulk, setShowBulk] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)

  // Shoe refund cap
  const [caps, setCaps] = useState<ShoeRefundCap[]>([])
  const [showCapForm, setShowCapForm] = useState(false)
  const [capForm, setCapForm] = useState({ amount: '', valid_from: today(), note: '' })
  const [capSaving, setCapSaving] = useState(false)

  async function load() {
    setLoading(true)
    const t = today()
    const [profilesRes, budgetsRes, ordersRes, capsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('active', true).order('name'),
      supabase.from('user_budgets').select('*').eq('year', CURRENT_YEAR).order('valid_from', { ascending: false }),
      supabase.from('orders')
        .select('user_id, unit_price, quantity')
        .not('status', 'in', '("pending","cancelled")')
        .gte('created_at', `${CURRENT_YEAR}-01-01`),
      supabase.from('shoe_refund_caps').select('*').order('valid_from', { ascending: false }),
    ])

    const profiles = profilesRes.data ?? []
    const budgets = budgetsRes.data ?? []
    const orders = ordersRes.data ?? []
    setCaps((capsRes.data ?? []) as ShoeRefundCap[])

    const usedByUser: Record<string, number> = {}
    for (const o of orders) {
      usedByUser[o.user_id] = (usedByUser[o.user_id] ?? 0) + o.unit_price * o.quantity
    }

    setRows(profiles.map(p => {
      const userBudgets = budgets.filter(b => b.user_id === p.id)
      const current = userBudgets.find(b => b.valid_from <= t) ?? null
      const scheduled = userBudgets.find(b => b.valid_from > t) ?? null
      return { profile: p, currentBudget: current, scheduledBudget: scheduled, used: usedByUser[p.id] ?? 0 }
    }))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function saveBudget(userId: string) {
    const val = parseFloat(editForm.amount.replace(',', '.'))
    if (isNaN(val) || val < 0) return
    setSaving(true)
    await supabase.from('user_budgets').upsert(
      { user_id: userId, year: CURRENT_YEAR, total_budget: val, valid_from: editForm.valid_from },
      { onConflict: 'user_id,year,valid_from' }
    )
    setSaving(false)
    setEditId(null)
    load()
  }

  async function saveBulk() {
    const val = parseFloat(bulkForm.amount.replace(',', '.'))
    if (isNaN(val) || val < 0) return
    setBulkSaving(true)
    await Promise.all(
      rows.map(r =>
        supabase.from('user_budgets').upsert(
          { user_id: r.profile.id, year: CURRENT_YEAR, total_budget: val, valid_from: bulkForm.valid_from },
          { onConflict: 'user_id,year,valid_from' }
        )
      )
    )
    setBulkSaving(false)
    setShowBulk(false)
    setBulkForm({ amount: '', valid_from: today() })
    load()
  }

  async function saveCap() {
    const val = parseFloat(capForm.amount.replace(',', '.'))
    if (isNaN(val) || val < 0) return
    setCapSaving(true)
    await supabase.from('shoe_refund_caps').insert({
      cap_amount: val,
      valid_from: capForm.valid_from,
      note: capForm.note || null,
      created_by: authProfile!.id,
    })
    setCapSaving(false)
    setShowCapForm(false)
    setCapForm({ amount: '', valid_from: today(), note: '' })
    load()
  }

  const currentCap = caps.find(c => c.valid_from <= today())
  const scheduledCap = caps.find(c => c.valid_from > today())

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Budgetverwaltung {CURRENT_YEAR}</h1>
        <p className="text-gray-500 text-sm mt-1">Jahresbudget und Schuherstattung verwalten</p>
      </div>

      {/* Shoe refund cap card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="bg-teal-100 p-2 rounded-lg"><Footprints className="w-4 h-4 text-teal-700" /></div>
            <div>
              <p className="font-semibold text-gray-900">Schuherstattung Maximalbetrag</p>
              <p className="text-xs text-gray-500">Globale Obergrenze für alle Benutzer</p>
            </div>
          </div>
          <button onClick={() => { setShowCapForm(true); setCapForm({ amount: String(currentCap?.cap_amount ?? 120), valid_from: today(), note: '' }) }}
            className="flex items-center gap-1.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Änderung planen
          </button>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <p className="text-3xl font-bold text-gray-900">€ {Number(currentCap?.cap_amount ?? 120).toFixed(2)}</p>
            {currentCap && <p className="text-xs text-gray-400 mt-0.5">gültig seit {new Date(currentCap.valid_from).toLocaleDateString('de-AT')}</p>}
          </div>
          {scheduledCap && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <CalendarClock className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-800">Geplante Änderung</p>
                <p className="text-xs text-amber-700">€ {Number(scheduledCap.cap_amount).toFixed(2)} ab {new Date(scheduledCap.valid_from).toLocaleDateString('de-AT')}</p>
                {scheduledCap.note && <p className="text-xs text-amber-600 italic mt-0.5">{scheduledCap.note}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Per-user budget table */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
            <p className="text-sm font-semibold text-gray-600">Benutzerliste</p>
            <button onClick={() => setShowBulk(true)}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-white transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Alle anpassen
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Benutzer</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">DG</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Budget</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Verbraucht</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Verbleibend</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ profile, currentBudget, scheduledBudget, used }) => {
                const total = currentBudget?.total_budget ?? DEFAULT_BUDGET
                const remaining = total - used
                const pct = Math.min(100, (used / total) * 100)
                return (
                  <tr key={profile.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{profile.name}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{profile.dienstnummer ?? '–'}</td>
                    <td className="px-4 py-3 text-right">
                      {editId === profile.id ? (
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <span className="text-gray-500 text-xs">€</span>
                          <input type="number" step="0.01" min="0" autoFocus
                            className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={editForm.amount}
                            onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') saveBudget(profile.id); if (e.key === 'Escape') setEditId(null) }}
                          />
                          <input type="date"
                            className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={editForm.valid_from}
                            onChange={e => setEditForm(f => ({ ...f, valid_from: e.target.value }))}
                          />
                          <button onClick={() => saveBudget(profile.id)} disabled={saving} className="p-1 hover:bg-green-50 rounded text-green-600"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditId(null)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><X className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <div className="text-right">
                          <span className={currentBudget ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                            € {total.toFixed(2)}{!currentBudget && ' *'}
                          </span>
                          {scheduledBudget && (
                            <div className="flex items-center justify-end gap-1 mt-0.5">
                              <CalendarClock className="w-3 h-3 text-amber-500" />
                              <span className="text-xs text-amber-600">
                                € {Number(scheduledBudget.total_budget).toFixed(2)} ab {new Date(scheduledBudget.valid_from).toLocaleDateString('de-AT')}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${pct > 90 ? 'text-red-600' : pct > 70 ? 'text-amber-600' : 'text-gray-700'}`}>
                        € {used.toFixed(2)}
                      </span>
                      <div className="h-1.5 bg-gray-100 rounded-full mt-1 w-20 ml-auto">
                        <div className={`h-full rounded-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold hidden lg:table-cell ${remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      € {remaining.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setEditId(profile.id); setEditForm({ amount: total.toFixed(2), valid_from: today() }) }}
                        className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900 float-right">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 px-4 py-2 border-t">* Standardwert € {DEFAULT_BUDGET.toFixed(2)} (kein individuelles Budget gesetzt)</p>
        </div>
      )}

      {/* Bulk modal */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Alle Budgets anpassen</h2>
              <p className="text-xs text-gray-500 mt-1">Gilt für alle {rows.length} aktiven Benutzer</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Neues Jahresbudget (€)</label>
                <input type="number" step="0.01" min="0" autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={bulkForm.amount} onChange={e => setBulkForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder={DEFAULT_BUDGET.toFixed(2)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Gültig ab</label>
                <input type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={bulkForm.valid_from} onChange={e => setBulkForm(f => ({ ...f, valid_from: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => { setShowBulk(false); setBulkForm({ amount: '', valid_from: today() }) }}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={saveBulk} disabled={!bulkForm.amount || bulkSaving}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {bulkSaving ? 'Wird gespeichert...' : 'Für alle setzen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shoe refund cap modal */}
      {showCapForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Schuherstattung anpassen</h2>
              <p className="text-xs text-gray-500 mt-1">Neuer Maximalbetrag mit Gültigkeitsdatum</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Maximalbetrag (€)</label>
                <input type="number" step="0.01" min="0" autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={capForm.amount} onChange={e => setCapForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Gültig ab</label>
                <input type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={capForm.valid_from} onChange={e => setCapForm(f => ({ ...f, valid_from: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notiz (optional)</label>
                <input type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={capForm.note} onChange={e => setCapForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="z. B. Anpassung laut Beschluss 2027" />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowCapForm(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={saveCap} disabled={!capForm.amount || capSaving}
                className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {capSaving ? 'Wird gespeichert...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
