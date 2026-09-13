import { useOutletContext } from 'react-router-dom'
import { personDisplayName } from '../../lib/register'
import { AV_BV_ART_LABEL, FAHNDUNG_ART_LABEL } from '../../lib/zentraleShared'
import type { AussendienstContext } from './AussendienstShell'
import { EntryOrIncidentList } from './aussendienstShared'

export default function AussendienstHinweise() {
  const ctx = useOutletContext<AussendienstContext>()
  return <div className="space-y-4">
    <EntryOrIncidentList kind="entries" entries={ctx.entries.filter(item => item.category === 'lage')} />
    {ctx.avBv.length === 0 && ctx.fahndungen.length === 0 ? null : <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
      {ctx.avBv.map(item => <article key={item.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900">{AV_BV_ART_LABEL[item.art]} · {(item.person ? personDisplayName(item.person) : (item.object?.address ?? item.gebiet ?? 'ohne Zuordnung'))}</h3><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.priority === 'kritisch' ? 'bg-red-100 text-red-800' : item.priority === 'hoch' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>{item.priority}</span></div><p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{item.grund}</p></article>)}
      {ctx.fahndungen.map(item => <article key={item.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900">Fahndung ({FAHNDUNG_ART_LABEL[item.art]}) · {(item.person ? personDisplayName(item.person) : (item.object?.address ?? 'ohne Zuordnung'))}</h3><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.priority === 'kritisch' ? 'bg-red-100 text-red-800' : item.priority === 'hoch' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>{item.priority}</span></div><p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{item.beschreibung}</p></article>)}
    </div>}
  </div>
}
