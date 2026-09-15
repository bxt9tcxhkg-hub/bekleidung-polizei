import { useOutletContext } from 'react-router-dom'
import { EntryList } from '../../components/ZentraleEntryEditor'
import type { ZentraleContext } from './ZentraleShell'

export default function ZentraleLagePage() {
  const ctx = useOutletContext<ZentraleContext>()
  return <EntryList
    title="Operative Lage"
    description='Ereignisse, Sperren, Gefahren- und Lagehinweise – wird aus einem Einsatz auf der Seite „Einsätze" erklärt.'
    entries={ctx.lageEntries}
    canManage={ctx.canOperateZentrale}
    // Entsteht ausschließlich über die Aktion an einem Einsatz - kein eigenständiges "Neu" hier.
    openNew={() => {}}
    openEdit={ctx.openEditEntry}
    incidentsById={ctx.incidentsById}
    hideCreate
  />
}
