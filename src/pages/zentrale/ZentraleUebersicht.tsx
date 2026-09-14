import { MapPin, UsersRound } from 'lucide-react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import LeafletMap from '../../components/LeafletMap'
import { personDisplayName } from '../../lib/register'
import { ZUSTAND_LABEL, formatZeitraum, strassenName } from '../../lib/strassenzustand'
import type { ZentraleEntryCategory } from '../../lib/types'
import type { ZentraleContext } from './ZentraleShell'
import { DutyPanel, IncidentCards, SofortWichtig } from './zentraleShared'
import { AV_BV_ART_LABEL, FAHNDUNG_ART_LABEL, formatTime } from '../../lib/zentraleShared'

// Wohin ein Klick auf einen "Sofort wichtig"-Eintrag führt, dessen Kategorie
// eine eigene Sidebar-Seite ist.
const CATEGORY_ROUTE: Partial<Record<ZentraleEntryCategory, string>> = { brief: '/rsa-rsb' }

export default function ZentraleUebersicht() {
  const ctx = useOutletContext<ZentraleContext>()
  const navigate = useNavigate()

  return <div className="space-y-6">
    {/* Priorität nach Zustand, nicht nach Kategorie: nur was gerade aktiv
        ist, steht oben. Straßenzustand ist die meiste Zeit irrelevant und
        taucht deshalb nur auf, solange eine Sperre/Maßnahme aktuell gilt. */}
    <SofortWichtig items={[
      ...ctx.criticalEntries.map(item => ({
        id: item.id, title: item.title, description: item.description,
        onOpen: () => {
          if (item.category === 'lage') { navigate('/zentrale/lage'); ctx.openEditEntry(item) }
          // Übergabepunkte werden jetzt ausschließlich im Innendienst angelegt/bearbeitet.
          else if (item.category === 'uebergabe') { navigate('/innendienst') }
          else { const route = CATEGORY_ROUTE[item.category]; if (route) navigate(route) }
        },
      })),
      ...ctx.criticalAvBv.map(item => ({ id: item.id, title: `AV/BV & EV (${AV_BV_ART_LABEL[item.art]}) · ${(item.person ? personDisplayName(item.person) : (item.object?.address ?? item.gebiet ?? 'ohne Zuordnung'))}`, description: item.grund, onOpen: () => navigate('/zentrale/av-bv-ev') })),
      ...ctx.criticalFahndungen.map(item => ({ id: item.id, title: `Fahndung (${FAHNDUNG_ART_LABEL[item.art]}) · ${(item.person ? personDisplayName(item.person) : (item.object?.address ?? 'ohne Zuordnung'))}`, description: item.beschreibung, onOpen: () => navigate('/zentrale/fahndungen') })),
      ...ctx.criticalStrassensperren.map(item => ({ id: `${item.strasse_id ?? item.strasse_freitext}-${item.created_at}`, title: `Straßenzustand: ${strassenName(item)} · ${item.zustand === 'sonstige' ? (item.zustand_freitext ?? ZUSTAND_LABEL.sonstige) : ZUSTAND_LABEL[item.zustand]}`, description: formatZeitraum(item), onOpen: () => navigate('/zentrale/strassenzustand') })),
    ]} incomplete={ctx.criticalSourcesError} />
    <section><h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3"><MapPin className="w-4 h-4 text-blue-700" /> Aktive Einsätze – Gemeindegebiet Dornbirn</h2><LeafletMap height={280} markers={ctx.openIncidentMarkers} lines={ctx.baustellenLines} fitLines={false} /></section>
    <section><div className="flex items-center justify-between mb-3"><h2 className="font-bold text-gray-900">Heutige Meldungen</h2>{ctx.canOperateZentrale ? <button type="button" onClick={ctx.openIncident} className="text-sm font-semibold text-blue-700">Meldung erfassen</button> : null}</div><IncidentCards visibleIncidents={ctx.visibleIncidents} lageByIncidentId={ctx.lageByIncidentId} canManage={ctx.canManage} canOperateZentrale={ctx.canOperateZentrale} openLageForIncident={ctx.openLageForIncident} completeIncident={ctx.completeIncident} deleteIncident={ctx.deleteIncident} /></section>
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
      <h2 className="font-bold text-amber-900 flex items-center gap-2"><UsersRound className="w-4 h-4" /> Schichtübergabe</h2>
      <p className="text-sm text-amber-800 mt-1">Am Ende der Schicht an die Ablöse zu übergeben - ergibt sich automatisch aus den noch offenen Einsätzen, kein eigener Eintrag nötig.</p>
      {ctx.uebergabeIncidents.length === 0 ? <p className="text-sm text-amber-700 mt-3">Keine offenen Einsätze zu übergeben.</p> : <ul className="mt-3 space-y-1.5 text-sm text-amber-900">{ctx.uebergabeIncidents.map(item => <li key={item.id}>• {formatTime(item.reported_at)} – {item.location || item.summary.slice(0, 60)}</li>)}</ul>}
    </section>
    {/* Besetzung: einmal pro Schicht eingetragen, danach nur bei Bedarf
        nachgeschaut - deshalb bewusst unten, nicht mehr direkt unter
        "Sofort wichtig". */}
    <DutyPanel assignments={ctx.shiftAssignments} functions={ctx.dutyFunctions} dutyShift={ctx.dutyShift} setDutyShift={ctx.setDutyShift} />
    {/* Baustellen sind maximal für die Karte relevant (Streckenkenntnis) -
        keine eigene Verwaltungsliste auf der Übersicht, die lebt jetzt auf
        einer eigenen Sidebar-Seite (/zentrale/baustellen). */}
    <div><h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Informativ – bei Bedarf</h2><p className="text-sm text-gray-500">Weitere Bereiche (AV/BV & EV, Personenhinweise, Fahndungen, RSa/RSb, Schlüssel, Kontakte, Alarmierung, Unterlagen, Personen, Objekte, Baustellen …) über die Seitenleiste.</p></div>
  </div>
}
