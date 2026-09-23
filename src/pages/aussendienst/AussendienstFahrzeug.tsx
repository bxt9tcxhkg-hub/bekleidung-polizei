import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Wrench } from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import type { AussendienstContext } from './AussendienstShell'
import { Empty } from './aussendienstShared'

export default function AussendienstFahrzeug() {
  const ctx = useOutletContext<AussendienstContext>()
  const [note, setNote] = useState('')
  const ownVehicle = ctx.ownVehicle
  if (!ownVehicle) return <Empty text="Kein Fahrzeug zugewiesen." />
  return <div className="space-y-4">
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Mein Dienstfahrzeug</p><h2 className="mt-1 text-xl font-bold text-gray-900">{ownVehicle.call_sign || ownVehicle.name}</h2><p className="mt-1 text-sm text-gray-600">{ownVehicle.license_plate || 'Kein Kennzeichen hinterlegt'} · {[ownVehicle.make, ownVehicle.model].filter(Boolean).join(' ') || 'Marke/Modell nicht hinterlegt'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ownVehicle.operational_status === 'verfuegbar' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{ownVehicle.operational_status === 'verfuegbar' ? 'Verfügbar' : ownVehicle.operational_status === 'werkstatt' ? 'Werkstatt' : 'Außer Dienst'}</span></div>
      {ownVehicle.operational_status_note ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{ownVehicle.operational_status_note}</p> : null}
    </section>

    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-bold text-gray-900">{ctx.ownCheck?.status === 'ok' ? <CheckCircle2 className="h-5 w-5 text-green-700" /> : <Wrench className="h-5 w-5 text-amber-700" />} Fahrzeugcheck</h2>
      {ctx.ownCheck ? <div className={`mt-3 rounded-xl border p-3 text-sm ${ctx.ownCheck.status === 'ok' ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><p className="font-semibold">{ctx.ownCheck.status === 'ok' ? 'Für diesen Dienst erledigt' : 'Mangel gemeldet'}</p>{ctx.ownCheck.note ? <p className="mt-1">{ctx.ownCheck.note}</p> : null}</div> : <div className="mt-3 space-y-3">
        <p className="text-sm text-gray-600">Vor Dienstbeginn Vollständigkeit und Zustand prüfen.</p>
        <div className="grid gap-2 sm:grid-cols-2"><button type="button" disabled={ctx.saving} onClick={() => void ctx.saveVehicleCheck('ok', '')} className="min-h-12 rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">In Ordnung</button><button type="button" onClick={() => ctx.setShowMangelForm(!ctx.showMangelForm)} className="min-h-12 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900"><AlertTriangle className="mr-1.5 inline h-4 w-4" />Mangel melden</button></div>
        {ctx.showMangelForm ? <div className="space-y-2"><label className="block text-xs font-semibold text-gray-600">Was fehlt oder ist beschädigt?<input value={note} onChange={event => setNote(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-3 text-base sm:text-sm" /></label><button type="button" disabled={ctx.saving || !note.trim()} onClick={() => void ctx.saveVehicleCheck('mangel', note)} className="min-h-11 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Mangel speichern</button></div> : null}
      </div>}
    </section>

    <Link to={`/fuhrpark/${ownVehicle.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-blue-800"><ExternalLink className="h-4 w-4" /> Füllliste, Fristen und Fahrzeugdetails</Link>
  </div>
}
