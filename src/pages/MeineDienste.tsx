import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { dienstplanSupabase, type DienstplanKategorieDb } from '../lib/dienstplanSupabase'
import { inputClass } from '../components/ZentraleEntryEditor'
import { formatStunden, thisMonthLocal } from '../lib/ueberstunden'
import { NACHTDIENST_BIS, NACHTDIENST_VON, persoenlicheStundenUebersicht } from '../lib/dienstplanAuswertung'
import { kuerzelKlartext, parseDienstCode } from '../lib/dienstplanImport'

// "Meine Dienste": eigene Diensteinträge des importierten Dienstplans für
// einen gewählten Monat, plus eine automatisch aus den Uhrzeiten berechnete
// Stunden-Übersicht (siehe lib/dienstplanAuswertung.ts). Bewusst KEINE
// Lohnart-/Überstunden-Kategorisierung - das würde normale, geplante
// Diensstunden mit tatsächlich gemeldeten Überstunden vermischen (zwei
// unterschiedliche Dinge: Dienstplan = Soll-Diensteinteilung, Überstunden-
// meldung = eigenständig gemeldete UND genehmigte Mehrarbeit). Stattdessen
// nur Gesamt-/Sollstunden sowie Sonn-/Feiertags- und Tag-/Nachtstunden als
// reine Information.

interface DienstZeile { datum: string; zeile: 1 | 2; rohtext: string; von_zeit: string | null; bis_zeit: string | null; kategorie: DienstplanKategorieDb }

const WOCHENTAG_LABEL: Record<number, string> = { 0: 'So', 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa' }
function formatDatum(iso: string): string {
  const [jahr, monat, tag] = iso.split('-').map(Number)
  const datum = new Date(jahr, monat - 1, tag)
  return `${WOCHENTAG_LABEL[datum.getDay()]} ${String(tag).padStart(2, '0')}.${String(monat).padStart(2, '0')}.${jahr}`
}

const KATEGORIE_LABEL: Partial<Record<DienstplanKategorieDb, string>> = {
  krank: 'krank', urlaub: 'Urlaub', sonderurlaub: 'Sonderurlaub', karenz: 'Karenz',
}

export default function MeineDienste() {
  const { profile } = useAuth()
  const profileId = profile?.id
  const [monat, setMonat] = useState(thisMonthLocal())
  const [monatVeroeffentlicht, setMonatVeroeffentlicht] = useState<boolean | null>(null)
  const [sollstunden, setSollstunden] = useState<number | null>(null)
  const [dienste, setDienste] = useState<DienstZeile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!profileId) return
    setLoading(true); setError('')
    const monatResult = await dienstplanSupabase.from('dienstplan_monate').select('id,status,sollstunden').eq('monat', `${monat}-01`).maybeSingle()
    if (monatResult.error) { setError('Die eigenen Dienste konnten nicht geladen werden.'); setLoading(false); return }
    const monatRow = monatResult.data
    if (!monatRow || monatRow.status !== 'veroeffentlicht') {
      setMonatVeroeffentlicht(false); setDienste([]); setSollstunden(null); setLoading(false); return
    }
    setMonatVeroeffentlicht(true)
    setSollstunden(monatRow.sollstunden)
    const dienstResult = await dienstplanSupabase.from('dienstplan_dienste').select('datum,zeile,rohtext,von_zeit,bis_zeit,kategorie').eq('dienstplan_monat_id', monatRow.id).eq('beamter_id', profileId).order('datum').order('zeile')
    if (dienstResult.error) { setError('Die eigenen Dienste konnten nicht geladen werden.'); setLoading(false); return }
    setDienste(dienstResult.data ?? [])
    setLoading(false)
  }, [monat, profileId])
  useEffect(() => { void load() }, [load])

  const tage = useMemo(() => {
    const proTag = new Map<string, DienstZeile[]>()
    for (const zeile of dienste) {
      const liste = proTag.get(zeile.datum) ?? []
      liste.push(zeile)
      proTag.set(zeile.datum, liste)
    }
    return Array.from(proTag.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [dienste])

  const uebersicht = useMemo(() => persoenlicheStundenUebersicht(dienste), [dienste])

  return <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-gray-900">Meine Dienste</h1><p className="mt-1 text-sm text-gray-500">Eigene Diensteinträge und geleistete Stunden aus dem Dienstplan.</p></div>
      <input type="month" value={monat} onChange={event => setMonat(event.target.value)} className={`${inputClass} mt-0 w-auto`} />
    </div>

    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

    {loading ? <div className="mt-8 flex justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-800" /></div>
      : monatVeroeffentlicht === false ? <div className="mt-8 rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"><CalendarDays className="mx-auto mb-2 h-8 w-8 text-gray-300" /><p className="text-sm text-gray-500">Für diesen Monat wurde noch kein Dienstplan veröffentlicht.</p></div>
      : <div className="mt-6 space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 font-semibold text-gray-900">Geleistete Stunden</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-500">Gesamtstunden</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{formatStunden(uebersicht.gesamt)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-500">Sollstunden</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{sollstunden !== null ? formatStunden(sollstunden) : '–'}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-500">Sonn-/Feiertagsstunden</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{formatStunden(uebersicht.sonnFeiertag)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-500">Tag- / Nachtstunden</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{formatStunden(uebersicht.tag)} / {formatStunden(uebersicht.nacht)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-400">Automatisch aus den Uhrzeiten der Diensteinträge berechnet (Tag = 06-19 Uhr, Nacht = 19-06 Uhr; ein Sonntagsdienst zählt ganztägig zu Sonn-/Feiertagsstunden, unabhängig von der Uhrzeit). Das sind die geplanten Diensstunden laut Dienstplan, keine Überstunden - für gemeldete/genehmigte Überstunden siehe Überstundenmeldung.</p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900">Diensteinträge</h2>
          {tage.length === 0 ? <p className="text-sm text-gray-500">Für diesen Monat sind keine eigenen Diensteinträge vorhanden.</p> : <div className="space-y-2">
            {tage.map(([datum, zeilen]) => <div key={datum} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              <span className="w-32 flex-none font-medium text-gray-800">{formatDatum(datum)}</span>
              {zeilen.map((zeile, index) => {
                const nachtdienst = zeile.kategorie === 'dienst' && !zeile.von_zeit
                const zeitAnzeige = zeile.von_zeit && zeile.bis_zeit ? `${zeile.von_zeit}–${zeile.bis_zeit}` : nachtdienst ? `${NACHTDIENST_VON}–${NACHTDIENST_BIS}` : null
                return <span key={zeile.zeile} className="text-gray-600">
                  {index > 0 ? <span className="text-gray-300"> · </span> : null}
                  {zeitAnzeige ? <span className="font-mono text-xs text-gray-500">{zeitAnzeige} </span> : null}
                  {KATEGORIE_LABEL[zeile.kategorie] ?? kuerzelKlartext(parseDienstCode(zeile.rohtext).code)}
                </span>
              })}
            </div>)}
          </div>}
        </section>
      </div>}
  </div>
}
