import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import { Empty } from '../../components/ZentraleEntryEditor'
import { supabase } from '../../lib/supabase'
import { formatTime } from '../../lib/zentraleShared'
import { ENTSCHEIDUNGSPUNKTE, EREIGNISSTUFEN, STUFE_META, TELEFONKETTE, noteWithoutStufe, readStoredStufe, withStufe, writeStoredStufe, type Ereignisstufe } from '../../lib/einsatzSchema'
import { nearbyByLine, type LatLng } from '../../lib/geo'
import type { IncidentReport, ZentraleBaustelle, ZentraleEntry } from '../../lib/types'

function NearbyBaustellenHint({ point, baustellen }: { point: LatLng | null; baustellen: readonly ZentraleBaustelle[] }) {
  const nearby = nearbyByLine(point, baustellen)
  if (nearby.length === 0) return null
  return <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2"><p className="text-sm font-bold text-orange-900">Baustelle in der Nähe</p><div className="space-y-1 mt-1">{nearby.map(item => <p key={item.id} className="text-sm text-orange-900">{item.titel}{item.status === 'gemeldet' ? <span className="text-xs font-medium text-orange-700 ml-1">(ungeprüft)</span> : null}{item.note ? <span className="text-orange-800"> · {item.note}</span> : null}</p>)}</div></div>
}

type IncidentVisual = { color: string; label: string }

export function IncidentCards({ visibleIncidents, baustellen, canOperateZentrale, openEditIncident, completeIncident, deleteIncident, accordion = false, expandedIncidentId = null, onToggleIncident, visualByIncidentId = {} }: {
  visibleIncidents: IncidentReport[]
  lageByIncidentId: Record<string, ZentraleEntry>
  baustellen: ZentraleBaustelle[]
  canOperateZentrale: boolean
  openEditIncident: (item: IncidentReport) => void
  openLageForIncident: (item: IncidentReport) => void
  completeIncident: (item: IncidentReport) => Promise<void>
  deleteIncident: (item: IncidentReport) => Promise<void>
  accordion?: boolean
  expandedIncidentId?: string | null
  onToggleIncident?: (item: IncidentReport) => void
  visualByIncidentId?: Record<string, IncidentVisual>
}) {
  const [levels, setLevels] = useState<Record<string, Ereignisstufe>>({})
  useEffect(() => {
    setLevels(current => {
      const next = { ...current }
      for (const item of visibleIncidents) {
        if (!next[item.id]) next[item.id] = readStoredStufe(item.id, item.note)
      }
      return next
    })
  }, [visibleIncidents])

  async function setStufe(item: IncidentReport, stufe: Ereignisstufe) {
    writeStoredStufe(item.id, stufe)
    setLevels(current => ({ ...current, [item.id]: stufe }))
    await supabase.from('incident_reports').update({ note: withStufe(noteWithoutStufe(item.note), stufe) || null }).eq('id', item.id)
  }

  return <div className="space-y-3">{visibleIncidents.length === 0
    ? <Empty text={accordion ? 'Keine Einsätze.' : 'Heute wurden noch keine Meldungen erfasst.'} />
    : visibleIncidents.map(item => {
      const point = item.location_lat !== null && item.location_lng !== null ? { lat: item.location_lat, lng: item.location_lng } : null
      const expanded = !accordion || expandedIncidentId === item.id
      const visual = visualByIncidentId[item.id]
      const bemerkung = noteWithoutStufe(item.note)
      const stufe = levels[item.id] ?? readStoredStufe(item.id, item.note)
      const meta = STUFE_META[stufe]
      const done = item.status === 'erledigt'
      return <article
        key={item.id}
        className={`rounded-2xl border overflow-hidden transition-shadow ${done ? 'border-gray-200 bg-gray-50 opacity-60' : expanded ? 'border-gray-300 bg-white shadow-sm' : 'border-gray-200 bg-white'}`}
        style={visual && !done ? { borderLeftWidth: 5, borderLeftColor: visual.color } : undefined}
      >
        <div className="flex items-start gap-2 p-3 sm:p-4">
          <button type="button" onClick={() => accordion && onToggleIncident?.(item)} className={`min-w-0 flex-1 text-left ${accordion ? 'rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500' : 'cursor-default'}`} aria-expanded={accordion ? expanded : undefined}>
            <div className="flex flex-wrap items-center gap-2">
              {visual && !done ? <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-extrabold text-white" style={{ backgroundColor: visual.color }}>{visual.label}</span> : null}
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
              <span className="font-bold text-gray-900">{formatTime(item.reported_at)}</span>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${done ? 'bg-gray-200 text-gray-600' : item.status === 'weitergegeben' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{done ? 'Abgeschlossen' : item.status === 'weitergegeben' ? 'An BP' : 'Offen'}</span>
              {accordion ? <span className="ml-auto text-gray-500">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span> : null}
            </div>
            <p className="mt-2 font-semibold text-gray-900">{item.location || 'Ohne Ortsangabe'}</p>
            {!expanded ? <p className="mt-1 line-clamp-2 text-sm text-gray-700">{item.summary}</p> : null}
          </button>
          {canOperateZentrale ? <div className="flex shrink-0 gap-1">
            {item.status === 'offen' ? <button type="button" onClick={() => void completeIncident(item)} className="text-xs font-medium text-green-700 border border-green-200 px-2.5 py-2 rounded-lg">Erledigt</button> : null}
            <button type="button" onClick={() => openEditIncident(item)} className="p-2 text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg" aria-label="Einsatzmeldung bearbeiten"><Pencil className="w-4 h-4" /></button>
            <button type="button" onClick={() => void deleteIncident(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Einsatzmeldung löschen"><Trash2 className="w-4 h-4" /></button>
          </div> : null}
        </div>
        {expanded ? <div className="border-t border-gray-100 px-3 pb-4 pt-3 sm:px-4">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.summary}</p>
          {canOperateZentrale ? <div className="flex flex-wrap gap-1.5 mt-3">{EREIGNISSTUFEN.map(key => {
            const row = STUFE_META[key]
            return <button key={key} type="button" onClick={() => void setStufe(item, key)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border" style={{ background: stufe === key ? row.bg : 'white', color: row.color, borderColor: row.color }}>{row.label}</button>
          })}</div> : null}
          <p className="text-xs text-gray-500 mt-2">{meta.hint} · {meta.dienstbetrieb}</p>
          {stufe !== 'klein' ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-bold">Verständigung telefonisch</p>
            <ul className="mt-1 list-disc pl-5">{TELEFONKETTE.map(name => <li key={name}>{name}</li>)}</ul>
            {stufe === 'gross' || stufe === 'katastrophe' ? <><p className="font-bold mt-2">Entscheidung</p><ul className="list-disc pl-5">{ENTSCHEIDUNGSPUNKTE.map(name => <li key={name}>{name}</li>)}</ul></> : null}
            <Link to="/stammdaten/kontakte" className="inline-block text-xs font-semibold text-blue-800 mt-2">Kontakte bearbeiten</Link>
          </div> : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-3">
            {item.caller_phone ? <span>TEL: {item.caller_phone}</span> : null}
            {item.caller_name ? <span>Melder: {item.caller_name}</span> : null}
            {bemerkung ? <span>{bemerkung}</span> : null}
          </div>
          <NearbyBaustellenHint point={point} baustellen={baustellen} />
        </div> : null}
      </article>
    })}</div>
}
