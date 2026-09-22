import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert, Users } from 'lucide-react'
import { loadChecklistPunkte } from '../../lib/einsatzChecklisten'
import { loadDokumente } from '../../lib/einsatzDokumente'
import { ENTSCHEIDUNGSPUNKTE, ERSTMELDUNG_CHECKLISTE, NOTUNTERKUNFT_CHECKLISTE, telefonketteFuer } from '../../lib/einsatzSchema'
import { loadEreignisEntscheidungen, updateEreignisLage, verstaendigungKey } from '../../lib/ereignis'
import { loadPersonenliste } from '../../lib/zmrPersonen'
import { telHref, type EreignisKontaktTreffer } from '../../lib/ereignisKontakte'
import type { Ereignis, EreignisEntscheidung, EreignisVerstaendigung } from '../../lib/types'

type Section = 'lage' | 'verstaendigung' | 'ablauf' | 'unterstuetzung'

type Snapshot = {
  zmrDocs: number
  bewohner: number
  evakuierung: number
  evakuierungImHaus: number
  evakuierungDraussen: number
  evakuierungUnbekannt: number
  unterbringung: number
  erstmeldungErledigt: number
  erstmeldungGesamt: number
  notunterkunftErledigt: number
  notunterkunftGesamt: number
  notunterkunftAktiv: boolean
  entscheidungen: EreignisEntscheidung[]
}

const ERSTMELDUNG_ARBEITSPUNKTE = ERSTMELDUNG_CHECKLISTE.filter(
  punkt => punkt.key !== 'meldungszettel' && punkt.key !== 'oeffentliche_sicherheit',
)

const EMPTY: Snapshot = {
  zmrDocs: 0,
  bewohner: 0,
  evakuierung: 0,
  evakuierungImHaus: 0,
  evakuierungDraussen: 0,
  evakuierungUnbekannt: 0,
  unterbringung: 0,
  erstmeldungErledigt: 0,
  erstmeldungGesamt: ERSTMELDUNG_ARBEITSPUNKTE.length,
  notunterkunftErledigt: 0,
  notunterkunftGesamt: NOTUNTERKUNFT_CHECKLISTE.length,
  notunterkunftAktiv: false,
  entscheidungen: [],
}

function StatusCard({
  title, main, detail, onClick,
}: {
  title: string
  main: string
  detail: string
  onClick: () => void
}) {
  return <button type="button" onClick={onClick} className="rounded-xl border border-gray-200 bg-white p-3 text-left hover:border-blue-300">
    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{title}</p>
    <p className="mt-1 text-sm font-bold text-gray-900">{main}</p>
    <p className="mt-0.5 text-xs text-gray-500">{detail}</p>
  </button>
}

export default function EreignisCockpit({
  incidentId,
  ereignis,
  verstaendigungen,
  canOperate,
  userId,
  refreshToken,
  onSaved,
  onMarkVerstaendigung,
  kontakte,
  onGoTo,
  onOpenFiles,
}: {
  incidentId: string
  ereignis: Ereignis
  verstaendigungen: EreignisVerstaendigung[]
  canOperate: boolean
  userId: string | null
  refreshToken: number
  onSaved: (ereignis: Ereignis) => void
  onMarkVerstaendigung: (label: string, field: 'versucht' | 'erreicht') => Promise<void>
  kontakte: Record<string, EreignisKontaktTreffer[]>
  onGoTo: (section: Section) => void
  onOpenFiles: () => void
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [docs, bewohner, evakuierung, unterbringung, erstmeldung, notunterkunft, entscheidungen] = await Promise.all([
        loadDokumente(incidentId),
        loadPersonenliste(incidentId, 'haus'),
        loadPersonenliste(incidentId, 'evakuierung'),
        loadPersonenliste(incidentId, 'unterbringung'),
        loadChecklistPunkte(incidentId, 'erstmeldung'),
        loadChecklistPunkte(incidentId, 'notunterkunft'),
        loadEreignisEntscheidungen(ereignis.id),
      ])
      const erstMap = new Map(erstmeldung.map(row => [row.punkt_key, row]))
      const notMap = new Map(notunterkunft.map(row => [row.punkt_key, row]))
      setSnapshot({
        zmrDocs: docs.filter(doc => doc.art === 'zmr' || doc.art === 'abfrage').length,
        bewohner: bewohner.length,
        evakuierung: evakuierung.length,
        evakuierungImHaus: evakuierung.filter(row => row.status === 'im_haus').length,
        evakuierungDraussen: evakuierung.filter(row => row.status === 'draussen').length,
        evakuierungUnbekannt: evakuierung.filter(row => row.status !== 'im_haus' && row.status !== 'draussen').length,
        unterbringung: unterbringung.length,
        erstmeldungErledigt: ERSTMELDUNG_ARBEITSPUNKTE.filter(punkt => erstMap.get(punkt.key)?.erledigt).length,
        erstmeldungGesamt: ERSTMELDUNG_ARBEITSPUNKTE.length,
        notunterkunftErledigt: NOTUNTERKUNFT_CHECKLISTE.filter(punkt => notMap.get(punkt.key)?.erledigt).length,
        notunterkunftGesamt: NOTUNTERKUNFT_CHECKLISTE.length,
        notunterkunftAktiv: unterbringung.length > 0 || notunterkunft.length > 0,
        entscheidungen,
      })
    } catch {
      setError('Prozessstand konnte nicht vollständig geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [ereignis.id, incidentId])

  useEffect(() => { void load() }, [load, refreshToken])

  const kette = telefonketteFuer(ereignis.dimension)
  const byKey = useMemo(() => new Map(verstaendigungen.map(row => [row.empfaenger_key, row])), [verstaendigungen])
  const erreicht = kette.filter(label => byKey.get(verstaendigungKey(label))?.erreicht_at).length
  const nextKontakt = kette.find(label => !byKey.get(verstaendigungKey(label))?.erreicht_at) ?? null
  const nextKontaktDaten = nextKontakt ? (kontakte[nextKontakt] ?? []) : []

  const offeneEntscheidungen = ENTSCHEIDUNGSPUNKTE.filter(label => {
    const row = snapshot.entscheidungen.find(item => item.punkt_label === label)
    return !row || row.status === 'offen'
  }).length
  const koordinationsBlockAktiv = (ereignis.dimension === 'gross' || ereignis.dimension === 'katastrophe') && ereignis.koordinierung_noetig === true

  async function setPublicSafety(value: boolean) {
    if (!userId || busy) return
    setBusy(true)
    setError('')
    try {
      const saved = await updateEreignisLage(ereignis.id, { oeffentliche_sicherheit_beeintraechtigt: value }, userId)
      onSaved(saved)
    } catch {
      setError('Angabe konnte nicht gespeichert werden.')
    } finally {
      setBusy(false)
    }
  }

  let nextTitle = 'Prozessstand aktuell'
  let nextText = 'Die zentralen geführten Schritte sind derzeit bearbeitet. Lageänderungen weiter beobachten.'
  let nextSection: Section | null = null

  if (ereignis.oeffentliche_sicherheit_beeintraechtigt == null) {
    nextTitle = 'Öffentliche Sicherheit beurteilen'
    nextText = 'Diese Entscheidung steuert die weitere Ereignisbearbeitung.'
    nextSection = 'lage'
  } else if (nextKontakt) {
    nextTitle = 'Verständigung fortsetzen'
    nextText = nextKontakt + ' ist noch nicht als erreicht dokumentiert.'
    nextSection = 'verstaendigung'
  } else if (koordinationsBlockAktiv && offeneEntscheidungen > 0) {
    nextTitle = 'Entscheidungen dokumentieren'
    nextText = offeneEntscheidungen + ' Koordinationspunkt(e) sind noch offen.'
    nextSection = 'lage'
  } else if (snapshot.erstmeldungErledigt < snapshot.erstmeldungGesamt) {
    nextTitle = 'Weitere Maßnahmen prüfen'
    nextText = (snapshot.erstmeldungGesamt - snapshot.erstmeldungErledigt) + ' Punkt(e) aus dem vorgesehenen Ablauf sind noch offen.'
    nextSection = 'ablauf'
  }

  return <div className="space-y-3">
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start gap-3">
        {nextSection ? <CircleAlert className="mt-0.5 h-5 w-5 flex-none text-blue-800" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-green-700" />}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700">Nächster Schritt</p>
          <p className="mt-0.5 text-base font-bold text-gray-950">{loading ? 'Prozessstand wird geladen…' : nextTitle}</p>
          {!loading ? <p className="mt-1 text-sm text-gray-700">{nextText}</p> : null}

          {!loading && ereignis.oeffentliche_sicherheit_beeintraechtigt == null ? <div className="mt-3 flex gap-2">
            <button type="button" disabled={!canOperate || busy} onClick={() => void setPublicSafety(true)} className="rounded-lg bg-blue-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Ja</button>
            <button type="button" disabled={!canOperate || busy} onClick={() => void setPublicSafety(false)} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-bold text-blue-900 disabled:opacity-50">Nein</button>
          </div> : null}

          {!loading && nextKontakt && ereignis.oeffentliche_sicherheit_beeintraechtigt != null ? <>
            <div className="mt-3 flex flex-wrap gap-2">
              {nextKontaktDaten.filter(kontakt => kontakt.telefon).map(kontakt => <a key={kontakt.id} href={telHref(kontakt.telefon!)} className="rounded-lg bg-blue-800 px-3 py-2 text-xs font-bold text-white">TEL {kontakt.telefon}</a>)}
              <button type="button" disabled={!canOperate || busy} onClick={() => void onMarkVerstaendigung(nextKontakt, 'versucht')} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-50">Versucht</button>
              <button type="button" disabled={!canOperate || busy} onClick={() => void onMarkVerstaendigung(nextKontakt, 'erreicht')} className="rounded-lg bg-green-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Erreicht</button>
            </div>
            {nextKontaktDaten.length === 0 ? <p className="mt-2 text-xs text-amber-700">Für diesen Verständigungsschritt sind noch keine passenden Kontaktdaten gepflegt.</p> : null}
          </> : null}

          {!loading && nextSection && !(ereignis.oeffentliche_sicherheit_beeintraechtigt == null || nextKontakt) ? <button type="button" onClick={() => onGoTo(nextSection)} className="mt-3 rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-bold text-blue-900">Direkt öffnen</button> : null}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2">
      <StatusCard
        title="Lage"
        main={ereignis.betroffene_anzahl == null ? 'Betroffene offen' : ereignis.betroffene_anzahl + ' Betroffene'}
        detail={ereignis.opfer_anzahl == null ? 'Opferzahl noch offen' : ereignis.opfer_anzahl + ' Opfer'}
        onClick={() => onGoTo('lage')}
      />
      <StatusCard
        title="Verständigung"
        main={erreicht + ' / ' + kette.length + ' erreicht'}
        detail={nextKontakt ? 'Offen: ' + nextKontakt : 'Informationskette dokumentiert'}
        onClick={() => onGoTo('verstaendigung')}
      />
      <StatusCard
        title="Unterstützung"
        main={snapshot.bewohner + ' Bewohner · ' + snapshot.evakuierung + ' Evakuierung'}
        detail={snapshot.zmrDocs > 0 ? snapshot.zmrDocs + ' ZMR/Abfrage · ' + snapshot.evakuierungUnbekannt + ' Status unbekannt' : 'Noch kein ZMR/Abfrage hinterlegt'}
        onClick={() => onGoTo('unterstuetzung')}
      />
      <StatusCard
        title="Maßnahmen"
        main={(snapshot.erstmeldungGesamt - snapshot.erstmeldungErledigt) + ' offen'}
        detail={snapshot.notunterkunftAktiv ? 'Notunterkunft: ' + (snapshot.notunterkunftGesamt - snapshot.notunterkunftErledigt) + ' offen' : 'Notunterkunft nicht aktiviert'}
        onClick={() => onGoTo('ablauf')}
      />
    </div>

    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
      <Users className="h-4 w-4 text-gray-500" />
      <span className="text-xs text-gray-700">Evakuierung: <strong>{snapshot.evakuierungImHaus}</strong> im Haus · <strong>{snapshot.evakuierungDraussen}</strong> draußen · <strong>{snapshot.evakuierungUnbekannt}</strong> unbekannt</span>
      <span className="text-xs text-gray-400">·</span>
      <span className="text-xs text-gray-700">Notunterkunft: <strong>{snapshot.unterbringung}</strong></span>
      {snapshot.zmrDocs === 0 ? <button type="button" onClick={onOpenFiles} className="ml-auto text-xs font-bold text-blue-800">ZMR / Abfrage</button> : <button type="button" onClick={() => onGoTo('unterstuetzung')} className="ml-auto text-xs font-bold text-blue-800">Personen öffnen</button>}
    </div>

    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>
}
