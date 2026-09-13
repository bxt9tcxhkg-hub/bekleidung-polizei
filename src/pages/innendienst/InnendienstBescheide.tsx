import { CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { KIND_LABEL, STATUS_LABEL } from './innendienstShared'
import type { InnendienstContext } from './InnendienstShell'

function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"><CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{text}</p></div> }

const STATUS_COLOR: Record<'offen' | 'erledigt' | 'entzogen', string> = { offen: 'bg-amber-100 text-amber-800', erledigt: 'bg-green-100 text-green-800', entzogen: 'bg-red-100 text-red-800' }

export default function InnendienstBescheide() {
  const ctx = useOutletContext<InnendienstContext>()
  const { bescheide, violationsByBescheid, violationCountByPerson } = ctx
  return <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
    <div className="px-4 sm:px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3"><h2 className="font-bold text-gray-900">Bescheide & Verstöße</h2><button type="button" onClick={() => ctx.openNewBescheid('bescheid_strassenmusik')} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Bescheid</button></div>
    {bescheide.length === 0 ? <Empty text="Noch keine Bescheide erfasst." /> : <div className="divide-y divide-gray-100">{bescheide.map(bescheid => {
      const violations = violationsByBescheid.get(bescheid.id) ?? []
      const totalViolations = bescheid.person_id ? violationCountByPerson.get(bescheid.person_id) ?? 0 : 0
      return <article key={bescheid.id} className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{KIND_LABEL[bescheid.kind]}</span><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[bescheid.status]}`}>{STATUS_LABEL[bescheid.status]}</span><span className="text-xs text-gray-400">{new Date(bescheid.issued_date).toLocaleDateString('de-AT')}</span>{totalViolations > 0 ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700">{totalViolations}× Verstoß insgesamt</span> : null}</div><h3 className="font-semibold text-gray-900 mt-1.5">{bescheid.subject}</h3>{bescheid.reference ? <p className="text-xs text-gray-500 mt-0.5">Bezug: {bescheid.reference}</p> : null}{bescheid.note ? <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{bescheid.note}</p> : null}</div><div className="flex gap-1 flex-shrink-0">{bescheid.status !== 'entzogen' ? <button type="button" onClick={() => void ctx.toggleStatus(bescheid)} className="text-xs font-medium text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg">{bescheid.status === 'offen' ? 'Erledigt' : 'Wieder öffnen'}</button> : null}<button type="button" onClick={() => void ctx.removeRecord(bescheid)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Bescheid löschen"><Trash2 className="w-4 h-4" /></button></div></div>

        <div className="mt-3 pl-3 border-l-2 border-gray-200 space-y-2">{violations.map(violation => <div key={violation.id} className="flex items-start justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-red-700">Verstoß</span><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${violation.status === 'offen' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>{violation.status === 'offen' ? 'Offen' : 'Erledigt'}</span></div><p className="text-sm text-gray-800 mt-1">{violation.subject}</p>{violation.note ? <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">{violation.note}</p> : null}</div><div className="flex gap-1 flex-shrink-0"><button type="button" onClick={() => void ctx.toggleStatus(violation)} className="text-xs font-medium text-gray-600 border border-gray-300 px-2 py-1 rounded-lg">{violation.status === 'offen' ? 'Erledigt' : 'Öffnen'}</button><button type="button" onClick={() => void ctx.removeRecord(violation)} className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg" aria-label="Verstoß löschen"><Trash2 className="w-3.5 h-3.5" /></button></div></div>)}
          <button type="button" onClick={() => ctx.openNewViolation(bescheid)} className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700"><Plus className="w-3.5 h-3.5" /> Verstoß zu diesem Bescheid melden</button>
        </div>
      </article>
    })}</div>}
  </section>
}
