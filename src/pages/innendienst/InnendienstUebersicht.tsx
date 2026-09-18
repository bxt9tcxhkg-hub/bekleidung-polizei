import { CheckCircle2, ClipboardList, Coins, Music, Palette, Plus, ShieldAlert } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import WichtigeTelefonnummernCard from '../../components/WichtigeTelefonnummernCard'
import { formatEuro } from './innendienstShared'
import type { InnendienstContext } from './InnendienstShell'

function Stat({ icon: Icon, label, value }: { icon: typeof Music; label: string; value: number }) { return <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2.5"><Icon className="w-4 h-4 text-gray-400 mb-1" /><p className="text-xs text-gray-500">{label}</p><p className="text-lg font-bold text-gray-900">{value}</p></div> }

// Reihenfolge nach tatsächlicher Relevanz, nicht nach Kategorie: die
// Kassenabrechnung ist nur bei Dienstbeginn/-ende ein Thema (Karte tritt
// nach Bestätigung von selbst in den Hintergrund), danach kommt die
// eigentliche Innendienst-Arbeit - Bescheide & Verstöße. RSa/RSb ist am
// Computer-Arbeitsplatz jederzeit über die Sidebar erreichbar und braucht
// hier keine eigene Übersichtskarte.
export default function InnendienstUebersicht() {
  const ctx = useOutletContext<InnendienstContext>()
  const { ownTask } = ctx
  return <div className="space-y-4 mb-6">
    <WichtigeTelefonnummernCard />
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-bold text-gray-900 flex items-center gap-2"><Coins className="w-4 h-4 text-blue-700" /> Kassenabrechnung</h2><p className="text-xs text-gray-500 mt-0.5">Grundbestand {formatEuro(ownTask?.float_amount ?? 500)} · erst Erlös laut Kasse, dann Stückelungen zählen.</p>
      {ownTask?.kasse_confirmed_at && ownTask.expected_revenue != null ? <div className="mt-2 space-y-1.5"><div className="rounded-xl bg-green-50 border border-green-200 text-green-800 px-4 py-3 flex items-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Abgerechnet um {new Date(ownTask.kasse_confirmed_at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}</div>
        <dl className="text-sm grid grid-cols-2 gap-x-3 gap-y-1 px-1"><dt className="text-gray-500">Erlös lt. Kasse</dt><dd className="text-right font-medium">{formatEuro(ownTask.expected_revenue)}</dd><dt className="text-gray-500">Gezählt</dt><dd className="text-right font-medium">{formatEuro(ownTask.counted_total ?? 0)}</dd><dt className="text-gray-500">Differenz</dt><dd className={`text-right font-bold ${Math.round(((ownTask.counted_total ?? 0) - ownTask.float_amount - ownTask.expected_revenue) * 100) === 0 ? 'text-green-700' : 'text-red-700'}`}>{formatEuro((ownTask.counted_total ?? 0) - ownTask.float_amount - ownTask.expected_revenue)}</dd></dl>
        <button type="button" onClick={ctx.openKasseWizard} className="text-xs font-semibold text-blue-700 mt-1">Erneut abrechnen</button>
      </div> : <div className="mt-2"><p className="text-sm text-gray-500 mb-2">{ownTask?.kasse_confirmed_at ? 'Bestätigt, aber ohne Kassensturz erfasst – bitte nachholen.' : 'Noch nicht bestätigt.'}</p><button type="button" onClick={ctx.openKasseWizard} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2 rounded-lg">Kasse abrechnen</button></div>}
    </section>

    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><h2 className="font-bold text-gray-900 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-blue-700" /> Bescheide heute</h2></div><div className="grid grid-cols-2 gap-2 mt-2"><Stat icon={Music} label="Straßenmusik" value={ctx.todaysBescheide.filter(item => item.kind === 'bescheid_strassenmusik').length} /><Stat icon={Palette} label="Straßenkunst" value={ctx.todaysBescheide.filter(item => item.kind === 'bescheid_strassenkunst').length} /></div><div className="flex flex-wrap gap-2 mt-3"><button type="button" onClick={() => ctx.openNewBescheid('bescheid_strassenmusik')} className="inline-flex items-center gap-1.5 text-xs font-medium border border-gray-300 px-3 py-1.5 rounded-lg"><Plus className="w-3.5 h-3.5" /> Straßenmusik</button><button type="button" onClick={() => ctx.openNewBescheid('bescheid_strassenkunst')} className="inline-flex items-center gap-1.5 text-xs font-medium border border-gray-300 px-3 py-1.5 rounded-lg"><Plus className="w-3.5 h-3.5" /> Straßenkunst</button></div></section>

    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-bold text-gray-900 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-blue-700" /> Verstöße & Übergabe</h2><p className="text-sm text-gray-700 mt-2">{ctx.openViolations.length} offene{ctx.openViolations.length === 1 ? 'r' : ''} Verstoß{ctx.openViolations.length === 1 ? '' : 'e'} gegen Auflagen eines Bescheids.</p>{ctx.bescheide.length === 0 ? <p className="text-xs text-gray-400 mt-1">Verstöße lassen sich erst nach dem ersten Bescheid erfassen.</p> : <button type="button" onClick={() => ctx.openNewViolation()} className="inline-flex items-center gap-1.5 text-xs font-medium border border-gray-300 px-3 py-1.5 rounded-lg mt-2"><Plus className="w-3.5 h-3.5" /> Verstoß melden</button>}{ctx.handovers.length > 0 ? <div className="mt-3 space-y-1.5">{ctx.handovers.slice(0, 3).map(item => <p key={item.id} className="text-sm text-gray-700">• {item.title}</p>)}</div> : null}</section>
  </div>
}
