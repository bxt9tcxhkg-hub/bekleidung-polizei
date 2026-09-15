import { useOutletContext } from 'react-router-dom'
import { personDisplayName } from '../../lib/register'
import { MASSNAHME_LABEL } from '../../lib/schutzmassnahmen'
import { FAHNDUNG_ART_LABEL } from '../../lib/zentraleShared'
import type { AussendienstContext } from './AussendienstShell'
import { EntryOrIncidentList } from './aussendienstShared'

export default function AussendienstHinweise() {
  const ctx = useOutletContext<AussendienstContext>()
  return <div className="space-y-4">
    <EntryOrIncidentList kind="entries" entries={ctx.entries.filter(item => item.category === 'lage')} />
    {ctx.avBv.length === 0 && ctx.fahndungen.length === 0 ? null : <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
      {ctx.avBv.map(item => <article key={item.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900">{MASSNAHME_LABEL[item.massnahme]} · Gefährder: {item.gefaehrder ? personDisplayName(item.gefaehrder) : '—'}</h3><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.massnahme === 'bv_av' ? 'bg-red-100 text-red-800' : 'bg-purple-100 text-purple-800'}`}>aktiv</span></div><p className="text-sm text-gray-600 mt-2">Geschützt: {(item.geschuetzte ?? []).map(row => row.person ? personDisplayName(row.person) : '—').join(', ') || '—'}</p><p className="text-xs text-gray-500 mt-1">PAD {item.pad_aktenzahl} · bis {new Date(item.ende).toLocaleString('de-AT')}</p>{item.ausnahmen ? <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2"><strong>Ausnahmen:</strong> {item.ausnahmen}</p> : null}{item.hinweise ? <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{item.hinweise}</p> : null}</article>)}
      {ctx.fahndungen.map(item => <article key={item.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900">Fahndung ({FAHNDUNG_ART_LABEL[item.art]}) · {(item.person ? personDisplayName(item.person) : (item.object?.address ?? 'ohne Zuordnung'))}</h3><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.priority === 'kritisch' ? 'bg-red-100 text-red-800' : item.priority === 'hoch' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>{item.priority}</span></div><p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{item.beschreibung}</p></article>)}
    </div>}
  </div>
}
