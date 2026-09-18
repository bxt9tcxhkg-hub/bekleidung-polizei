import { Phone } from 'lucide-react'
import { telHref, useWichtigeTelefonnummern } from '../lib/telefonnummern'
import type { TelefonnummerKategorie, WichtigeTelefonnummer } from '../lib/types'

const KATEGORIE_LABEL: Record<TelefonnummerKategorie, string> = { intern: 'Intern', extern: 'Extern' }

function Column({ kategorie, items }: { kategorie: TelefonnummerKategorie; items: WichtigeTelefonnummer[] }) {
  return <div className="min-w-0">
    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">{KATEGORIE_LABEL[kategorie]}</h3>
    {items.length === 0 ? <p className="text-sm text-gray-400">Keine Nummern hinterlegt.</p> : <ul className="divide-y divide-gray-100 overflow-y-auto pr-1" style={{ maxHeight: 220 }}>
      {items.map(item => <li key={item.id}>
        <a href={telHref(item.nummer)} className="flex items-center justify-between gap-2 py-1.5 text-sm hover:text-blue-700">
          <span className="min-w-0 truncate text-gray-700">{item.bezeichnung}{item.hinweis ? <span className="text-gray-400"> · {item.hinweis}</span> : null}</span>
          <span className="flex-shrink-0 font-medium text-gray-900">{item.nummer}</span>
        </a>
      </li>)}
    </ul>}
  </div>
}

export default function WichtigeTelefonnummernCard() {
  const { nummern, loading, error } = useWichtigeTelefonnummern()
  const intern = nummern.filter(item => item.kategorie === 'intern')
  const extern = nummern.filter(item => item.kategorie === 'extern')
  if (!loading && !error && nummern.length === 0) return null
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
    <h2 className="font-bold text-gray-900 flex items-center gap-2"><Phone className="w-4 h-4 text-blue-700" /> Wichtige Telefonnummern</h2>
    {loading ? <p className="text-sm text-gray-400 mt-2">Lädt…</p> : error ? <p className="text-sm text-red-600 mt-2">Telefonnummern konnten nicht geladen werden.</p> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
      <Column kategorie="intern" items={intern} />
      <Column kategorie="extern" items={extern} />
    </div>}
  </section>
}
