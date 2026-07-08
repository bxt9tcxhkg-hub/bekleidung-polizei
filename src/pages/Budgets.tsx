import { useEffect, useState } from 'react'
import { Pencil, Check, X, RefreshCw, Plus, CalendarClock, Footprints, Search, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { fmtEUR } from '../lib/format'
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
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  // Drill-down
  const [drilldown, setDrilldown] = useState<{ profile: Profile; orders: any[] } | null>(null)
  const [drilldownLoading, setDrilldownLoading] = useState(false)

  async function openDrilldown(profile: Profile) {
    setDrilldownLoading(true)
    setDrilldown({ profile, orders: [] })
    const { data } = await supabase
      .from('orders')
      .select('id, quantity, unit_price, size, created_at, products(name, article_number)')
      .eq('user_id', profile.id)
      .not('status', 'in', '(pending,cancelled)')
      .gte('created_at', `${CURRENT_YEAR}-01-01`)
      .order('created_at', { ascending: false })
    setDrilldown({ profile, orders: data ?? [] })
    setDrilldownLoading(false)
  }

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
        .not('status', 'in', '(pending,cancelled)')
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
      // Liste ist valid_from absteigend sortiert: erster Eintrag <= heute ist der aktuelle,
      // der LETZTE Eintrag > heute ist die nächste anstehende Änderung.
      const userBudgets = budgets.filter(b => b.user_id === p.id)
      const current = userBudgets.find(b => b.valid_from <= t) ?? null
      const future = userBudgets.filter(b => b.valid_from > t)
      const scheduled = future.length > 0 ? future[future.length - 1] : null
      return { profile: p, currentBudget: current, scheduledBudget: scheduled, used: usedByUser[p.id] ?? 0 }
    }))
    setLoading(false)
  }

  useEffect(() => { load().catch(() => setError('Budgets konnten nicht geladen werden.')) }, [])

  async function saveBudget(userId: string) {
    const val = parseFloat(editForm.amount.replace(',', '.'))
    if (isNaN(val) || val < 0) return
    setSaving(true)
    const { error } = await supabase.from('user_budgets').upsert(
      { user_id: userId, year: CURRENT_YEAR, total_budget: val, valid_from: editForm.valid_from },
      { onConflict: 'user_id,year,valid_from' }
    )
    setSaving(false)
    if (error) { setError(`Budget konnte nicht gespeichert werden: ${error.message}`); return }
    const benutzername = rows.find(r => r.profile.id === userId)?.profile.name ?? '?'
    logAudit('Budget geändert', `${benutzername}: ${fmtEUR(val)}`)
    setError('')
    setEditId(null)
    load()
  }

  async function saveBulk() {
    const val = parseFloat(bulkForm.amount.replace(',', '.'))
    if (isNaN(val) || val < 0) return
    setBulkSaving(true)
    const results = await Promise.all(
      rows.map(r =>
        supabase.from('user_budgets').upsert(
          { user_id: r.profile.id, year: CURRENT_YEAR, total_budget: val, valid_from: bulkForm.valid_from },
          { onConflict: 'user_id,year,valid_from' }
        )
      )
    )
    setBulkSaving(false)
    const failed = results.filter(r => r.error).length
    if (failed > 0) setError(`${failed} von ${rows.length} Budgets konnten nicht gespeichert werden.`)
    else setError('')
    if (failed < rows.length) logAudit('Budget geändert', `${rows.length - failed} Benutzer: ${fmtEUR(val)}`)
    setShowBulk(false)
    setBulkForm({ amount: '', valid_from: today() })
    load()
  }

  async function saveCap() {
    const val = parseFloat(capForm.amount.replace(',', '.'))
    if (isNaN(val) || val < 0) return
    setCapSaving(true)
    const { error } = await supabase.from('shoe_refund_caps').insert({
      cap_amount: val,
      valid_from: capForm.valid_from,
      note: capForm.note || null,
      created_by: authProfile!.id,
    })
    setCapSaving(false)
    if (error) { setError(`Maximalbetrag konnte nicht gespeichert werden: ${error.message}`); return }
    logAudit('Schuherstattungs-Deckel geändert', `${fmtEUR(val)} ab ${capForm.valid_from}`)
    setError('')
    setShowCapForm(false)
    setCapForm({ amount: '', valid_from: today(), note: '' })
    load()
  }

  // caps ist valid_from absteigend sortiert: erster Eintrag <= heute ist der aktuelle,
  // der LETZTE Eintrag > heute ist die nächste anstehende Änderung.
  const currentCap = caps.find(c => c.valid_from <= today())
  const futureCaps = caps.filter(c => c.valid_from > today())
  const scheduledCap = futureCaps.length > 0 ? futureCaps[futureCaps.length - 1] : undefined

  const totalBudget = rows.reduce((s, r) => s + (r.currentBudget?.total_budget ?? DEFAULT_BUDGET), 0)
  const totalUsed = rows.reduce((s, r) => s + r.used, 0)
  const utilizationPct = totalBudget > 0 ? Math.min(100, (totalUsed / totalBudget) * 100) : 0
  const overBudgetCount = rows.filter(r => r.used > (r.currentBudget?.total_budget ?? DEFAULT_BUDGET)).length
  const unusedCount = rows.filter(r => r.used === 0).length

  return (
    <div className="space-y-6">
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Budgetverwaltung {CURRENT_YEAR}</h1>
        <p className="text-gray-500 text-sm mt-1">Jahresbudget und Schuherstattung verwalten</p>
      </div>

      {/* Budget summary */}
      {!loading && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Budgetauswertung {CURRENT_YEAR}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Gesamtbudget</p>
              <p className="text-xl font-bold text-gray-900">{fmtEUR(totalBudget)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Verbraucht</p>
              <p className="text-xl font-bold text-gray-900">{fmtEUR(totalUsed)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Budget überschritten</p>
              <p className={`text-xl font-bold ${overBudgetCount > 0 ? 'text-red-600' : 'text-green-600'}`}>{overBudgetCount} Nutzer</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Kein Verbrauch</p>
              <p className="text-xl font-bold text-gray-500">{unusedCount} Nutzer</p>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Ausschöpfung</span>
              <span className={utilizationPct >= 90 ? 'text-red-600 font-semibold' : utilizationPct >= 70 ? 'text-amber-600 font-semibold' : 'text-green-600 font-semibold'}>{utilizationPct.toFixed(1)} %</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${utilizationPct >= 90 ? 'bg-red-500' : utilizationPct >= 70 ? 'bg-amber-400' : 'bg-green-500'}`}
                style={{ width: `${utilizationPct}%` }} />
            </div>
            {utilizationPct >= 90 && <p className="text-xs text-red-600 mt-1.5 font-medium">Budget nahezu ausgeschöpft — bei der Planung für {CURRENT_YEAR + 1} höheres Budget einplanen.</p>}
            {overBudgetCount > 0 && <p className="text-xs text-amber-700 mt-1">{overBudgetCount} {overBudgetCount === 1 ? 'Nutzer hat' : 'Nutzer haben'} das Budget überschritten — Richtwert für {CURRENT_YEAR + 1} entsprechend anpassen.</p>}
          </div>
        </div>
      )}

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
            <p className="text-3xl font-bold text-gray-900">{fmtEUR(Number(currentCap?.cap_amount ?? 120))}</p>
            {currentCap && <p className="text-xs text-gray-400 mt-0.5">gültig seit {new Date(currentCap.valid_from).toLocaleDateString('de-AT')}</p>}
          </div>
          {scheduledCap && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <CalendarClock className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-800">Geplante Änderung</p>
                <p className="text-xs text-amber-700">{fmtEUR(Number(scheduledCap.cap_amount))} ab {new Date(scheduledCap.valid_from).toLocaleDateString('de-AT')}</p>
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
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Name oder Dienstnummer..."
                className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <button onClick={() => setShowBulk(true)}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-white transition-colors flex-shrink-0">
              <RefreshCw className="w-3.5 h-3.5" /> Alle anpassen
            </button>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Benutzer</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">DG</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Budget</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Verbraucht</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Verbleibend</th>
                <th className="px-4 py-3" />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.filter(({ profile }) => {
                const q = search.toLowerCase()
                return !q || profile.name.toLowerCase().includes(q) || (profile.dienstnummer ?? '').toLowerCase().includes(q)
              }).map(({ profile, currentBudget, scheduledBudget, used }) => {
                const total = currentBudget?.total_budget ?? DEFAULT_BUDGET
                const remaining = total - used
                const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
                return (
                  <tr key={profile.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => editId !== profile.id && openDrilldown(profile)}>
                    <td className="px-4 py-3 font-medium text-gray-900">{profile.name}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{profile.dienstnummer ?? '–'}</td>
                    <td className="px-4 py-3 text-right">
                      {editId === profile.id ? (
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <span className="text-gray-500 text-xs">€</span>
                          <input type="number" step="0.01" min="0" autoFocus
                            className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            {fmtEUR(total)}{!currentBudget && ' *'}
                          </span>
                          {scheduledBudget && (
                            <div className="flex items-center justify-end gap-1 mt-0.5">
                              <CalendarClock className="w-3 h-3 text-amber-500" />
                              <span className="text-xs text-amber-600">
                                {fmtEUR(Number(scheduledBudget.total_budget))} ab {new Date(scheduledBudget.valid_from).toLocaleDateString('de-AT')}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${pct > 90 ? 'text-red-600' : pct > 70 ? 'text-amber-600' : 'text-gray-700'}`}>
                        {fmtEUR(used)}
                      </span>
                      <div className="h-1.5 bg-gray-100 rounded-full mt-1 w-20 md:w-24 ml-auto">
                        <div className={`h-full rounded-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold hidden lg:table-cell ${remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {fmtEUR(remaining)}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setEditId(profile.id); setEditForm({ amount: total.toFixed(2), valid_from: today() }) }}
                        className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900 float-right">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          <p className="text-xs text-gray-400 px-4 py-2 border-t">* Standardwert {fmtEUR(DEFAULT_BUDGET)} (kein individuelles Budget gesetzt)</p>
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
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={saveBulk} disabled={!bulkForm.amount || bulkSaving}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">
                {bulkSaving ? 'Wird gespeichert...' : 'Für alle setzen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drilldown modal */}
      {drilldown && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
              <div>
                <h2 className="font-bold text-gray-900">{drilldown.profile.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Bestellungen {CURRENT_YEAR}{drilldown.profile.dienstnummer ? ` · DG ${drilldown.profile.dienstnummer}` : ''}</p>
              </div>
              <button onClick={() => setDrilldown(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-auto">
              {drilldownLoading ? (
                <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-800" /></div>
              ) : drilldown.orders.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-gray-400">
                  <p className="font-medium">Keine Bestellungen im Jahr {CURRENT_YEAR}</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 sticky top-0">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Artikel</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Gr.</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Betrag</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Datum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {drilldown.orders.map(o => (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{(o as any).products?.name ?? '–'}</p>
                          <p className="text-xs text-gray-400">{(o as any).products?.article_number}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{o.size}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtEUR(o.unit_price * o.quantity)}</td>
                        <td className="px-4 py-3 text-right text-gray-400 text-xs hidden sm:table-cell">
                          {new Date(o.created_at).toLocaleDateString('de-AT')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-700">Gesamt</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        {fmtEUR(drilldown.orders.reduce((s, o) => s + o.unit_price * o.quantity, 0))}
                      </td>
                      <td className="hidden sm:table-cell" />
                    </tr>
                  </tfoot>
                </table>
              )}
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
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={saveCap} disabled={!capForm.amount || capSaving}
                className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">
                {capSaving ? 'Wird gespeichert...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
