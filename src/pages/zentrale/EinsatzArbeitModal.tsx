import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../components/ZentraleEntryEditor'
import {
  loadIncidentEreignis,
  loadVerstaendigungen,
  setIncidentEreignisDimension,
  setVerstaendigungStatus,
  verstaendigungKey,
} from '../../lib/ereignis'
import { EREIGNISSTUFEN, STUFE_META, formatStamp, telefonketteFuer } from '../../lib/einsatzSchema'
import { formatTime } from '../../lib/zentraleShared'
import { loadEreignisKontakte, telHref, type EreignisKontaktTreffer } from '../../lib/ereignisKontakte'
import type { Ereignis, EreignisDimension, EreignisVerstaendigung, IncidentReport, OperationalPerson } from '../../lib/types'
import IncidentDocs from './IncidentDocs'
import IncidentNamensliste from './IncidentNamensliste'
import EinsatzParteien from './EinsatzParteien'
import EreignisLage from './EreignisLage'
import EreignisCockpit from './EreignisCockpit'

type Tab = 'uebersicht' | 'ereignis' | 'parteien' | 'dateien'

export default function EinsatzArbeitModal({
  item, canOperateZentrale, close, openEditIncident, completeIncident, persons, onPersonCreated, createdBy,
}: {
  item: IncidentReport
  canOperateZentrale: boolean
  close: () => void
  openEditIncident: (item: IncidentReport) => void
  completeIncident: (item: IncidentReport) => Promise<void>
  persons: OperationalPerson[]
  onPersonCreated: (person: OperationalPerson) => void
  createdBy: string | null
}) {
  const [tab, setTab] = useState<Tab>('uebersicht')
  const [ereignis, setEreignis] = useState<Ereignis | null>(null)
  const [verstaendigungen, setVerstaendigungen] = useState<EreignisVerstaendigung[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cockpitRefresh, setCockpitRefresh] = useState(0)
  const [kontakte, setKontakte] = useState<Record<string, EreignisKontaktTreffer[]>>({})

  const stufe: EreignisDimension = ereignis?.dimension ?? 'klein'
  const meta = STUFE_META[stufe]
  const hatEreignisArbeitsraum = stufe !== 'klein'

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
          const rows = await loadVerstaendigungen(next.id)
          if (!cancelled) setVerstaendigungen(rows)
        } else {
          setVerstaendigungen([])
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
    if (!hatEreignisArbeitsraum) { setKontakte({}); return }
    let cancelled = false
    void loadEreignisKontakte(telefonketteFuer(stufe))
      .then(rows => { if (!cancelled) setKontakte(rows) })
      .catch(() => { if (!cancelled) setKontakte({}) })
    return () => { cancelled = true }
  }, [hatEreignisArbeitsraum, stufe])

  async function setStufe(next: EreignisDimension) {
    if (!canOperateZentrale || busy || next === stufe) return
    setBusy(true)
    setError('')
    try {
      const saved = await setIncidentEreignisDimension(item.id, next)
      setEreignis(saved)
      if (saved) setVerstaendigungen(await loadVerstaendigungen(saved.id))
      else setVerstaendigungen([])
      setCockpitRefresh(value => value + 1)
    } catch {
      setError('Ereignisdimension konnte nicht gespeichert werden.')
    } finally {
      setBusy(false)
    }
  }

  const standByKey = useMemo(
    () => new Map(verstaendigungen.map(row => [row.empfaenger_key, row])),
    [verstaendigungen],
  )

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

  function goToEreignisSection(section: 'lage' | 'verstaendigung' | 'unterstuetzung') {
    window.requestAnimationFrame(() => {
      document.getElementById('ereignis-' + section)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return <Modal wide title={formatTime(item.reported_at) + ' · ' + (item.location || 'Ohne Ortsangabe')} close={close}>
    <p className="text-sm text-gray-800 line-clamp-3">{item.summary}</p>
    <p className="text-xs text-gray-500">Melder: {item.caller_name || '–'} · Tel: {item.caller_phone || '–'}</p>

    <div className={'grid ' + (hatEreignisArbeitsraum ? 'grid-cols-4' : 'grid-cols-3') + ' border-b border-gray-200'}>
      <button type="button" className={tabClass('uebersicht')} onClick={() => setTab('uebersicht')}>Übersicht</button>
      {hatEreignisArbeitsraum ? <button type="button" className={tabClass('ereignis')} onClick={() => setTab('ereignis')}>Ereignis</button> : null}
      <button type="button" className={tabClass('parteien')} onClick={() => setTab('parteien')}>Parteien</button>
      <button type="button" className={tabClass('dateien')} onClick={() => setTab('dateien')}>Dateien</button>
    </div>

    {loading ? <p className="text-sm text-gray-500 py-3">Ereignisdaten werden geladen…</p> : null}

    {!loading && tab === 'uebersicht' ? <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-1.5">Ereignisdimension</p>
        {canOperateZentrale ? <div className="flex flex-wrap gap-1.5">{EREIGNISSTUFEN.map(key => {
          const row = STUFE_META[key]
          return <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() => void setStufe(key)}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border disabled:opacity-60"
            style={{ background: stufe === key ? row.bg : 'white', color: row.color, borderColor: row.color }}
          >{row.label}</button>
        })}</div> : <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>}
        <p className="text-xs text-gray-600 mt-2"><span className="font-semibold">{meta.label}:</span> {meta.wann}</p>
        {stufe === 'klein' ? <p className="text-xs text-gray-500 mt-1">Tagesgeschäft: kein zusätzlicher Ereignis-Arbeitsraum.</p> : null}
      </div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Bearbeitung</p>
        <p className="mt-1 text-sm text-gray-800">Status: {item.status === 'offen' ? 'Offen' : item.status === 'weitergegeben' ? 'An Bundespolizei weitergegeben' : 'Erledigt'}</p>
        <p className="text-sm text-gray-800">Zuweisung: {item.disposition === 'zentrale' ? 'Zentrale' : item.disposition === 'jd' ? 'JD' : item.disposition === 'vd' ? 'VD' : item.disposition === 'bp' ? 'Bundespolizei' : 'Nicht zugewiesen'}</p>
      </div>
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

      <div id="ereignis-lage" className="scroll-mt-4 border-t border-gray-200 pt-4">
        <EreignisLage
          ereignis={ereignis}
          incident={item}
          canOperate={canOperateZentrale}
          userId={createdBy}
          onSaved={setEreignis}
          onProcessChanged={() => setCockpitRefresh(value => value + 1)}
        />
      </div>

      <div id="ereignis-verstaendigung" className="scroll-mt-4 border-t border-gray-200 pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Verständigung</p>
        <p className="text-xs text-gray-500 mt-1 mb-3">Gemeinsamer serverseitiger Stand für Zentrale und Schichtwechsel.</p>
        <div className="space-y-2">{telefonketteFuer(stufe).map(label => {
        const key = verstaendigungKey(label)
        const row = standByKey.get(key)
        const kontaktTreffer = kontakte[label] ?? []
        return <div key={key} className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">{label}</p>
              {kontaktTreffer.length > 0 ? <div className="mt-1 space-y-0.5">{kontaktTreffer.map(kontakt => <p key={kontakt.id} className="text-xs text-gray-600">
                {kontakt.name}{kontakt.funktion && kontakt.funktion !== label ? ' · ' + kontakt.funktion : ''}
                {kontakt.erreichbarkeit ? ' · ' + kontakt.erreichbarkeit : ''}
              </p>)}</div> : <p className="mt-1 text-xs text-amber-700">Keine gepflegten Kontaktdaten gefunden.</p>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {kontaktTreffer.filter(kontakt => kontakt.telefon).map(kontakt => <a key={kontakt.id} href={telHref(kontakt.telefon!)} className="rounded-lg bg-blue-800 px-2.5 py-1.5 text-xs font-bold text-white">TEL {kontakt.telefon}</a>)}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={!canOperateZentrale || busy} onClick={() => void markKette(label, 'versucht')} className={'text-xs px-2.5 py-1.5 rounded-md border disabled:opacity-60 ' + (row?.versucht_at ? 'bg-amber-100 border-amber-400' : 'border-gray-300 bg-white')}>
              {row?.versucht_at ? 'Versucht ' + formatStamp(row.versucht_at) : 'Versucht'}
            </button>
            <button type="button" disabled={!canOperateZentrale || busy} onClick={() => void markKette(label, 'erreicht')} className={'text-xs px-2.5 py-1.5 rounded-md border disabled:opacity-60 ' + (row?.erreicht_at ? 'bg-green-100 border-green-500' : 'border-gray-300 bg-white')}>
              {row?.erreicht_at ? 'Erreicht ' + formatStamp(row.erreicht_at) : 'Erreicht'}
            </button>
          </div>
        </div>
      })}</div>
        <Link to="/stammdaten/kontakte" className="inline-block text-xs font-semibold text-gray-500 mt-2">Kontaktdaten verwalten</Link>
      </div>

      <div id="ereignis-unterstuetzung" className="scroll-mt-4 border-t border-gray-200 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-800">Daten- und Dokumentenunterstützung</h3>
            <p className="text-xs text-gray-500 mt-1">Die Zentrale stellt Daten und Unterlagen bereit. Evakuierungs- und Unterkunftsentscheidungen kommen von den Kräften vor Ort bzw. der Einsatzleitung.</p>
          </div>
          <button type="button" onClick={() => setTab('dateien')} className="text-xs font-semibold text-blue-800 border border-blue-200 rounded-lg px-2.5 py-1.5 bg-blue-50">
            ZMR / Abfrage hochladen
          </button>
        </div>
        <IncidentNamensliste incidentId={item.id} incidentTitel={formatTime(item.reported_at) + ' · ' + (item.location || 'Ohne Ortsangabe')} canOperate={canOperateZentrale} mode="zentrale" onChanged={() => setCockpitRefresh(value => value + 1)} />
      </div>
    </div> : null}

    {!loading && tab === 'parteien' ? <div className="space-y-2">
      <p className="text-xs text-gray-500">Von den Kräften vor Ort erfasste Parteien. Die Zentrale nutzt diese Information unterstützend und führt hier keine operative Personenerfassung.</p>
      <EinsatzParteien incidentId={item.id} incidentLocation={{ location: item.location, lat: item.location_lat, lng: item.location_lng }} persons={persons} onPersonCreated={onPersonCreated} createdBy={createdBy} canOperate={false} />
    </div> : null}
    {!loading && tab === 'dateien' ? <IncidentDocs incidentId={item.id} from="zentrale" canUpload={canOperateZentrale} onChanged={() => setCockpitRefresh(value => value + 1)} /> : null}

    {error ? <p className="text-xs text-red-700">{error}</p> : null}
    {canOperateZentrale ? <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
      <button type="button" onClick={() => { close(); openEditIncident(item) }} className="text-sm font-medium border border-gray-300 px-3 py-2 rounded-lg">Meldung ändern</button>
      {item.status === 'offen' ? <button type="button" onClick={() => void completeIncident(item).then(close)} className="text-sm font-medium text-green-800 border border-green-200 px-3 py-2 rounded-lg">Erledigt</button> : null}
    </div> : null}
  </Modal>
}
