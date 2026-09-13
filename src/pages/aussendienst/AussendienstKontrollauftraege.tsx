import { Plus } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import type { AussendienstContext } from './AussendienstShell'
import { EntryOrIncidentList } from './aussendienstShared'

export default function AussendienstKontrollauftraege() {
  const ctx = useOutletContext<AussendienstContext>()
  return <div>
    {ctx.isGenehmiger ? <div className="mb-3 flex justify-end"><button type="button" onClick={ctx.openNewAuftrag} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Kontrollauftrag</button></div> : null}
    <EntryOrIncidentList kind="entries" entries={ctx.kontrollauftraege} canManage={ctx.isGenehmiger} onEdit={ctx.openEditAuftrag} />
  </div>
}
