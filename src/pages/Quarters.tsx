import { useEffect, useState } from 'react'
import { X, CheckCircle, CalendarRange, AlertTriangle, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Quarter } from '../lib/types'
import { QUARTER_STATUS_COLORS, QUARTER_STATUS_LABELS } from '../lib/types'

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
  const [closing, setClosing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ start_date: '', end_date: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('quarters')
      .select('*')
      .eq('year', CURRENT_YEAR)
      .order('quarter_num')
    let existing = data ?? []

    // Auto-create missing quarters for this year
    const missing = [1, 2, 3, 4].filter(n => !existing.find(q => q.quarter_num === n))
    if (missing.length > 0) {
      const today = new Date().toISOString().split('T')[0]
      await Promise.all(
        missing.map(n => {
          const dates = DEFAULT_DATES[n]
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
      const { data: fresh } = await supabase.from('quarters').select('*').eq('year', CURRENT_YEAR).order('quarter_num')
      existing = fresh ?? []
    }

    // Auto-transition: close expired active quarter and activate next
    const today = new Date().toISOString().split('T')[0]
    const active = existing.find(q => q.status === 'active')
    if (active && active.end_date < today) {
      await supabase.from('quarters').update({ status: 'closed' }).eq('id', active.id)
      const next = existing.find(q => q.quarter_num === active.quarter_num + 1 && q.status === 'planned')
      if (next) await supabase.from('quarters').update({ status: 'active' }).eq('id', next.id)
      const { data: updated } = await supabase.from('quarters').select('*').eq('year', CURRENT_YEAR).order('quarter_num')
      setQuarters(updated ?? [])
      setLoading(false)
      return
    }

    setQuarters(existing)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function closeAndNext() {
    const active = quarters.find(q => q.status === 'active')
    if (!active) return
    const next = quarters.find(q => q.quarter_num === active.quarter_num + 1 && q.status === 'planned')
    if (!confirm(`${active.name} abschließen?${next ? ` ${next.name} startet sofort.` : ' Es gibt kein weiteres geplantes Quartal.'}`)) return
    setClosing(true)
    await supabase.from('quarters').update({ status: 'closed' }).eq('id', active.id)
    if (next) await supabase.from('quarters').update({ status: 'active' }).eq('id', next.id)
    setClosing(false)
    load()
  }

  async function reactivate(q: Quarter) {
    if (!confirm(`${q.name} reaktivieren?`)) return
    // Close any currently active quarter first
    const current = quarters.find(nq => nq.status === 'active')
    if (current) await supabase.from('quarters').update({ status: 'closed' }).eq('id', current.id)
    await supabase.from('quarters').update({ status: 'active' }).eq('id', q.id)
    load()
  }

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

  const active = quarters.find(q => q.status === 'active')
  const planned = quarters.filter(q => q.status === 'planned')
  const closed = quarters.filter(q => q.status === 'closed')

  const daysLeft = active
    ? Math.ceil((new Date(active.end_date).getTime() - new Date().getTime()) / 86400000)
    : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quartale {CURRENT_YEAR}</h1>
        <p className="text-gray-500 text-sm mt-1">Bestellzyklen – Quartal abschließen startet den nächsten automatisch</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="space-y-6">

          {/* No active quarter warning */}
          {!active && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-800">Kein aktives Quartal</p>
                <p className="text-xs text-red-600 mt-0.5">Benutzer können aktuell nicht bestellen.</p>
              </div>
            </div>
          )}

          {/* Active quarter — main action card */}
          {active && (
            <div className="bg-white rounded-xl border-2 border-blue-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2.5 rounded-xl">
                    <CalendarRange className="w-5 h-5 text-blue-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-gray-900 text-lg">{active.name}</h2>
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Aktiv</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {new Date(active.start_date).toLocaleDateString('de-AT')} – {new Date(active.end_date).toLocaleDateString('de-AT')}
                      {daysLeft !== null && daysLeft >= 0 && (
                        <span className={`ml-2 font-medium ${daysLeft <= 7 ? 'text-amber-600' : 'text-gray-400'}`}>
                          · noch {daysLeft} Tag{daysLeft !== 1 ? 'e' : ''}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <button onClick={() => openEdit(active)}
                  className="text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
                  Datum anpassen
                </button>
              </div>

              <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between gap-4">
                <p className="text-sm text-gray-500">
                  Quartal abschließen beendet den Bestellzeitraum.
                  {planned.length > 0
                    ? ` ${planned[0].name} startet sofort.`
                    : ' Kein Folgequartal geplant.'}
                </p>
                <button onClick={closeAndNext} disabled={closing}
                  className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex-shrink-0">
                  <CheckCircle className="w-4 h-4" />
                  {closing ? 'Wird abgeschlossen...' : 'Quartal abschließen'}
                </button>
              </div>
            </div>
          )}

          {/* Planned quarters */}
          {planned.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Kommende Quartale</h3>
              <div className="space-y-2">
                {planned.map(q => (
                  <div key={q.id} className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black text-gray-200">Q{q.quarter_num}</span>
                      <div>
                        <p className="font-medium text-gray-700 text-sm">{q.name}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(q.start_date).toLocaleDateString('de-AT')} – {new Date(q.end_date).toLocaleDateString('de-AT')}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => openEdit(q)}
                      className="text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                      Datum anpassen
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Closed quarters (collapsible) */}
          {closed.length > 0 && (
            <div>
              <button onClick={() => setShowHistory(h => !h)}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 hover:text-gray-600 transition-colors">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                Abgeschlossene Quartale ({closed.length})
              </button>
              {showHistory && (
                <div className="space-y-2">
                  {closed.map(q => (
                    <div key={q.id} className="bg-white rounded-xl border border-gray-100 px-5 py-3 flex items-center justify-between gap-4 opacity-60 hover:opacity-100 transition-opacity">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-black text-gray-200">Q{q.quarter_num}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-700 text-sm">{q.name}</p>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${QUARTER_STATUS_COLORS[q.status]}`}>
                              {QUARTER_STATUS_LABELS[q.status]}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400">
                            {new Date(q.start_date).toLocaleDateString('de-AT')} – {new Date(q.end_date).toLocaleDateString('de-AT')}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => reactivate(q)}
                        className="text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors">
                        Reaktivieren
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit date modal */}
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
                <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Enddatum (Bestellfrist)</label>
                <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
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
