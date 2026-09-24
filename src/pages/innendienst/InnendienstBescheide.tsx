import { CheckCircle2, FileOutput, Pencil, Plus, ShieldAlert } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import type { InnendienstPersonEntscheidungStatus } from '../../lib/types'
import { KIND_LABEL, STATUS_LABEL } from './innendienstShared'
import type { InnendienstContext } from './InnendienstShell'

const STATUS_COLOR = { offen: 'bg-green-100 text-green-800', erledigt: 'bg-gray-100 text-gray-700', entzogen: 'bg-red-100 text-red-800' } as const
const ENTSCHEIDUNG_LABEL: Record<InnendienstPersonEntscheidungStatus, string> = {
  erlaubt: 'Weitere Ausstellung erlaubt',
  ruecksprache: 'Rücksprache erforderlich',
  gesperrt: 'Keine weitere Ausstellung',
}

export default function InnendienstBescheide() {
  const ctx = useOutletContext<InnendienstContext>()

  return <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
    <div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3">
      <div><h2 className="font-bold text-gray-900">Bescheide</h2><p className="text-xs text-gray-500 mt-0.5">Straßenmusik und Straßenkunst · heute {ctx.todaysBescheide.length}/2</p></div>
      {ctx.todaysBescheide.length < 2 ? <button type="button" onClick={() => ctx.openNewBescheid('bescheid_strassenmusik')} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 rounded-lg"><Plus className="w-4 h-4" /> Bescheid</button> : null}
    </div>
    {ctx.bescheide.length === 0 ? <div className="px-5 py-10 text-center"><CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">Noch keine Bescheide erfasst.</p></div> : <div className="divide-y divide-gray-100">{ctx.bescheide.map(bescheid => {
      const verstossAnzahl = bescheid.person_id ? ctx.violationCountByPerson.get(bescheid.person_id) ?? 0 : 0
      const entscheidung = bescheid.person_id ? ctx.personEntscheidungen.get(bescheid.person_id) : undefined
      return <article key={bescheid.id} className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{KIND_LABEL[bescheid.kind]}</span><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[bescheid.status]}`}>{STATUS_LABEL[bescheid.status]}</span><span className="text-xs text-gray-400">{new Date(bescheid.issued_date).toLocaleDateString('de-AT')}</span></div>
            <h3 className="font-semibold text-gray-900 mt-1.5">{bescheid.subject}</h3>
            <p className="text-sm text-gray-600 mt-0.5">Geb. {bescheid.person?.birth_date ? new Date(bescheid.person.birth_date).toLocaleDateString('de-AT') : 'nicht erfasst'}{bescheid.reference ? ` · GZ ${bescheid.reference}` : ''}</p>
            {verstossAnzahl > 0 ? <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-red-700"><ShieldAlert className="w-4 h-4" /> {verstossAnzahl} Verstoß{verstossAnzahl === 1 ? '' : 'e'} gegen Auflagen</p> : null}
            {entscheidung ? <p className={`mt-2 text-sm font-semibold ${entscheidung.status === 'gesperrt' ? 'text-red-700' : entscheidung.status === 'ruecksprache' ? 'text-amber-700' : 'text-green-700'}`}>{ENTSCHEIDUNG_LABEL[entscheidung.status]}</p> : null}
          </div>
          <div className="flex gap-2 flex-shrink-0"><button type="button" onClick={() => ctx.printBescheid(bescheid)} className="min-h-11 inline-flex items-center gap-2 px-3 text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg"><FileOutput className="w-4 h-4" /> Drucken</button>{bescheid.status === 'offen' ? <button type="button" onClick={() => ctx.openEditBescheid(bescheid)} className="min-h-11 p-3 text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-lg" aria-label="Bescheid bearbeiten"><Pencil className="w-4 h-4" /></button> : null}</div>
        </div>
        {bescheid.person_id && ctx.canDecideBescheide ? <div className="mt-3 pt-3 border-t border-gray-100"><p className="text-xs font-medium text-gray-500 mb-2">Entscheidung für künftige Bescheide</p><div className="flex flex-wrap gap-2">{(['erlaubt', 'ruecksprache', 'gesperrt'] as const).map(status => <button key={status} type="button" onClick={() => void ctx.setPersonEntscheidung(bescheid.person_id!, status)} className={`min-h-10 px-3 rounded-lg border text-xs font-semibold ${entscheidung?.status === status ? 'border-blue-700 bg-blue-50 text-blue-800' : 'border-gray-300 text-gray-600'}`}>{ENTSCHEIDUNG_LABEL[status]}</button>)}</div></div> : null}
      </article>
    })}</div>}
  </section>
}
