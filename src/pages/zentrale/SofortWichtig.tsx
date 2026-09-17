import { AlertTriangle } from 'lucide-react'

export function SofortWichtig({ items, incomplete }: { items: { id: string; title: string; description: string | null; onOpen: () => void }[]; incomplete?: boolean }) {
  const warning = incomplete ? <p className="text-xs font-medium text-amber-700 flex items-center gap-1.5 mb-2"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> AV/BV & EV konnten nicht vollständig geladen werden - es könnten weitere dringende Punkte fehlen. Bitte Seite neu laden.</p> : null
  if (items.length === 0) {
    if (incomplete) return <div>{warning}<div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">Keine dringenden Punkte aus den verfügbaren Quellen.</div></div>
    // Nichts anzeigen, wenn nichts dringend ist - eine "alles ruhig"-Kachel
    // ist keine handlungsrelevante Information.
    return null
  }
  return <section><h2 className="text-xs font-bold uppercase tracking-wider text-red-700 mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Sofort wichtig</h2>{warning}<div className="space-y-2">{items.map(item => <button key={item.id} type="button" onClick={item.onOpen} className="w-full text-left rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 hover:bg-red-100"><p className="font-bold text-red-900">{item.title}</p>{item.description ? <p className="text-sm text-red-800 mt-0.5 line-clamp-2">{item.description}</p> : null}</button>)}</div></section>
}
