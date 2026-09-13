import { AlertTriangle, Car, CheckCircle2, Circle, Construction, ListChecks, Plus, Radio, ShieldAlert, UsersRound } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { formatTime } from '../../lib/zentraleShared'
import type { AussendienstContext } from './AussendienstShell'

// Reihenfolge nach dem tatsächlichen Dienstablauf, nicht nach Kategorie:
// zuerst Warnungen (jederzeit relevant), dann der Dienst beginnt mit dem
// Fahrzeugcheck, danach folgt die Kontrollauftrags-To-do-Liste - erst dann
// der Rest (aktive Einsätze, Streifeninfo, Baustelle melden).
export default function AussendienstUebersicht() {
  const ctx = useOutletContext<AussendienstContext>()
  if (!ctx.ownAssignment) return null
  const { ownAssignment, ownFunction, ownVehicle, ownCheck, patrolMates } = ctx
  return <div className="space-y-4 mb-6">
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-bold text-gray-900 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-blue-700" /> Wichtige Hinweise</h2>
      {ctx.criticalSourcesError ? <p className="text-xs font-medium text-amber-700 flex items-center gap-1.5 mt-2"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> AV/BV & EV bzw. Fahndungen konnten nicht vollständig geladen werden - es könnten weitere Warnungen fehlen. Bitte Seite neu laden.</p> : null}
      {ctx.criticalItems.length === 0 ? (ctx.criticalSourcesError ? null : <p className="text-sm text-gray-500 mt-2">Keine aktuell dringenden Warnungen.</p>) : <div className="mt-2 space-y-2">{ctx.criticalItems.map(item => <div key={item.id} className="rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2"><p className="font-bold text-red-900 text-sm">{item.title}</p>{item.description ? <p className="text-sm text-red-800">{item.description}</p> : null}</div>)}</div>}
    </section>

    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-bold text-gray-900 flex items-center gap-2"><Car className="w-4 h-4 text-blue-700" /> Vor Dienstbeginn – Fahrzeug- und Materialcheck</h2>
      {!ownVehicle ? <p className="text-sm text-gray-500 mt-2">Erst nach Fahrzeugzuweisung möglich.</p>
      : ownCheck ? <div className={`mt-2 rounded-xl px-4 py-3 flex items-center gap-2 text-sm ${ownCheck.status === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>{ownCheck.status === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}<span>{ownCheck.status === 'ok' ? 'Kontrolliert – in Ordnung' : `Mangel gemeldet${ownCheck.note ? `: ${ownCheck.note}` : ''}`}</span></div>
      : <div className="mt-2"><p className="text-sm text-amber-700 mb-2">Noch nicht kontrolliert – bitte vor Dienstantritt durchführen (kein Zwang, nur Erinnerung).</p><div className="flex flex-wrap gap-2"><button type="button" disabled={ctx.saving} onClick={() => void ctx.saveVehicleCheck('ok', '')} className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60">Kontrolliert – in Ordnung</button><button type="button" onClick={() => ctx.setShowMangelForm(true)} className="border border-amber-300 text-amber-800 text-sm font-medium px-4 py-2 rounded-lg">Mangel melden</button></div>
        {ctx.showMangelForm ? <div className="mt-3 flex flex-col sm:flex-row gap-2"><input className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Was fehlt / ist beschädigt?" value={ctx.checkNote} onChange={event => ctx.setCheckNote(event.target.value)} /><button type="button" disabled={ctx.saving} onClick={() => void ctx.saveVehicleCheck('mangel', ctx.checkNote)} className="bg-amber-700 hover:bg-amber-800 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60">Melden</button></div> : null}</div>}
    </section>

    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-gray-100"><h2 className="font-bold text-gray-900 flex items-center gap-2"><ListChecks className="w-4 h-4 text-blue-700" /> Kontrollaufträge</h2><p className="text-xs text-gray-500 mt-1">Mit Klick erledigt markieren - die Uhrzeit ist nur eine Gedankenstütze für die spätere Protokollierung im PAD, kein Nachweis.</p></div>
      {ctx.kontrollauftraege.length === 0 ? <p className="text-sm text-gray-500 p-4 sm:p-5">Keine Kontrollaufträge für die heutige Funktion.</p> : <div className="divide-y divide-gray-100">{ctx.kontrollauftraege.map(item => {
        const erledigt = item.status === 'erledigt'
        return <div key={item.id} className="p-4 sm:p-5 flex items-start gap-3">
          <button type="button" onClick={() => void ctx.toggleKontrollauftragErledigt(item)} className={`mt-0.5 flex-shrink-0 ${erledigt ? 'text-green-600' : 'text-gray-300 hover:text-gray-400'}`} aria-label={erledigt ? 'Als offen markieren' : 'Als erledigt markieren'}>{erledigt ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}</button>
          <div className="min-w-0"><p className={`text-sm font-semibold ${erledigt ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{item.title}</p>{item.description ? <p className={`text-sm mt-0.5 whitespace-pre-wrap ${erledigt ? 'text-gray-400' : 'text-gray-600'}`}>{item.description}</p> : null}{item.location ? <p className="text-xs text-gray-500 mt-1">Ort: {item.location}</p> : null}{erledigt && item.erledigt_at ? <p className="text-xs text-gray-400 mt-1">Erledigt um {formatTime(item.erledigt_at)}</p> : null}</div>
        </div>
      })}</div>}
    </section>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-bold text-gray-900 flex items-center gap-2"><Radio className="w-4 h-4 text-blue-700" /> Jetzt offen</h2>{ctx.openIncidents.length === 0 ? <p className="text-sm text-gray-500 mt-2">Keine offenen Einsätze.</p> : <ul className="mt-2 space-y-1.5 text-sm text-gray-700">{ctx.openIncidents.slice(0, 4).map(item => <li key={item.id}>• {formatTime(item.reported_at)} – {item.location || item.summary.slice(0, 40)}</li>)}</ul>}</section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="font-bold text-gray-900 flex items-center gap-2"><UsersRound className="w-4 h-4 text-blue-700" /> Meine Streife</h2><p className="text-sm text-gray-500 mt-1">{ownFunction?.label ?? ownAssignment.function} · {ownAssignment.shift === 'tag' ? 'Tagdienst' : 'Nachtdienst'}</p><p className="text-sm text-gray-700 mt-2">{patrolMates.length === 0 ? 'Keine weiteren Kolleginnen/Kollegen in dieser Funktion eingetragen.' : `Mit: ${patrolMates.map(item => item.profiles?.name).filter(Boolean).join(', ')}`}</p>{ownVehicle ? <p className="text-sm font-semibold text-blue-700 mt-2">Fahrzeug: {ownVehicle.call_sign || ownVehicle.name}{ownVehicle.license_plate ? ` · ${ownVehicle.license_plate}` : ''}</p> : <p className="text-sm text-gray-500 mt-2">Kein Fahrzeug zugewiesen (auf der Startseite wählbar).</p>}</section>
    </div>

    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-gray-900 flex items-center gap-2"><Construction className="w-4 h-4 text-blue-700" /> Baustelle wahrgenommen?</h2><button type="button" onClick={ctx.openBaustelleReport} className="inline-flex items-center gap-2 border border-blue-200 text-blue-800 text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Baustelle melden</button></div><p className="text-sm text-gray-500 mt-1">Wird von der Zentrale geprüft und dort auf der Karte bestätigt.</p></section>
  </div>
}
