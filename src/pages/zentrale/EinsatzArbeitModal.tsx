import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { Modal } from '../../components/ZentraleEntryEditor'
import {
  loadActiveEreignisse,
  linkIncidentToEreignis,
  loadEreignisIncidentIds,
  loadEreignisIncidentStatus,
  loadIncidentEreignis,
  loadVerstaendigungen,
  setEreignisStatus,
  setIncidentEreignisDimension,
  setVerstaendigungStatus,
  unlinkIncidentFromEreignis,
  verstaendigungKey,
} from '../../lib/ereignis'
import { EREIGNISSTUFEN, STUFE_META, formatStamp, telefonketteFuer } from '../../lib/einsatzSchema'
import { formatTime } from '../../lib/zentraleShared'
import { centralNextAction, eventNeedsClosureHint } from '../../lib/centralWorkflow'
import { loadEreignisKontakte, telHref, type EreignisKontaktTreffer } from '../../lib/ereignisKontakte'
import type { Ereignis, EreignisDimension, EreignisVerstaendigung, IncidentReport, IncidentStatus } from '../../lib/types'
import type { ActiveEreignisSummary } from '../../lib/ereignis'
import IncidentDocs from './IncidentDocs'
import IncidentNamensliste from './IncidentNamensliste'
import EreignisCockpit from './EreignisCockpit'
import CentralSupportIntake from './CentralSupportIntake'
import IncidentAssistanceWorkPanel from './IncidentAssistanceWorkPanel'
import CentralIncidentContext from './CentralIncidentContext'
import IncidentDocumentSummary from './IncidentDocumentSummary'

type Tab = 'uebersicht' | 'ereignis' | 'dateien'

export default function EinsatzArbeitModal({
  item, canOperateZentrale, close, openEditIncident, completeIncident, createdBy, allIncidents = [], onOpenRelatedIncident,
}: {
  item: IncidentReport
  canOperateZentrale: boolean
  close: () => void
  openEditIncident: (item: IncidentReport) => void
  completeIncident: (item: IncidentReport) => Promise<void>
  createdBy: string | null
  allIncidents?: IncidentReport[]
  onOpenRelatedIncident?: (item: IncidentReport) => void
}) {
  const [tab, setTab] = useState<Tab>('uebersicht')
  const [ereignis, setEreignis] = useState<Ereignis | null>(null)
  const [verstaendigungen, setVerstaendigungen] = useState<EreignisVerstaendigung[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cockpitRefresh, setCockpitRefresh] = useState(0)
  const [kontakte, setKontakte] = useState<Record<string, EreignisKontaktTreffer[]>>({})
  const [activeEvents, setActiveEvents] = useState<ActiveEreignisSummary[]>([])
  const [linkEventOpen, setLinkEventOpen] = useState(false)
  const [relatedIncidentIds, setRelatedIncidentIds] = useState<string[]>([])
  const [relatedStatuses, setRelatedStatuses] = useState<Record<string, IncidentStatus>>({})
  const [openAssistanceCount, setOpenAssistanceCount] = useState(0)

  const stufe: EreignisDimension = ereignis?.dimension ?? 'klein'
  const meta = STUFE_META[stufe]
  const hatEreignisArbeitsraum = stufe !== 'klein'
  const relatedOpenCount = Object.values(relatedStatuses).filter(status => status === 'offen').length

  const standByKey = useMemo(
    () => new Map(verstaendigungen.map(row => [row.empfaenger_key, row])),
    [verstaendigungen],
  )
  const nextKontakt = useMemo(() => telefonketteFuer(stufe).find(label => {
    const row = standByKey.get(verstaendigungKey(label))
    return !row?.versucht_at && !row?.erreicht_at
  }) ?? null, [standByKey, stufe])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setTab('uebersicht')
    void loadIncidentEreignis(item.id)
      .then(async next => {
        if (cancelled) return
        setEreignis(next)
        if (next) {
          const [rows, incidentIds, statuses] = await Promise.all([
            loadVerstaendigungen(next.id),
            loadEreignisIncidentIds(next.id),
            loadEreignisIncidentStatus(next.id),
          ])
          if (!cancelled) {
            setVerstaendigungen(rows)
            setRelatedIncidentIds(incidentIds)
            setRelatedStatuses(statuses)
          }
        } else {
          setVerstaendigungen([])
          setRelatedIncidentIds([])
          setRelatedStatuses({})
        }
      })
      .catch(() => { if (!cancelled) setError('Ereignisdaten konnten nicht geladen werden.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [item.id])

  useEffect(() => {
    if (!hatEreignisArbeitsraum && tab === 'ereignis') setTab('uebersicht')
  }, [hatEreignisArbeitsraum, tab])

  useEffect(() => {
    let cancelled = false
    void loadActiveEreignisse()
      .then(rows => { if (!cancelled) setActiveEvents(rows) })
      .catch(() => { if (!cancelled) setActiveEvents([]) })
    return () => { cancelled = true }
  }, [item.id, ereignis?.id, ereignis?.status])

  useEffect(() => {
    if (!hatEreignisArbeitsraum) { setKontakte({}); return }
    let cancelled = false
    void loadEreignisKontakte(telefonketteFuer(stufe))
      .then(rows => { if (!cancelled) setKontakte(rows) })
      .catch(() => { if (!cancelled) setKontakte({}) })
    return () => { cancelled = true }
  }, [hatEreignisArbeitsraum, stufe])

  async function refreshEvent(saved: Ereignis) {
    const [rows, incidentIds, statuses] = await Promise.all([
      loadVerstaendigungen(saved.id),
      loadEreignisIncidentIds(saved.id),
      loadEreignisIncidentStatus(saved.id),
    ])
    setEreignis(saved)
    setVerstaendigungen(rows)
    setRelatedIncidentIds(incidentIds)
    setRelatedStatuses(statuses)
    setCockpitRefresh(value => value + 1)
  }

  async function linkToExistingEvent(eventId: string) {
    if (!canOperateZentrale || !createdBy || busy) return
    setBusy(true)
    setError('')
    try {
      const saved = await linkIncidentToEreignis({ incidentId: item.id, ereignisId: eventId, userId: createdBy })
      await refreshEvent(saved)
      setLinkEventOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Einsatz konnte dem Ereignis nicht zugeordnet werden.')
    } finally {
      setBusy(false)
    }
  }

  async function unlinkFromEvent() {
    if (!ereignis || !canOperateZentrale || busy) return
    if (!window.confirm('Diesen Einsatz wirklich aus dem gemeinsamen Ereignis lösen?')) return
    setBusy(true)
    setError('')
    try {
      await unlinkIncidentFromEreignis(item.id)
      setEreignis(null)
      setVerstaendigungen([])
      setRelatedIncidentIds([])
      setRelatedStatuses({})
      setLinkEventOpen(false)
      setCockpitRefresh(value => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ereigniszuordnung konnte nicht gelöst werden.')
    } finally {
      setBusy(false)
    }
  }

  async function changeEventStatus(status: Ereignis['status']) {
    if (!ereignis || !canOperateZentrale || busy) return
    if (status === 'abgeschlossen' && relatedOpenCount > 0) {
      const ok = window.confirm(`Dem Ereignis sind noch ${relatedOpenCount} offene Einsätze zugeordnet. Ereignis trotzdem abschließen?`)
      if (!ok) return
    }
    setBusy(true)
    setError('')
    try {
      const saved = await setEreignisStatus(ereignis.id, status)
      await refreshEvent(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ereignisstatus konnte nicht geändert werden.')
    } finally {
      setBusy(false)
    }
  }

  async function setStufe(next: EreignisDimension) {
    if (!canOperateZentrale || busy || next === stufe) return
    setBusy(true)
    setError('')
    try {
      const saved = await setIncidentEreignisDimension(item.id, next)
      if (saved) await refreshEvent(saved)
      else {
        setEreignis(null)
        setVerstaendigungen([])
        setRelatedIncidentIds([])
        setRelatedStatuses({})
      }
    } catch {
      setError('Ereignisdimension konnte nicht gespeichert werden.')
    } finally {
      setBusy(false)
    }
  }

  async function markKette(label: string, field: 'versucht' | 'erreicht') {
    if (!ereignis || !createdBy || busy) return
    const key = verstaendigungKey(label)
    setBusy(true)
    setError('')
    try {
      const saved = await setVerstaendigungStatus({
        ereignisId: ereignis.id,
        key,
        label,
        field,
        current: standByKey.get(key),
        userId: createdBy,
      })
      setVerstaendigungen(current => [...current.filter(row => row.id !== saved.id), saved])
      setCockpitRefresh(value => value + 1)
    } catch {
      setError('Verständigungsstand konnte nicht gespeichert werden.')
    } finally {
      setBusy(false)
    }
  }

  const tabClass = (id: Tab) => 'px-2 py-2 text-sm font-semibold border-b-2 ' + (tab === id ? 'border-blue-800 text-blue-900' : 'border-transparent text-gray-500 hover:text-gray-800')

  function goToEreignisSection(section: 'verstaendigung' | 'unterstuetzung') {
    window.requestAnimationFrame(() => {
      document.getElementById('ereignis-' + section)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const action = centralNextAction({
    incident: item,
    openAssistanceCount,
    nextNotification: ereignis ? nextKontakt : null,
  })

  const actionHandler = action.kind === 'dispatch'
    ? () => { close(); openEditIncident(item) }
    : action.kind === 'notification'
      ? () => setTab('ereignis')
      : null


  return <Modal wide title={formatTime(item.reported_at) + ' · ' + (item.location || 'Ohne Ortsangabe')} close={close}>
    <p className="text-sm text-gray-800 line-clamp-3">{item.summary}</p>
    <p className="text-xs text-gray-500">Meldungsleger: {item.caller_name || '–'} · Tel: {item.caller_phone?.trim() ? <a href={telHref(item.caller_phone)} className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900" aria-label={`Meldungsleger unter ${item.caller_phone} anrufen`}>{item.caller_phone}</a> : '–'}</p>

    <div className={'grid ' + (hatEreignisArbeitsraum ? 'grid-cols-3' : 'grid-cols-2') + ' border-b border-gray-200'}>
      <button type="button" className={tabClass('uebersicht')} onClick={() => setTab('uebersicht')}>Übersicht</button>
      {hatEreignisArbeitsraum ? <button type="button" className={tabClass('ereignis')} onClick={() => setTab('ereignis')}>Ereignis</button> : null}
      <button type="button" className={tabClass('dateien')} onClick={() => setTab('dateien')}>Dateien</button>
    </div>

    {loading ? <p className="text-sm text-gray-500 py-3">Ereignisdaten werden geladen…</p> : null}

    {!loading && tab === 'uebersicht' ? <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Status</p>
          <p className="mt-1 text-sm font-bold text-gray-900">{item.status === 'offen' ? 'Offen' : item.status === 'weitergegeben' ? 'Bundespolizei' : 'Erledigt'}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Disposition</p>
          <p className="mt-1 text-sm font-bold text-gray-900">{item.disposition === 'zentrale' ? 'Zentrale' : item.disposition === 'jd' ? 'JD' : item.disposition === 'vd' ? 'VD' : item.disposition === 'bp' ? 'Bundespolizei' : item.disposition === 'keine_anfahrt' ? 'Keine Anfahrt' : 'Offen'}</p>
          {item.assigned_vehicle?.call_sign || item.assigned_vehicle?.name ? <p className="mt-0.5 text-xs text-gray-500">{item.assigned_vehicle.call_sign || item.assigned_vehicle.name}</p> : null}
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Ort</p>
          <p className="mt-1 text-sm font-bold text-gray-900">{item.location || 'Ohne Ortsangabe'}</p>
        </div>
      </div>

      <CentralIncidentContext incidentId={item.id} />

      <section className={'rounded-xl border px-3 py-2.5 ' + (action.kind === 'done' || action.kind === 'wait' ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50')}>
        <div className="flex items-start gap-2">
          {action.kind === 'done' || action.kind === 'wait' ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-green-700" /> : <CircleAlert className="mt-0.5 h-4 w-4 flex-none text-blue-800" />}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-600">Nächster Schritt</p>
            <p className="mt-0.5 text-sm font-bold text-gray-950">{action.title}</p>
            <p className="mt-0.5 text-xs text-gray-700">{action.text}</p>
            {actionHandler ? <button type="button" onClick={actionHandler} className="mt-2 text-xs font-bold text-blue-800">{action.kind === 'dispatch' ? 'Disposition öffnen' : 'Verständigungen öffnen'}</button> : null}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Unterstützung / Abfragen</p>
            <p className="mt-0.5 text-xs text-gray-500">Bedarf vormerken, abarbeiten und ein vorhandenes Ergebnis direkt bereitstellen.</p>
          </div>
        </div>
        <div className="mt-2 border-t border-gray-100 pt-2">
          <CentralSupportIntake
            incidentId={item.id}
            ereignisId={ereignis?.id ?? null}
            canOperate={canOperateZentrale}
            onCreated={() => setCockpitRefresh(value => value + 1)}
          />
        </div>
        <div className="mt-2 border-t border-gray-100 pt-2">
          <IncidentAssistanceWorkPanel
            incidentId={item.id}
            refreshToken={cockpitRefresh}
            canOperate={canOperateZentrale}
            onChanged={() => setCockpitRefresh(value => value + 1)}
            onOpenCountChange={setOpenAssistanceCount}
          />
        </div>
      </section>

      <IncidentDocumentSummary incidentId={item.id} refreshToken={cockpitRefresh} onOpen={() => setTab('dateien')} />

      <section className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Ereignis</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full border px-2 py-0.5 text-xs font-bold" style={{ background: meta.bg, color: meta.color, borderColor: meta.color }}>{meta.label}</span>
              {ereignis ? <span className="truncate text-xs font-semibold text-gray-700">Teil von: {ereignis.titel} · {relatedIncidentIds.length} {relatedIncidentIds.length === 1 ? 'Einsatz' : 'Einsätze'}</span> : <span className="text-xs text-gray-500">Kein gemeinsames Ereignis</span>}
              {ereignis?.status === 'abgeschlossen' ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">Abgeschlossen</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!ereignis && canOperateZentrale && activeEvents.length > 0 ? <button type="button" onClick={() => setLinkEventOpen(current => !current)} className="text-xs font-semibold text-blue-800">{linkEventOpen ? 'Schließen' : 'Zu bestehendem Ereignis'}</button> : null}
            {ereignis && hatEreignisArbeitsraum ? <button type="button" onClick={() => setTab('ereignis')} className="text-xs font-semibold text-blue-800">Öffnen</button> : null}
          </div>
        </div>

        {ereignis && eventNeedsClosureHint({ eventStatus: ereignis.status, openIncidentCount: relatedOpenCount }) ? <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">Alle zugeordneten Einsätze sind erledigt. Ereignis prüfen und bei Bedarf abschließen.</div> : null}

        {canOperateZentrale ? <div className="mt-2 flex flex-wrap gap-1.5">{EREIGNISSTUFEN.map(key => {
          const row = STUFE_META[key]
          return <button key={key} type="button" disabled={busy} onClick={() => void setStufe(key)} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60" style={{ background: stufe === key ? row.bg : 'white', color: row.color, borderColor: row.color }}>{row.label}</button>
        })}</div> : null}

        {linkEventOpen && !ereignis ? <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
          {activeEvents.map(row => <button key={row.id} type="button" disabled={busy} onClick={() => void linkToExistingEvent(row.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left disabled:opacity-50">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-gray-900">{row.titel}</span>
              <span className="block text-xs text-gray-500">{STUFE_META[row.dimension].label} · {row.incident_count} {row.incident_count === 1 ? 'Einsatz' : 'Einsätze'}</span>
            </span>
            <span className="text-xs font-semibold text-blue-800">Zuordnen</span>
          </button>)}
        </div> : null}

        {ereignis && canOperateZentrale ? <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-2">
          <button type="button" disabled={busy} onClick={() => void unlinkFromEvent()} className="text-xs font-semibold text-gray-600 disabled:opacity-50">Zuordnung lösen</button>
          {ereignis.status === 'aktiv'
            ? <button type="button" disabled={busy} onClick={() => void changeEventStatus('abgeschlossen')} className="text-xs font-semibold text-gray-600 disabled:opacity-50">Ereignis abschließen</button>
            : <button type="button" disabled={busy} onClick={() => void changeEventStatus('aktiv')} className="text-xs font-semibold text-blue-800 disabled:opacity-50">Ereignis wieder öffnen</button>}
        </div> : null}
      </section>

      {ereignis && relatedIncidentIds.length > 1 ? <section className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">Weitere Einsätze dieses Ereignisses</p>
        <div className="mt-2 space-y-1.5">
          {allIncidents.filter(row => row.id !== item.id && relatedIncidentIds.includes(row.id)).map(row => <button key={row.id} type="button" onClick={() => onOpenRelatedIncident?.(row)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-white px-3 py-2 text-left">
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-gray-900">{formatTime(row.reported_at)} · {row.location || 'Ohne Ortsangabe'}</span>
              <span className="block truncate text-xs text-gray-500">{row.summary}</span>
            </span>
            <span className="text-xs font-semibold text-indigo-800">Öffnen</span>
          </button>)}
        </div>
      </section> : null}
    </div> : null}

    {!loading && tab === 'ereignis' && ereignis ? <div className="space-y-5">
      <EreignisCockpit
        incidentId={item.id}
        ereignis={ereignis}
        verstaendigungen={verstaendigungen}
        canOperate={canOperateZentrale}
        refreshToken={cockpitRefresh}
        onMarkVerstaendigung={markKette}
        kontakte={kontakte}
        onGoTo={goToEreignisSection}
        onOpenFiles={() => setTab('dateien')}
      />

      <div id="ereignis-verstaendigung" className="scroll-mt-4 border-t border-gray-200 pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Verständigung</p>
        <p className="text-xs text-gray-500 mt-1 mb-3">Gemeinsamer Arbeitsstand für Zentrale und Schichtwechsel. Keine Einsatzverlaufsdokumentation.</p>
        <div className="space-y-2">{telefonketteFuer(stufe).map(label => {
          const key = verstaendigungKey(label)
          const row = standByKey.get(key)
          const kontaktTreffer = kontakte[label] ?? []
          return <div key={key} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-sm font-semibold text-gray-900">{label}</p>
            {kontaktTreffer.length > 0 ? <div className="mt-2 space-y-1.5">{kontaktTreffer.map(kontakt => <div key={`${kontakt.source}:${kontakt.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-gray-50 px-2.5 py-2">
              <span className="min-w-0 text-xs text-gray-700"><span className="font-semibold text-gray-900">{kontakt.name}</span>{kontakt.funktion && kontakt.funktion !== label ? ' · ' + kontakt.funktion : ''}{kontakt.erreichbarkeit ? ' · ' + kontakt.erreichbarkeit : ''}</span>
              {kontakt.telefonnummern.map(({ art, nummer }) => <a key={art} href={telHref(nummer)} aria-label={`${kontakt.name}, ${art} anrufen: ${nummer}`} className="rounded-lg bg-blue-800 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-900">{art}: {nummer}</a>)}
            </div>)}</div> : <p className="mt-1 text-xs text-amber-700">Keine gepflegten Kontaktdaten gefunden.</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={!canOperateZentrale || busy} onClick={() => void markKette(label, 'versucht')} className={'text-xs px-2.5 py-1.5 rounded-md border disabled:opacity-60 ' + (row?.versucht_at ? 'bg-amber-100 border-amber-400' : 'border-gray-300 bg-white')}>{row?.versucht_at ? 'Versucht ' + formatStamp(row.versucht_at) : 'Versucht'}</button>
              <button type="button" disabled={!canOperateZentrale || busy} onClick={() => void markKette(label, 'erreicht')} className={'text-xs px-2.5 py-1.5 rounded-md border disabled:opacity-60 ' + (row?.erreicht_at ? 'bg-green-100 border-green-500' : 'border-gray-300 bg-white')}>{row?.erreicht_at ? 'Erreicht ' + formatStamp(row.erreicht_at) : 'Erreicht'}</button>
            </div>
          </div>
        })}</div>
        <Link to="/stammdaten/kontakte" className="inline-block text-xs font-semibold text-gray-500 mt-2">Kontaktdaten verwalten</Link>
      </div>

      <div id="ereignis-unterstuetzung" className="scroll-mt-4 border-t border-gray-200 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-800">Daten- und Dokumentenunterstützung</h3>
            <p className="text-xs text-gray-500 mt-1">Die Zentrale stellt Daten und Unterlagen bereit. Einsatzverlauf, Feststellungen und Rückmeldungen werden bei der Stadtpolizei im PAD dokumentiert.</p>
          </div>
          <button type="button" onClick={() => setTab('dateien')} className="text-xs font-semibold text-blue-800 border border-blue-200 rounded-lg px-2.5 py-1.5 bg-blue-50">ZMR / Abfrage hochladen</button>
        </div>
        <IncidentNamensliste incidentId={item.id} incidentTitel={formatTime(item.reported_at) + ' · ' + (item.location || 'Ohne Ortsangabe')} canOperate={canOperateZentrale} mode="zentrale" onChanged={() => setCockpitRefresh(value => value + 1)} />
      </div>
    </div> : null}

    {!loading && tab === 'dateien' ? <div className="space-y-3">
      <p className="text-xs text-gray-500">Ergebnisse aus Abfragen werden bei der Bearbeitung automatisch dem richtigen Einsatz bzw. gemeinsamen Ereignis zugeordnet. Diese Ablage ist für zusätzliche ZMR-/Abfrageunterlagen.</p>
      <IncidentDocs incidentId={item.id} from="zentrale" canUpload={canOperateZentrale} onChanged={() => setCockpitRefresh(value => value + 1)} />
    </div> : null}

    {error ? <p className="text-xs text-red-700">{error}</p> : null}
    {canOperateZentrale ? <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
      <button type="button" onClick={() => { close(); openEditIncident(item) }} className="text-sm font-medium border border-gray-300 px-3 py-2 rounded-lg">Meldung ändern</button>
      {item.status === 'offen' ? <button type="button" onClick={() => void completeIncident(item).then(close)} className="text-sm font-medium text-green-800 border border-green-200 px-3 py-2 rounded-lg">Erledigt</button> : null}
    </div> : null}
  </Modal>
}
