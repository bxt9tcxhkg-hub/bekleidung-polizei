import { useEffect, useMemo, useState } from 'react'
import { MapPin, ShieldAlert, UsersRound } from 'lucide-react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import LeafletMap from '../../components/LeafletMap'
import { personDisplayName } from '../../lib/register'
import { firstControlDeadline, hasInitialControl, MASSNAHME_LABEL, SCHUTZ_SELECT, type Schutzfall } from '../../lib/schutzmassnahmen'
import { supabase } from '../../lib/supabase'
import { ZUSTAND_LABEL, formatZeitraum, strassenName } from '../../lib/strassenzustand'
import type { ZentraleEntryCategory } from '../../lib/types'
import type { ZentraleContext } from './ZentraleShell'
import { DutyPanel, IncidentCards, SofortWichtig } from './zentraleShared'
import { FAHNDUNG_ART_LABEL, formatTime } from '../../lib/zentraleShared'

// Wohin ein Klick auf einen "Sofort wichtig"-Eintrag führt, dessen Kategorie
// eine eigene Sidebar-Seite ist.
const CATEGORY_ROUTE: Partial<Record<ZentraleEntryCategory, string>> = { brief: '/rsa-rsb' }

export default function ZentraleUebersicht() {
  const ctx = useOutletContext<ZentraleContext>()
  const navigate = useNavigate()
  const [schutzfaelle, setSchutzfaelle] = useState<Schutzfall[]>([])
  const [schutzError, setSchutzError] = useState(false)
  const [now] = useState(() => new Date().getTime())
  useEffect(() => {
    void supabase.from('schutzfaelle').select(SCHUTZ_SELECT).eq('status', 'aktiv').gt('ende', new Date().toISOString()).order('ende').then(result => {
      setSchutzError(Boolean(result.error))
      setSchutzfaelle(result.error ? [] : (result.data ?? []) as unknown as Schutzfall[])
    })
  }, [])
  const schutzWarnings = useMemo(() => schutzfaelle.filter(item =>
    (item.massnahme === 'bv_av' && !hasInitialControl(item) && firstControlDeadline(item).getTime() < now)
    || new Date(item.ende).getTime() - now < 24 * 60 * 60 * 1000
  ), [schutzfaelle, now])
  const schutzCircles = useMemo(() => schutzfaelle.flatMap(item => (item.bereiche ?? []).map(area => ({
    lat: area.lat, lng: area.lng, radiusMeters: area.radius_m,
    popup: `${MASSNAHME_LABEL[item.massnahme]} · ${area.bezeichnung} · PAD ${item.pad_aktenzahl}`,
    color: item.massnahme === 'bv_av' ? '#dc2626' : '#7c3aed',
    fillColor: item.massnahme === 'bv_av' ? '#ef4444' : '#8b5cf6',
  }))), [schutzfaelle])

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
      ...schutzWarnings.map(item => ({ id: item.id, title: `${MASSNAHME_LABEL[item.massnahme]} · PAD ${item.pad_aktenzahl}`, description: item.massnahme === 'bv_av' && !hasInitialControl(item) && firstControlDeadline(item).getTime() < now ? 'Erstkontrolle innerhalb der ersten drei Tage noch nicht erfasst.' : `Endet am ${new Date(item.ende).toLocaleString('de-AT')}.`, onOpen: () => navigate('/zentrale/av-bv-ev') })),
      ...ctx.criticalFahndungen.map(item => ({ id: item.id, title: `Fahndung (${FAHNDUNG_ART_LABEL[item.art]}) · ${(item.person ? personDisplayName(item.person) : (item.object?.address ?? 'ohne Zuordnung'))}`, description: item.beschreibung, onOpen: () => navigate('/zentrale/fahndungen') })),
      ...ctx.criticalStrassensperren.map(item => ({ id: `${item.strasse_id ?? item.strasse_freitext}-${item.created_at}`, title: `Straßenzustand: ${strassenName(item)} · ${item.zustand === 'sonstige' ? (item.zustand_freitext ?? ZUSTAND_LABEL.sonstige) : ZUSTAND_LABEL[item.zustand]}`, description: formatZeitraum(item), onOpen: () => navigate('/zentrale/strassenzustand') })),
    ]} incomplete={ctx.criticalSourcesError || schutzError} />
    {schutzfaelle.length > 0 ? <button type="button" onClick={() => navigate('/zentrale/av-bv-ev')} className="w-full rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left hover:border-blue-400"><span className="flex items-center gap-2 font-bold text-blue-950"><ShieldAlert className="h-5 w-5" />{schutzfaelle.length} aktive Schutzmaßnahme{schutzfaelle.length === 1 ? '' : 'n'}</span><span className="mt-1 block text-sm text-blue-800">Schutzbereiche, Ausnahmen und Kontrollstatus öffnen.</span></button> : null}
    {/* Meldungen und Karte nebeneinander (ab lg), damit beides auf einen
        Blick sichtbar ist, statt lange untereinander zu scrollen - auf
        schmalen Bildschirmen weiterhin gestapelt (Meldungen zuerst). */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section><div className="flex items-center justify-between mb-3"><h2 className="font-bold text-gray-900">Heutige Meldungen</h2>{ctx.canOperateZentrale ? <button type="button" onClick={ctx.openIncident} className="text-sm font-semibold text-blue-700">Meldung erfassen</button> : null}</div><IncidentCards visibleIncidents={ctx.visibleIncidents} lageByIncidentId={ctx.lageByIncidentId} baustellen={ctx.baustellen} canOperateZentrale={ctx.canOperateZentrale} openEditIncident={ctx.openEditIncident} openLageForIncident={ctx.openLageForIncident} completeIncident={ctx.completeIncident} deleteIncident={ctx.deleteIncident} /></section>
      <section><h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3"><MapPin className="w-4 h-4 text-blue-700" /> Einsatz- und Schutzlage – Gemeindegebiet Dornbirn</h2><LeafletMap height={420} markers={ctx.openIncidentMarkers} lines={[...ctx.baustellenLines, ...ctx.sperrenLines]} circles={schutzCircles} fitLines={false} /><p className="mt-2 text-xs text-gray-500">Rot: BV/AV-Wohnungsschutzbereich · Violett: Bereich einer gerichtlichen EV.</p></section>
    </div>
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
    <div><h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Informativ – bei Bedarf</h2><p className="text-sm text-gray-500">Weitere Bereiche (Schutzmaßnahmen, Personenhinweise, Fahndungen, RSa/RSb, Alarmierung, Unterlagen und Baustellen) über die Seitenleiste.</p></div>
  </div>
}
