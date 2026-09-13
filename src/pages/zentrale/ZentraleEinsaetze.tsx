import { Plus } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import type { ZentraleContext } from './ZentraleShell'
import { IncidentCards } from './zentraleShared'

export default function ZentraleEinsaetze() {
  const ctx = useOutletContext<ZentraleContext>()
  return <section>
    <div className="flex items-center justify-between gap-3 mb-3">
      <div><h2 className="font-bold text-gray-900">Einsätze</h2><p className="text-sm text-gray-500">Kurze interne Koordination, keine Aktenbearbeitung.</p></div>
      {ctx.canOperateZentrale ? <button type="button" onClick={ctx.openIncident} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Neue Meldung</button> : null}
    </div>
    <IncidentCards visibleIncidents={ctx.visibleIncidents} lageByIncidentId={ctx.lageByIncidentId} canManage={ctx.canManage} canOperateZentrale={ctx.canOperateZentrale} openLageForIncident={ctx.openLageForIncident} completeIncident={ctx.completeIncident} deleteIncident={ctx.deleteIncident} />
  </section>
}
