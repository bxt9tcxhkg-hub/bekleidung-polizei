import { useEffect, useState } from 'react'
import { X, RefreshCw, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Quarter } from '../lib/types'
import { QUARTER_STATUS_LABELS, QUARTER_STATUS_COLORS } from '../lib/types'

const CURRENT_YEAR = new Date().getFullYear()

const DEFAULT_DATES: Record<number, { start_date: string; end_date: string }> = {
  1: { start_date: `${CURRENT_YEAR}-01-01`, end_date: `${CURRENT_YEAR}-03-31` },
  2: { start_date: `${CURRENT_YEAR}-04-01`, end_date: `${CURRENT_YEAR}-06-30` },
  3: { start_date: `${CURRENT_YEAR}-07-01`, end_date: `${CURRENT_YEAR}-09-30` },
  4: { start_date: `${CURRENT_YEAR}-10-01`, end_date: `${CURRENT_YEAR}-12-31` },
}

export default function Quarters() {
  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ start_date: '', end_date: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('quarters')
      .select('*')
      .eq('year', CURRENT_YEAR)
      .order('quarter_num')
    let existing = data ?? []

    // Auto-create missing quarters
    const missing = [1, 2, 3, 4].filter(n => !existing.find(q => q.quarter_num === n))
    if (missing.length > 0) {
      const today = new Date().toISOString().split('T')[0]
      await Promise.all(
        missing.map(n => {
          const dates = DEFAULT_DATES[n]
          // Auto-activate the quarter whose date range includes today
          const status = today >= dates.start_date && today <= dates.end_date ? 'active' : 'planned'
          return supabase.from('quarters').insert({
            name: `Q${n}/${CURRENT_YEAR}`,
            year: CURRENT_YEAR,
            quarter_num: n,
            status,
            ...dates,
          })
        })
      )
      const { data: fresh } = await supabase
        .from('quarters')
        .select('*')
        .eq('year', CURRENT_YEAR)
        .order('quarter_num')
      existing = fresh ?? []
    }

    // Auto-transition: close active quarter if end_date is in the past
    const today = new Date().toISOString().split('T')[0]
    const active = existing.find(q => q.status === 'active')
    if (active && active.end_date < today) {
      await activateNext(active, existing, /* skipReload */ true)
      // Reload after transition
      const { data: updated } = await supabase
        .from('quarters')
        .select('*')
        .eq('year', CURRENT_YEAR)
        .order('quarter_num')
      setQuarters(updated ?? [])
      setLoading(false)
      return
    }

    setQuarters(existing)
    setLoading(false)
  }

  // Closes the given quarter and activates the next planned one.
  // skipReload: when called from load(), we handle reload there.
  async function activateNext(q: Quarter, allQuarters: Quarter[], skipReload = false) {
    await supabase.from('quarters').update({ status: 'closed' }).eq('id', q.id)
    const next = allQuarters.find(nq => nq.quarter_num === q.quarter_num + 1 && nq.status === 'planned')
    if (next) {
      await supabase.from('quarters').update({ status: 'active' }).eq('id', next.id)
    }
    if (!skipReload) load()
  }

  async function handleClose(q: Quarter) {
    if (!confirm(`${q.name} abschließen? Der nächste Quartal wird automatisch aktiviert.`)) return
    await activateNext(q, quarters)
  }

  async function handleActivate(q: Quarter) {
    // If another quarter is already active, close it first
    const currentActive = quarters.find(nq => nq.status === 'active')
    if (currentActive) {
      await supabase.from('quarters').update({ status: 'closed' }).eq('id', currentActive.id)
    }
    await supabase.from('quarters').update({ status: 'active' }).eq('id', q.id)
    load()
  }

  async function handleReactivate(q: Quarter) {
    if (!confirm(`${q.name} reaktivieren? Dieses Quartal wird wieder auf "Aktiv" gesetzt.`)) return
    await handleActivate(q)
  }

  useEffect(() => { load() }, [])

  function openEdit(q: Quarter) {
    setForm({ start_date: q.start_date, end_date: q.end_date })
    setEditId(q.id)
    setError('')
  }

  async function save() {
    setError('')
    if (!form.start_date || !form.end_date) { setError('Start- und Enddatum sind Pflicht.'); return }
    if (form.start_date >= form.end_date) { setError('Startdatum muss vor dem Enddatum liegen.'); return }
    setSaving(true)
    const { error } = await supabase.from('quarters').update(form).eq('id', editId!)
    if (error) { setError(error.message); setSaving(false); return }
    setSaving(false)
    setEditId(null)
    load()
  }

  // Returns a human-readable hint for auto-transition
  function getAutoHint(q: Quarter) {
    if (q.status !== 'active') return null
    const today = new Date().toISOString().split('T')[0]
    const daysLeft = Math.ceil((new Date(q.end_date).getTime() - new Date(today).getTime()) / 86400000)
    if (daysLeft <= 0) return null // already handled by load()
    if (daysLeft <= 7) return `Automatischer Wechsel in ${daysLeft} Tag${daysLeft === 1 ? '' : 'en'}`
    return null
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quartale {CURRENT_YEAR}</h1>
        <p className="text-gray-500 text-sm mt-1">Quartalswechsel erfolgt automatisch nach Fristablauf</p>
      </div>

      {!loading && !quarters.some(q => q.status === 'active') && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">Kein aktives Quartal</p>
            <p className="text-xs text-red-600 mt-0.5">Benutzer können aktuell keine Bestellungen aufgeben. Bitte reaktiviere ein Quartal.</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="grid gap-4">
          {quarters.map(q => {
            const autoHint = getAutoHint(q)
            return (
              <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-black text-gray-200">Q{q.quarter_num}</span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-bold text-gray-900">{q.name}</h2>
                        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${QUARTER_STATUS_COLORS[q.status]}`}>
                          {QUARTER_STATUS_LABELS[q.status]}
                        </span>
                        {autoHint && (
                          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" /> {autoHint}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {new Date(q.start_date).toLocaleDateString('de-AT')} – {new Date(q.end_date).toLocaleDateString('de-AT')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {q.status === 'planned' && (
                      <button onClick={() => handleActivate(q)} className="text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1.5 rounded-lg transition-colors">
                        Aktivieren
                      </button>
                    )}
                    {q.status === 'active' && (
                      <button onClick={() => handleClose(q)} className="text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors">
                        Abschließen
                      </button>
                    )}
                    {q.status === 'closed' && (
                      <button onClick={() => handleReactivate(q)} className="text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors">
                        Reaktivieren
                      </button>
                    )}
                    <button onClick={() => openEdit(q)} className="text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                      Datum anpassen
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Datum anpassen</h2>
              <button onClick={() => setEditId(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Startdatum</label>
                <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Enddatum</label>
                <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setEditId(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={save} disabled={saving} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
