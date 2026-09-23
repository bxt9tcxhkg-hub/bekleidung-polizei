import { useOutletContext } from 'react-router-dom'
import type { AussendienstContext } from './AussendienstShell'
import { EntryOrIncidentList } from './aussendienstShared'

export default function AussendienstEinsaetze() {
  const ctx = useOutletContext<AussendienstContext>()
  const common = {
    kind: 'incidents' as const,
    baustellen: ctx.baustellen,
    ownVehicleId: ctx.ownVehicle?.id ?? null,
    incidentSupports: ctx.incidentSupports,
    takeOverIncident: ctx.takeOverIncident,
    releaseIncidentTakeover: ctx.releaseIncidentTakeover,
    supportIncident: ctx.supportIncident,
    stopSupportingIncident: ctx.stopSupportingIncident,
    completeIncident: ctx.completeIncident,
    reopenIncident: ctx.reopenIncident,
    incidentContextSummary: ctx.incidentContextSummary,
  }

  return <div className="space-y-6 pb-6">
    <section>
      <div className="mb-2"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Meine Arbeit</p><h2 className="text-lg font-bold text-gray-900">Meiner Streife zugewiesen</h2></div>
      <EntryOrIncidentList {...common} incidents={ctx.ownIncidents} emptyText="Der eigenen Streife ist derzeit kein Einsatz zugewiesen." />
    </section>
    {ctx.supportedIncidents.length > 0 ? <section>
      <div className="mb-2"><p className="text-xs font-bold uppercase tracking-wider text-purple-700">Unterstützung</p><h2 className="text-lg font-bold text-gray-900">Von meiner Streife unterstützt</h2></div>
      <EntryOrIncidentList {...common} incidents={ctx.supportedIncidents} />
    </section> : null}
    <section>
      <div className="mb-2"><p className="text-xs font-bold uppercase tracking-wider text-gray-500">Verfügbarer Pool</p><h2 className="text-lg font-bold text-gray-900">Noch nicht disponiert</h2><p className="mt-1 text-xs text-gray-500">Nur offene Einsätze ohne zugewiesene Streife.</p></div>
      <EntryOrIncidentList {...common} incidents={ctx.availableIncidents} emptyText="Keine verfügbaren Einsätze." />
    </section>
    {ctx.completedIncidents.length > 0 ? <details className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <summary className="cursor-pointer text-sm font-bold text-gray-700">Heute abgeschlossen ({ctx.completedIncidents.length})</summary>
      <div className="mt-3"><EntryOrIncidentList {...common} incidents={ctx.completedIncidents} /></div>
    </details> : null}
  </div>
}
