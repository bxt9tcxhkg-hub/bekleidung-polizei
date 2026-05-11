import { useEffect, useState } from 'react'
import { Plus, X, CalendarRange } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Quarter, QuarterStatus } from '../lib/types'
import { QUARTER_STATUS_LABELS, QUARTER_STATUS_COLORS } from '../lib/types'

const emptyForm = () => ({
  name: '',
  year: new Date().getFullYear(),
  quarter_num: 1,
  status: 'planned' as QuarterStatus,
  start_date: '',
  end_date: '',
})

export default function Quarters() {
  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('quarters').select('*').order('year', { ascending: false }).order('quarter_num', { ascending: false })
    setQuarters(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function autoName(year: number, qNum: number) {
    return `Q${qNum}/${year}`
  }

  function openNew() {
    const f = emptyForm()
    setForm({ ...f, name: autoName(f.year, f.quarter_num) })
    setEditId(null)
    setError('')
    setShowForm(true)
  }

  function openEdit(q: Quarter) {
    setForm({ name: q.name, year: q.year, quarter_num: q.quarter_num, status: q.status, start_date: q.start_date, end_date: q.end_date })
    setEditId(q.id)
    setError('')
    setShowForm(true)
  }

  async function save() {
    setError('')
    if (!form.name || !form.start_date || !form.end_date) { setError('Name, Start- und Enddatum sind Pflicht.'); return }
    setSaving(true)
    if (editId) {
      const { error } = await supabase.from('quarters').update(form).eq('id', editId)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('quarters').insert(form)
      if (error) { setError(error.message); setSaving(false); return }
    }
    setSaving(false)
    setShowForm(false)
    load()
  }

  async function setStatus(q: Quarter, status: QuarterStatus) {
    await supabase.from('quarters').update({ status }).eq('id', q.id)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quartale</h1>
          <p className="text-gray-500 text-sm mt-1">Verwaltung der Bestellquartale</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Neues Quartal
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="grid gap-4">
          {quarters.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-12 text-gray-400">
              <CalendarRange className="w-10 h-10 mb-3" />
              <p>Noch keine Quartale angelegt</p>
            </div>
          )}
          {quarters.map(q => (
            <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="font-bold text-gray-900 text-lg">{q.name}</h2>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${QUARTER_STATUS_COLORS[q.status]}`}>
                      {QUARTER_STATUS_LABELS[q.status]}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {new Date(q.start_date).toLocaleDateString('de-AT')} – {new Date(q.end_date).toLocaleDateString('de-AT')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {q.status === 'planned' && (
                    <button onClick={() => setStatus(q, 'active')} className="text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1.5 rounded-lg transition-colors">
                      Aktivieren
                    </button>
                  )}
                  {q.status === 'active' && (
                    <button onClick={() => setStatus(q, 'closed')} className="text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors">
                      Abschließen
                    </button>
                  )}
                  <button onClick={() => openEdit(q)} className="text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                    Bearbeiten
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editId ? 'Quartal bearbeiten' : 'Neues Quartal'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Jahr</label>
                  <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.year} onChange={e => { const y = parseInt(e.target.value); setForm(f => ({ ...f, year: y, name: autoName(y, f.quarter_num) })) }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quartal (1–4)</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.quarter_num} onChange={e => { const q = parseInt(e.target.value); setForm(f => ({ ...f, quarter_num: q, name: autoName(f.year, q) })) }}>
                    {[1, 2, 3, 4].map(n => <option key={n} value={n}>Q{n}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Startdatum *</label>
                  <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Enddatum *</label>
                  <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as QuarterStatus }))}>
                  {(['planned', 'active', 'closed'] as QuarterStatus[]).map(s => <option key={s} value={s}>{QUARTER_STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
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
