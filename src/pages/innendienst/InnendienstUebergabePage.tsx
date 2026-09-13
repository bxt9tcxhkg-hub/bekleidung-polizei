import { CheckCircle2, Pencil, Plus } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import type { InnendienstContext } from './InnendienstShell'

function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"><CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{text}</p></div> }

export default function InnendienstUebergabePage() {
  const ctx = useOutletContext<InnendienstContext>()
  return <div>
    {ctx.canManageZentrale ? <div className="mb-3 flex justify-end"><button type="button" onClick={ctx.openNewHandover} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Übergabepunkt</button></div> : null}
    {ctx.handovers.length === 0 ? <Empty text="Keine offenen Übergabepunkte." /> : <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">{ctx.handovers.map(item => <article key={item.id} className="p-4 sm:p-5 flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold text-gray-900">{item.title}</h3>{item.description ? <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.description}</p> : null}</div>{ctx.canManageZentrale ? <button type="button" onClick={() => ctx.openEditHandover(item)} className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex-shrink-0" aria-label="Übergabepunkt bearbeiten"><Pencil className="w-4 h-4" /></button> : null}</article>)}</div>}
  </div>
}
