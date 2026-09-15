import { useOutletContext } from 'react-router-dom'
import type { ZentraleContext } from './ZentraleShell'
import { IncidentCards } from './zentraleShared'

// Kein eigener "Neue Meldung"-Button hier - die Zentrale-Kopfzeile
// (ZentraleShell.tsx) zeigt ihn bereits auf jeder Seite, ein zweiter,
// gleich wirkender Button direkt darunter wäre nur eine Dopplung.
export default function ZentraleEinsaetze() {
  const ctx = useOutletContext<ZentraleContext>()
  return <section>
    <div className="mb-3"><h2 className="font-bold text-gray-900">Einsätze</h2><p className="text-sm text-gray-500">Kurze interne Koordination, keine Aktenbearbeitung.</p></div>
    <IncidentCards visibleIncidents={ctx.visibleIncidents} lageByIncidentId={ctx.lageByIncidentId} baustellen={ctx.baustellen} canOperateZentrale={ctx.canOperateZentrale} openEditIncident={ctx.openEditIncident} openLageForIncident={ctx.openLageForIncident} completeIncident={ctx.completeIncident} deleteIncident={ctx.deleteIncident} />
  </section>
}
