import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import LeafletMap from '../../components/LeafletMap'
import WichtigeTelefonnummernCard from '../../components/WichtigeTelefonnummernCard'
import { firstControlDeadline, hasInitialControl, loadSchutzfaelleMitKontrollauftrag, MASSNAHME_LABEL, SCHUTZ_SELECT, type Schutzfall } from '../../lib/schutzmassnahmen'
import { supabase } from '../../lib/supabase'
import { ZUSTAND_LABEL, formatZeitraum, strassenName } from '../../lib/strassenzustand'
import type { IncidentReport } from '../../lib/types'
import type { ZentraleContext } from './ZentraleShell'
import { IncidentCards, SofortWichtig } from './zentraleShared'
import { formatTime } from '../../lib/zentraleShared'
import EinsatzArbeitModal from './EinsatzArbeitModal'

const INCIDENT_COLORS = ['#2563eb', '#ea580c', '#7c3aed', '#0f766e', '#be185d', '#4d7c0f', '#0891b2', '#92400e']

export default function ZentraleUebersicht() {
  const ctx = useOutletContext<ZentraleContext>()
  const navigate = useNavigate()
  const [schutzfaelle, setSchutzfaelle] = useState<Schutzfall[]>([])
  const [schutzError, setSchutzError] = useState(false)
  // Erstkontrolle-Warnung gilt nur für Schutzfälle, für die tatsächlich ein
  // Kontrollauftrag angefordert wurde (siehe ZentraleAvBv.tsx) - sonst würde
  // die Warnung der dort bewusst getroffenen Entscheidung widersprechen.
  const [kontrolliert, setKontrolliert] = useState<Set<string>>(new Set())
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null)
  const [workIncident, setWorkIncident] = useState<IncidentReport | null>(null)
  const previousOpenCountRef = useRef(0)
  const [now] = useState(() => new Date().getTime())
  useEffect(() => {
    void Promise.all([
      supabase.from('schutzfaelle').select(SCHUTZ_SELECT).eq('status', 'aktiv').gt('ende', new Date().toISOString()).order('ende'),
      loadSchutzfaelleMitKontrollauftrag(),
    ]).then(([result, ids]) => {
      setSchutzError(Boolean(result.error))
      setSchutzfaelle(result.error ? [] : (result.data ?? []) as unknown as Schutzfall[])
      setKontrolliert(ids)
    })
  }, [])
  const schutzWarnings = useMemo(() => schutzfaelle.filter(item =>
    (kontrolliert.has(item.id) && !hasInitialControl(item) && firstControlDeadline(item).getTime() < now)
    || new Date(item.ende).getTime() - now < 24 * 60 * 60 * 1000
  ), [schutzfaelle, now, kontrolliert])
  const schutzCircles = useMemo(() => schutzfaelle.flatMap(item => (item.bereiche ?? []).map(area => ({
    lat: area.lat, lng: area.lng, radiusMeters: area.radius_m,
    popup: `${MASSNAHME_LABEL[item.massnahme]} · ${area.bezeichnung} · PAD ${item.pad_aktenzahl}`,
    color: item.massnahme === 'bv_av' ? '#dc2626' : '#7c3aed',
    fillColor: item.massnahme === 'bv_av' ? '#ef4444' : '#8b5cf6',
  }))), [schutzfaelle])
  const listIncidents = useMemo(() => [
    ...ctx.openIncidents,
    ...ctx.visibleIncidents.filter(item => item.status === 'erledigt' && !ctx.openIncidents.some(open => open.id === item.id)),
  ], [ctx.openIncidents, ctx.visibleIncidents])
  const incidentVisuals = useMemo(() => Object.fromEntries(ctx.openIncidents.map((item, index) => [item.id, {
    color: INCIDENT_COLORS[index % INCIDENT_COLORS.length],
    label: String(index + 1),
  }])), [ctx.openIncidents])
  function openWork(item: IncidentReport) {
    setSelectedIncidentId(item.id)
    setWorkIncident(item)
  }
  const incidentMarkers = useMemo(() => ctx.openIncidents
    .filter(item => item.location_lat !== null && item.location_lng !== null)
    .map(item => {
      const visual = incidentVisuals[item.id]
      const selected = selectedIncidentId === item.id
      return {
        lat: item.location_lat as number,
        lng: item.location_lng as number,
        color: visual.color,
        label: visual.label,
        selected,
        popup: selected ? `${formatTime(item.reported_at)} – ${item.location || item.summary.slice(0, 80)}` : undefined,
        onClick: () => openWork(item),
      }
    }), [ctx.openIncidents, selectedIncidentId, incidentVisuals])
  const focusedIncident = useMemo(() => ctx.openIncidents.find(item =>
    item.id === selectedIncidentId && item.location_lat !== null && item.location_lng !== null
  ) ?? null, [ctx.openIncidents, selectedIncidentId])

  useEffect(() => {
    const previousCount = previousOpenCountRef.current
    previousOpenCountRef.current = ctx.openIncidents.length
    setSelectedIncidentId(current => {
      if (ctx.openIncidents.length === 1) return ctx.openIncidents[0].id
      if (ctx.openIncidents.length > 1 && previousCount <= 1) return null
      if (current && listIncidents.some(item => item.id === current)) return current
      return null
    })
  }, [ctx.openIncidents, listIncidents])

  return <div className="space-y-6">
    <SofortWichtig items={[
      ...ctx.criticalEntries.filter(item => item.category !== 'brief').map(item => ({
        id: item.id, title: item.title, description: item.description,
        onOpen: () => {
          if (item.category === 'lage') { ctx.openEditEntry(item) }
          else if (item.category === 'uebergabe') { navigate('/innendienst') }
        },
      })),
      ...schutzWarnings.map(item => ({ id: item.id, title: `${MASSNAHME_LABEL[item.massnahme]} · PAD ${item.pad_aktenzahl}`, description: kontrolliert.has(item.id) && !hasInitialControl(item) && firstControlDeadline(item).getTime() < now ? 'Erstkontrolle innerhalb der ersten drei Tage noch nicht erfasst.' : `Endet am ${new Date(item.ende).toLocaleString('de-AT')}.`, onOpen: () => navigate('/zentrale/av-bv-ev') })),
      ...ctx.criticalStrassensperren.map(item => ({ id: `${item.strasse_id ?? item.strasse_freitext}-${item.created_at}`, title: `Straßenzustand: ${strassenName(item)} · ${item.zustand === 'sonstige' ? (item.zustand_freitext ?? ZUSTAND_LABEL.sonstige) : ZUSTAND_LABEL[item.zustand]}`, description: formatZeitraum(item), onOpen: () => navigate('/zentrale/strassenzustand') })),
    ]} incomplete={ctx.criticalSourcesError || schutzError} />
    <WichtigeTelefonnummernCard />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div><h2 className="font-bold text-gray-900">Einsätze</h2><p className="text-xs text-gray-500">{ctx.openIncidents.length} offen · {ctx.visibleIncidents.filter(item => item.status === 'erledigt').length} abgeschlossen</p></div>
          {ctx.canOperateZentrale ? <div className="flex flex-col items-end gap-1"><button type="button" onClick={ctx.openIncident} className="text-sm font-semibold text-blue-700">Meldung erfassen</button><button type="button" onClick={() => navigate('/zentrale/strassenzustand?neu=1')} className="text-sm font-semibold text-blue-700">Straßenzustandsbericht</button></div> : null}
        </div>
        <div className="overflow-y-auto pr-1" style={{ maxHeight: 560 }}>
          <IncidentCards
            visibleIncidents={listIncidents}
            lageByIncidentId={ctx.lageByIncidentId}
            canOperateZentrale={ctx.canOperateZentrale}
            openEditIncident={ctx.openEditIncident}
            openLageForIncident={ctx.openLageForIncident}
            completeIncident={ctx.completeIncident}
            deleteIncident={ctx.deleteIncident}
            patrolVehicles={ctx.patrolVehicles}
            setIncidentHandling={ctx.setIncidentHandling}
            visualByIncidentId={incidentVisuals}
            selectedIncidentId={selectedIncidentId}
            onOpenIncident={openWork}
          />
        </div>
      </section>
      <section>
        <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3"><MapPin className="w-4 h-4 text-blue-700" /> Einsatzkarte – Gemeindegebiet Dornbirn</h2>
        <LeafletMap
          height={560}
          markers={incidentMarkers}
          lines={focusedIncident ? ctx.sperrenLines : []}
          circles={focusedIncident ? schutzCircles : []}
          focus={focusedIncident ? { lat: focusedIncident.location_lat as number, lng: focusedIncident.location_lng as number, zoom: 16 } : null}
          fitLines={false}
        />
        <p className="mt-2 text-xs text-gray-500">{focusedIncident ? 'Ausgewählter Einsatz zentriert.' : 'Nur offene Einsatzorte auf der Karte. Klick auf Pin oder Karte öffnet das Arbeitsfenster.'}</p>
      </section>
    </div>
    {workIncident ? <EinsatzArbeitModal
      item={workIncident}
      canOperateZentrale={ctx.canOperateZentrale}
      close={() => setWorkIncident(null)}
      openEditIncident={ctx.openEditIncident}
      completeIncident={ctx.completeIncident}
      persons={ctx.persons}
      onPersonCreated={ctx.onPersonCreated}
      createdBy={ctx.createdBy}
    /> : null}
  </div>
}
