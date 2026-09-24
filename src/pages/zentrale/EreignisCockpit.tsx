import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { loadDokumente } from '../../lib/einsatzDokumente'
import { loadPersonenliste } from '../../lib/zmrPersonen'
import { telHref, type EreignisKontaktTreffer } from '../../lib/ereignisKontakte'
import type { EreignisVerstaendigung, EreignisVerstaendigungsschritt } from '../../lib/types'

type Section = 'verstaendigung' | 'unterstuetzung'

type Snapshot = {
  dokumente: number
  zmrDocs: number
  bewohner: number
}

const EMPTY: Snapshot = {
  dokumente: 0,
  zmrDocs: 0,
  bewohner: 0,
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
  verstaendigungen,
  schritte,
  canOperate,
  refreshToken,
  onMarkVerstaendigung,
  kontakte,
  onGoTo,
  onOpenFiles,
}: {
  incidentId: string
  verstaendigungen: EreignisVerstaendigung[]
  schritte: EreignisVerstaendigungsschritt[]
  canOperate: boolean
  refreshToken: number
  onMarkVerstaendigung: (label: string, field: 'versucht' | 'erreicht') => Promise<void>
  kontakte: Record<string, EreignisKontaktTreffer[]>
  onGoTo: (section: Section) => void
  onOpenFiles: () => void
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [docs, bewohner] = await Promise.all([
        loadDokumente(incidentId),
        loadPersonenliste(incidentId, 'haus'),
      ])
      setSnapshot({
        dokumente: docs.length,
        zmrDocs: docs.filter(doc => doc.art === 'zmr' || doc.art === 'abfrage').length,
        bewohner: bewohner.length,
      })
    } catch {
      setError('Prozessstand konnte nicht vollständig geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [incidentId])

  useEffect(() => { void load() }, [load, refreshToken])

  const kette = schritte
  const byKey = useMemo(() => new Map(verstaendigungen.map(row => [row.empfaenger_key, row])), [verstaendigungen])
  const bearbeitet = kette.filter(schritt => {
    const row = byKey.get(schritt.schluessel)
    return Boolean(row?.versucht_at || row?.erreicht_at)
  }).length
  const erreicht = kette.filter(schritt => Boolean(byKey.get(schritt.schluessel)?.erreicht_at)).length

  // Für die Prozessführung genügt ein dokumentierter Versuch. Ein nicht
  // erreichter Kontakt bleibt im Detail sichtbar, blockiert aber nicht den
  // nächsten vorgesehenen Verständigungsschritt.
  const nextKontakt = kette.find(schritt => {
    const row = byKey.get(schritt.schluessel)
    return !row?.versucht_at && !row?.erreicht_at
  })?.bezeichnung ?? null
  const nextKontaktDaten = nextKontakt ? (kontakte[nextKontakt] ?? []) : []

  let nextTitle = 'Verständigungsauftrag abgearbeitet'
  let nextText = 'Auf Anforderungen von vor Ort reagieren und benötigte Daten oder Unterlagen bereitstellen.'
  let nextSection: Section | null = null

  if (nextKontakt) {
    nextTitle = 'Nächste Verständigung'
    nextText = nextKontakt
    nextSection = 'verstaendigung'
  }

  return <div className="space-y-3">
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start gap-3">
        {nextSection ? <CircleAlert className="mt-0.5 h-5 w-5 flex-none text-blue-800" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-green-700" />}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700">Nächster Schritt für die Zentrale</p>
          <p className="mt-0.5 text-base font-bold text-gray-950">{loading ? 'Prozessstand wird geladen…' : nextTitle}</p>
          {!loading ? <p className="mt-1 text-sm text-gray-700">{nextText}</p> : null}

          {!loading && nextKontakt ? <>
            <div className="mt-3 flex flex-wrap gap-2">
              {nextKontaktDaten.filter(kontakt => kontakt.telefonnummern.length > 0).map(kontakt => <div key={`${kontakt.source}:${kontakt.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-white px-2 py-1.5">
                <span className="text-xs font-semibold text-gray-900">{kontakt.name}</span>
                {kontakt.telefonnummern.map(({ art, nummer }) => <a key={art} href={telHref(nummer)} aria-label={`${kontakt.name}, ${art} anrufen: ${nummer}`} className="rounded-lg bg-blue-800 px-3 py-2 text-xs font-bold text-white hover:bg-blue-900">{art}: {nummer}</a>)}
              </div>)}
              <button type="button" disabled={!canOperate} onClick={() => void onMarkVerstaendigung(nextKontakt, 'versucht')} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-50">Versucht</button>
              <button type="button" disabled={!canOperate} onClick={() => void onMarkVerstaendigung(nextKontakt, 'erreicht')} className="rounded-lg bg-green-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Erreicht</button>
            </div>
            {nextKontaktDaten.every(kontakt => kontakt.telefonnummern.length === 0) ? <p className="mt-2 text-xs text-amber-700">Für diesen Verständigungsschritt ist keine gültige Rufnummer zugeordnet.</p> : null}
          </> : <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => onGoTo('unterstuetzung')} className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-bold text-blue-900">Vorhandene Daten ansehen</button>
            <button type="button" onClick={onOpenFiles} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700">Dokumente</button>
          </div>}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2">
      <StatusCard
        title="Verständigung"
        main={bearbeitet + ' / ' + kette.length + ' bearbeitet'}
        detail={erreicht + ' erreicht' + (nextKontakt ? ' · als Nächstes: ' + nextKontakt : '')}
        onClick={() => onGoTo('verstaendigung')}
      />
      <StatusCard
        title="Daten / Dokumente"
        main={snapshot.dokumente + ' Unterlagen'}
        detail={snapshot.zmrDocs > 0 ? snapshot.zmrDocs + ' ZMR / Abfrage' : 'Noch kein ZMR / Abfrage'}
        onClick={onOpenFiles}
      />
      <StatusCard
        title="ZMR-Daten"
        main={snapshot.bewohner + ' Bewohnerdatensätze'}
        detail="Von der Zentrale bereitgestellte Datenbasis"
        onClick={() => onGoTo('unterstuetzung')}
      />
    </div>

    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
      <p className="text-xs text-gray-600">Lage- und Rückmeldedetails werden im PAD dokumentiert. Dieses Portal zeigt der Zentrale nur Verständigungen sowie bereitgestellte Daten und Dokumente.</p>
    </div>

    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>
}
