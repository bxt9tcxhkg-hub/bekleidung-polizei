import { useEffect, useState } from 'react'
import { Plus, X, Scissors, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { TailorJob, Quarter } from '../lib/types'

export default function TailorJobs() {
  const [jobs, setJobs] = useState<TailorJob[]>([])
  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ quarter_id: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('tailor_jobs')
      .select('*, quarters(id,name), orders(id,status,size,quantity,products(name))')
      .order('created_at', { ascending: false })
    setJobs(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    async function init() {
      await load()
      const { data } = await supabase.from('quarters').select('*').order('year', { ascending: false })
      setQuarters(data ?? [])
    }
    init()
  }, [])

  async function create() {
    setError('')
    if (!form.quarter_id) { setError('Quartal ist Pflicht.'); return }
    setSaving(true)
    const { error } = await supabase.from('tailor_jobs').insert({ quarter_id: form.quarter_id, note: form.note || null, status: 'open' })
    if (error) setError(error.message)
    else { setShowForm(false); setForm({ quarter_id: '', note: '' }); load() }
    setSaving(false)
  }

  async function markDone(job: TailorJob) {
    await supabase.from('tailor_jobs').update({ status: 'done', completed_at: new Date().toISOString().split('T')[0] }).eq('id', job.id)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schneiderjobs</h1>
          <p className="text-gray-500 text-sm mt-1">Schneideraufträge verwalten</p>
        </div>
        <button onClick={() => { setError(''); setShowForm(true) }} className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Neuer Job
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="grid gap-4">
          {jobs.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-12 text-gray-400">
              <Scissors className="w-10 h-10 mb-3" />
              <p>Keine Schneiderjobs</p>
            </div>
          )}
          {jobs.map(job => (
            <div key={job.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="font-bold text-gray-900">{(job as any).quarters?.name ?? '–'}</h2>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${job.status === 'open' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                      {job.status === 'open' ? 'Offen' : 'Erledigt'}
                    </span>
                  </div>
                  {job.note && <p className="text-sm text-gray-500 mb-3">{job.note}</p>}
                  {job.completed_at && (
                    <p className="text-xs text-gray-400">Abgeschlossen: {new Date(job.completed_at).toLocaleDateString('de-AT')}</p>
                  )}

                  {(job as any).orders && (job as any).orders.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-gray-500 mb-2">ZUGEHÖRIGE BESTELLUNGEN ({(job as any).orders.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {(job as any).orders.map((o: any) => (
                          <span key={o.id} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md">
                            {o.products?.name} · Gr. {o.size} · {o.quantity}×
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {job.status === 'open' && (
                  <button onClick={() => markDone(job)} className="flex items-center gap-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors flex-shrink-0">
                    <CheckCircle className="w-4 h-4" /> Erledigt
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Neuer Schneiderjob</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quartal *</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.quarter_id} onChange={e => setForm(f => ({ ...f, quarter_id: e.target.value }))}>
                  <option value="">– Bitte wählen –</option>
                  {quarters.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notiz</label>
                <textarea rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optionale Notiz..." />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={create} disabled={saving} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Erstellen...' : 'Erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
