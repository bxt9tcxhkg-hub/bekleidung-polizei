import { Pencil, Trash2 } from 'lucide-react'
import { Empty } from '../../components/ZentraleEntryEditor'
import { formatTime } from '../../lib/zentraleShared'
import { STUFE_META, readStoredStufe } from '../../lib/einsatzSchema'
import type { IncidentReport, ZentraleEntry } from '../../lib/types'

type IncidentVisual = { color: string; label: string }

export function IncidentCards({
  visibleIncidents, canOperateZentrale, openEditIncident, completeIncident, deleteIncident,
  visualByIncidentId = {}, selectedIncidentId = null, onOpenIncident,
}: {
  visibleIncidents: IncidentReport[]
  lageByIncidentId: Record<string, ZentraleEntry>
  canOperateZentrale: boolean
  openEditIncident: (item: IncidentReport) => void
  openLageForIncident: (item: IncidentReport) => void
  completeIncident: (item: IncidentReport) => Promise<void>
  deleteIncident: (item: IncidentReport) => Promise<void>
  accordion?: boolean
  expandedIncidentId?: string | null
  onToggleIncident?: (item: IncidentReport) => void
  visualByIncidentId?: Record<string, IncidentVisual>
  selectedIncidentId?: string | null
  onOpenIncident?: (item: IncidentReport) => void
}) {
  return <div className="space-y-3">{visibleIncidents.length === 0
    ? <Empty text="Keine Einsätze." />
    : visibleIncidents.map(item => {
      const visual = visualByIncidentId[item.id]
      const stufe = readStoredStufe(item.id, item.note)
      const meta = STUFE_META[stufe]
      const done = item.status === 'erledigt'
      const selected = selectedIncidentId === item.id
      return <article key={item.id} className={`rounded-2xl border overflow-hidden ${done ? 'border-gray-200 bg-gray-50 opacity-60' : selected ? 'border-blue-400 bg-white shadow-sm' : 'border-gray-200 bg-white'}`} style={visual && !done ? { borderLeftWidth: 5, borderLeftColor: visual.color } : undefined}>
        <div className="flex items-start gap-2 p-3 sm:p-4">
          <button type="button" onClick={() => onOpenIncident?.(item)} className="min-w-0 flex-1 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <div className="flex flex-wrap items-center gap-2">
              {visual && !done ? <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-extrabold text-white" style={{ backgroundColor: visual.color }}>{visual.label}</span> : null}
              <span className="font-bold text-gray-900">{formatTime(item.reported_at)}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${done ? 'bg-gray-200 text-gray-600' : item.status === 'weitergegeben' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{done ? 'Abgeschlossen' : item.status === 'weitergegeben' ? 'An BP' : 'Offen'}</span>
            </div>
            <p className="mt-2 font-semibold text-gray-900">{item.location || 'Ohne Ortsangabe'}</p>
            <p className="mt-1 line-clamp-2 text-sm text-gray-700">{item.summary}</p>
          </button>
          {canOperateZentrale ? <div className="flex shrink-0 gap-1">
            {item.status === 'offen' ? <button type="button" onClick={() => void completeIncident(item)} className="text-xs font-medium text-green-700 border border-green-200 px-2.5 py-2 rounded-lg">Erledigt</button> : null}
            <button type="button" onClick={() => openEditIncident(item)} className="p-2 text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg" aria-label="Einsatzmeldung bearbeiten"><Pencil className="w-4 h-4" /></button>
            <button type="button" onClick={() => void deleteIncident(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Einsatzmeldung löschen"><Trash2 className="w-4 h-4" /></button>
          </div> : null}
        </div>
      </article>
    })}</div>
}
