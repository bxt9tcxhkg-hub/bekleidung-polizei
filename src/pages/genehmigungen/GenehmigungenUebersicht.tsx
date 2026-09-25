import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock3, GraduationCap, Shield, Shirt, type LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// Kachel-Übersicht für die Genehmigungen - Muster: StammdatenUebersicht.tsx
// ("Stammdaten & Nachschlagewerke"). Eine Kachel pro organisatorischer
// Angelegenheit, keine Vermischung der Gebiete - jede Kachel führt zu einer
// eigenen Bereichsseite, auf der der Genehmiger diesen Bereich vollständig
// entscheiden kann, ohne die Seite zu wechseln. Reihenfolge alphabetisch
// (Ausbildung, Bekleidung, Einsatzmittel, Personal) statt "Bekleidung
// zuerst, weil zuerst da" - siehe Diskussion in den vorherigen Versionen
// dieser Seite (Approvals.tsx).
const BEREICH_TILES: { to: string; label: string; description: string; icon: LucideIcon }[] = [
  { to: '/genehmigungen/ausbildung', label: 'Ausbildung', description: 'Trainings- und Schulungs-Zuteilungsvorschläge.', icon: GraduationCap },
  { to: '/genehmigungen/bekleidung', label: 'Bekleidung', description: 'Budgetüberschreitungen, Lagerbestellungen, Schuherstattungen.', icon: Shirt },
  { to: '/genehmigungen/einsatzmittel', label: 'Einsatzmittel', description: 'Persönliche Meldungen und Pool-Beschaffungsanträge.', icon: Shield },
  { to: '/genehmigungen/personal', label: 'Personal', description: 'Überstundenmeldungen zur Entscheidung.', icon: Clock3 },
]

export default function GenehmigungenUebersicht() {
  const [counts, setCounts] = useState<Record<string, number | null>>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [training, schulung, orders, stock, refunds, personalEm, poolEm, ueberstunden] = await Promise.all([
        supabase.from('einsatz_training_assignments').select('id', { count: 'exact', head: true }).eq('status', 'vorschlag'),
        supabase.from('schulungen_assignments').select('id', { count: 'exact', head: true }).eq('status', 'vorschlag'),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
        supabase.from('stock_orders').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
        supabase.from('shoe_refunds').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('personal_einsatzmittel_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('pool_einsatzmittel_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('ueberstunden_meldungen').select('id', { count: 'exact', head: true }).eq('status', 'eingereicht'),
      ])
      if (cancelled) return
      setCounts({
        '/genehmigungen/ausbildung': training.error || schulung.error ? null : (training.count ?? 0) + (schulung.count ?? 0),
        '/genehmigungen/bekleidung': orders.error || stock.error || refunds.error ? null : (orders.count ?? 0) + (stock.count ?? 0) + (refunds.count ?? 0),
        '/genehmigungen/einsatzmittel': personalEm.error || poolEm.error ? null : (personalEm.count ?? 0) + (poolEm.count ?? 0),
        '/genehmigungen/personal': ueberstunden.error ? null : (ueberstunden.count ?? 0),
      })
    }
    void load()
    return () => { cancelled = true }
  }, [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Genehmigungen</h1>
        <p className="text-sm text-gray-500 mt-1">Alles, was auf eine Entscheidung wartet – nach Bereich getrennt.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {BEREICH_TILES.map(tile => {
          const Icon = tile.icon
          const count = counts[tile.to]
          return (
            <Link key={tile.to} to={tile.to} className="rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all block">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="bg-blue-50 p-2.5 rounded-lg"><Icon className="w-5 h-5 text-blue-700" /></div>
                {count != null && count > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">{count} offen</span>
                )}
              </div>
              <h2 className="text-lg font-semibold text-gray-900">{tile.label}</h2>
              <p className="text-sm text-gray-500 mt-1">{tile.description}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
