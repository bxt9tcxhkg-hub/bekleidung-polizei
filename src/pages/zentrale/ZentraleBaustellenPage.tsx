import { useOutletContext } from 'react-router-dom'
import { Empty } from '../../components/ZentraleEntryEditor'
import type { ZentraleContext } from './ZentraleShell'
import { BaustellenList } from './zentraleShared'

// Baustellen sind für die Streife maximal als Streckeninfo relevant (auf der
// Karte in der Übersicht), nie dringend genug für "Sofort wichtig" oder die
// Übersicht selbst - Melden/Verwalten lebt deshalb hier, als eigene, ruhig
// erreichbare Sidebar-Seite, wie Straßenzustand.

export default function ZentraleBaustellenPage() {
  const ctx = useOutletContext<ZentraleContext>()

  return <div>
    <div className="flex items-center justify-between gap-3 mb-5">
      <div><h1 className="text-2xl font-bold text-gray-900">Baustellen</h1><p className="text-sm text-gray-500 mt-1">Für die Streife: Streckenkenntnis, falls ein Einsatzort über eine gesperrte Straße nicht erreichbar ist.</p></div>
      <button type="button" onClick={ctx.openNewBaustelle} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg flex-shrink-0">+ Baustelle melden</button>
    </div>
    {ctx.baustellen.length > 0 ? <BaustellenList items={ctx.baustellen} canManage={ctx.canManage} onConfirm={ctx.confirmBaustelle} onEdit={ctx.openEditBaustelle} onClose={ctx.closeBaustelle} onDelete={ctx.deleteBaustelle} /> : <Empty text="Keine Baustellen gemeldet." />}
  </div>
}
