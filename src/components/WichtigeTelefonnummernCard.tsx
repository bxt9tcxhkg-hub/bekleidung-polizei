import { Phone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { telHref, useWichtigeTelefonnummern } from '../lib/telefonnummern'
import { nummerFuerArt } from '../lib/verstaendigungsregeln'
import { supabase } from '../lib/supabase'
import type { TelefonnummerKategorie, WichtigeTelefonnummer, ZentraleKontakt } from '../lib/types'

const KATEGORIE_LABEL: Record<TelefonnummerKategorie, string> = { intern: 'Intern', extern: 'Extern' }

function Column({ kategorie, items, kontakte }: { kategorie: TelefonnummerKategorie; items: WichtigeTelefonnummer[]; kontakte: Map<string, ZentraleKontakt> }) {
  return <div className="min-w-0">
    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">{KATEGORIE_LABEL[kategorie]}</h3>
    {items.length === 0 ? <p className="text-sm text-gray-400">Keine Nummern hinterlegt.</p> : <ul className="divide-y divide-gray-100 overflow-y-auto pr-1" style={{ maxHeight: 220 }}>
      {items.map(item => {
        const kontakt = item.kontakt_id ? kontakte.get(item.kontakt_id) : null
        const nummer = item.kontakt_id ? (kontakt && item.telefon_art ? nummerFuerArt(kontakt, item.telefon_art) : null) : item.nummer
        return <li key={item.id}>
        {nummer ? <a href={telHref(nummer)} className="flex items-center justify-between gap-2 py-1.5 text-sm hover:text-blue-700">
          <span className="min-w-0 truncate text-gray-700">{item.bezeichnung}{kontakt ? <span className="text-gray-600"> · {kontakt.name}</span> : null}{item.hinweis ? <span className="text-gray-400"> · {item.hinweis}</span> : null}</span>
          <span className="flex-shrink-0 font-medium text-gray-900">{nummer}</span>
        </a> : <span className="flex justify-between gap-2 py-1.5 text-sm text-amber-800"><span>{item.bezeichnung}</span><span>Rufnummer fehlt</span></span>}
      </li>})}
    </ul>}
  </div>
}

export default function WichtigeTelefonnummernCard() {
  const { nummern, loading, error } = useWichtigeTelefonnummern()
  const [kontakte, setKontakte] = useState<Map<string, ZentraleKontakt>>(new Map())
  useEffect(() => {
    const ids = [...new Set(nummern.flatMap(row => row.kontakt_id ? [row.kontakt_id] : []))]
    if (!ids.length) { setKontakte(new Map()); return }
    void supabase.from('zentrale_kontakte').select('*').in('id', ids).then(({ data }) => setKontakte(new Map(((data ?? []) as ZentraleKontakt[]).map(row => [row.id, row]))))
  }, [nummern])
  const intern = nummern.filter(item => item.kategorie === 'intern')
  const extern = nummern.filter(item => item.kategorie === 'extern')
  if (!loading && !error && nummern.length === 0) return null
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
    <h2 className="font-bold text-gray-900 flex items-center gap-2"><Phone className="w-4 h-4 text-blue-700" /> Wichtige Telefonnummern</h2>
    {loading ? <p className="text-sm text-gray-400 mt-2">Lädt…</p> : error ? <p className="text-sm text-red-600 mt-2">Telefonnummern konnten nicht geladen werden.</p> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
      <Column kategorie="intern" items={intern} kontakte={kontakte} />
      <Column kategorie="extern" items={extern} kontakte={kontakte} />
    </div>}
  </section>
}
