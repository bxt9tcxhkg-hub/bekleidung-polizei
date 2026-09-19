import { Plus } from 'lucide-react'
import { useKontrollauftraege } from '../../lib/kontrollauftraege'
import { AuftragModal, EntryOrIncidentList } from './aussendienstShared'

// Eigenständige Seite statt AussendienstContext, damit sie unverändert sowohl
// unter /aussendienst/kontrollauftraege als auch unter
// /zentrale/kontrollauftraege eingehängt werden kann (siehe App.tsx) - der
// Genehmiger verlässt für Kontrollaufträge nicht mehr die Zentrale-Navigation.
export default function KontrollauftraegePage() {
  const ctx = useKontrollauftraege()
  return <div>
    {ctx.error ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{ctx.error}</div> : null}
    {ctx.isGenehmiger ? <div className="mb-3 flex justify-end"><button type="button" onClick={ctx.openNew} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Kontrollauftrag</button></div> : null}
    {ctx.loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : <EntryOrIncidentList kind="entries" entries={ctx.items} canManage={ctx.isGenehmiger} onEdit={ctx.openEdit} onToggleErledigt={ctx.toggleErledigt} />}
    {ctx.showForm ? <AuftragModal auftrag={ctx.auftrag} setAuftrag={ctx.setAuftrag} editing={ctx.editing} saving={ctx.saving} error={ctx.formError} locating={ctx.locating} locateError={ctx.locateError} locate={ctx.locate} close={ctx.close} save={ctx.save} remove={ctx.remove} /> : null}
  </div>
}
