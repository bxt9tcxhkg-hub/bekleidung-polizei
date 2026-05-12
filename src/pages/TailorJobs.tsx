import { useEffect, useState } from 'react'
import { Scissors, CheckCircle, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Order } from '../lib/types'

type TailorOrder = Order & {
  products?: { name: string; category: string }
  profiles?: { name: string; dienstnummer: string | null }
  quarters?: { name: string }
}

interface TailorJob {
  id: string
  quarter_id: string
  status: 'open' | 'done'
  note: string | null
  created_at: string | null
  completed_at: string | null
  quarters?: { name: string }
  orders?: TailorOrder[]
}

export default function TailorJobs() {
  const [jobs, setJobs] = useState<TailorJob[]>([])
  const [unassigned, setUnassigned] = useState<TailorOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [jobsRes, unassignedRes] = await Promise.all([
      supabase
        .from('tailor_jobs')
        .select('*, quarters(name), orders(*, products(name,category), profiles(name,dienstnummer), quarters(name))')
        .order('created_at', { ascending: false }),
      supabase
        .from('orders')
        .select('*, products(name,category), profiles(name,dienstnummer), quarters(name)')
        .eq('status', 'at_tailor')
        .is('tailor_job_id', null),
    ])
    setJobs((jobsRes.data ?? []) as TailorJob[])
    setUnassigned((unassignedRes.data ?? []) as TailorOrder[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function createJobFromUnassigned() {
    if (unassigned.length === 0) return
    setCreating(true)
    // Einen Job pro Quartal anlegen
    const byQuarter: Record<string, TailorOrder[]> = {}
    for (const o of unassigned) {
      if (!byQuarter[o.quarter_id]) byQuarter[o.quarter_id] = []
      byQuarter[o.quarter_id].push(o)
    }
    for (const [quarterId, orders] of Object.entries(byQuarter)) {
      const { data: job } = await supabase
        .from('tailor_jobs')
        .insert({ quarter_id: quarterId, status: 'open' })
        .select()
        .single()
      if (job) {
        await Promise.all(
          orders.map(o => supabase.from('orders').update({ tailor_job_id: job.id }).eq('id', o.id))
        )
      }
    }
    setCreating(false)
    load()
  }

  async function markDone(job: TailorJob) {
    if (!confirm(`Schneiderjob als erledigt markieren? Alle ${job.orders?.length ?? 0} Artikel werden auf "Bereit zur Ausgabe" gesetzt.`)) return
    await supabase.from('tailor_jobs').update({ status: 'done', completed_at: new Date().toISOString().split('T')[0] }).eq('id', job.id)
    if (job.orders && job.orders.length > 0) {
      await Promise.all(
        job.orders
          .filter(o => o.status === 'at_tailor')
          .map(o => supabase.from('orders').update({ status: 'ready_for_issue', updated_at: new Date().toISOString() }).eq('id', o.id))
      )
    }
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schneiderjobs</h1>
          <p className="text-gray-500 text-sm mt-1">Artikel mit Wappenänderung</p>
        </div>
        {unassigned.length > 0 && (
          <button onClick={createJobFromUnassigned} disabled={creating}
            className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
            <Scissors className="w-4 h-4" />
            {creating ? 'Wird erstellt...' : `Job erstellen (${unassigned.length} Artikel)`}
          </button>
        )}
      </div>

      {/* Nicht zugewiesene Artikel */}
      {unassigned.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-amber-800 mb-2">
            {unassigned.length} Artikel warten auf Zuweisung zu einem Schneiderjob
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map(o => (
              <span key={o.id} className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-1 rounded-md">
                {o.products?.name} · Gr. {o.size} · {o.profiles?.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : jobs.length === 0 && unassigned.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-12 text-gray-400">
          <Scissors className="w-10 h-10 mb-3" />
          <p>Keine Schneiderjobs vorhanden</p>
          <p className="text-sm mt-1">Artikel gelangen hierher wenn sie beim Lieferanten ankommen und eine Wappenänderung benötigen</p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map(job => (
            <div key={job.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${job.status === 'open' ? 'bg-orange-100' : 'bg-green-100'}`}>
                    <Scissors className={`w-4 h-4 ${job.status === 'open' ? 'text-orange-700' : 'text-green-700'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{job.quarters?.name ?? '–'}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${job.status === 'open' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                        {job.status === 'open' ? 'Offen' : 'Erledigt'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {job.orders?.length ?? 0} Artikel
                      {job.completed_at && ` · Abgeschlossen ${new Date(job.completed_at).toLocaleDateString('de-AT')}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {job.status === 'open' && (
                    <button onClick={() => markDone(job)}
                      className="flex items-center gap-1.5 text-sm font-medium bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                      <CheckCircle className="w-4 h-4" /> Erledigt
                    </button>
                  )}
                  <button onClick={() => setExpanded(expanded === job.id ? null : job.id)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
                    <ChevronDown className={`w-4 h-4 transition-transform ${expanded === job.id ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {expanded === job.id && job.orders && job.orders.length > 0 && (
                <div className="border-t border-gray-100">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500">Benutzer</th>
                      <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500">Artikel</th>
                      <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500">Gr. / Menge</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {job.orders.map(o => (
                        <tr key={o.id} className="hover:bg-gray-50">
                          <td className="px-5 py-2.5">
                            <p className="font-medium text-gray-900">{o.profiles?.name}</p>
                            {o.profiles?.dienstnummer && <p className="text-xs text-gray-400">DG {o.profiles.dienstnummer}</p>}
                          </td>
                          <td className="px-5 py-2.5 text-gray-700">{o.products?.name}</td>
                          <td className="px-5 py-2.5 text-gray-500">{o.size} · {o.quantity}×</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
