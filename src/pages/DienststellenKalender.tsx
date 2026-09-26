import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { dienstplanSupabase, type DienstplanKategorieDb } from '../lib/dienstplanSupabase'
import { inputClass } from '../components/ZentraleEntryEditor'
import { thisMonthLocal, todayLocal } from '../lib/ueberstunden'
import { NACHTDIENST_BIS, NACHTDIENST_VON } from '../lib/dienstplanAuswertung'
import { parseDienstCode } from '../lib/dienstplanImport'
import { KACHEL_IMMER_SICHTBAR, fehlendeGrundbesetzung, istUrlaubsKuerzel, kachelRang, tagOderNacht } from '../lib/dienstplanBesetzung'
import { MINDESTBESETZUNG, type GrundbesetzungCode } from '../lib/dienstplanImport'

// Dienststellenkalender: zeigt für den gewählten (veröffentlichten) Monat
// tageweise Tagdienste und Nachtdienste getrennt voneinander, je Zeitraum in
// Kacheln je Dienst-Kürzel (z. B. Z, ID, JD, VD/ZIV, Bhf, ... - jeder Roh-Code
// bekommt seine eigene Kachel, kombinierte Codes wie "SVE/TD" werden nicht
// aufgesplittet) - aus den importierten Dienstplan-Rohdaten (siehe
// SystemeinstellungenDienstplanImport.tsx). Als Kachel-Titel genügt laut
// Kommandant das Kürzel, keine ausgeschriebene Bezeichnung. Die
// Grundbesetzung Z/ID/JD wird laut Kommandant fix vorne gereiht (siehe
// KACHEL_REIHENFOLGE) und immer angezeigt (auch "nicht besetzt"), die
// restlichen Kacheln alphabetisch danach. Das Kürzel "U" (Urlaub) sowie
// bereits als krank/Urlaub/Sonderurlaub/Karenz kategorisierte Zeilen
// bekommen laut Kommandant keine eigene Kachel, sondern bleiben eine
// einfache Auflistung je Person. Für jede/n aktive/n Bediensteten sichtbar
// (siehe Migration 20260925051510_dienstplan_dienststellenweit_lesen.sql),
// keine eigene Bereichsberechtigung nötig - wer Dienst hat, ist
// Basisinformation für die ganze Dienststelle. Rein lesend; Bearbeitung
// passiert ausschließlich über den monatlichen Import.

interface DienstZeile { beamter_id: string; datum: string; zeile: 1 | 2; rohtext: string; von_zeit: string | null; bis_zeit: string | null; kategorie: DienstplanKategorieDb }
interface MitarbeiterOption { id: string; name: string; dienstnummer: string | null }

const KATEGORIE_BADGE: Partial<Record<DienstplanKategorieDb, string>> = {
  krank: 'bg-red-100 text-red-700',
  urlaub: 'bg-amber-100 text-amber-800',
  sonderurlaub: 'bg-blue-100 text-blue-700',
  karenz: 'bg-purple-100 text-purple-700',
  stundenersatz: 'bg-amber-100 text-amber-800',
}
const KATEGORIE_LABEL: Partial<Record<DienstplanKategorieDb, string>> = {
  krank: 'krank', urlaub: 'Urlaub', sonderurlaub: 'Sonderurlaub', karenz: 'Karenz', stundenersatz: 'Stundenersatz',
}

const WOCHENTAG_LABEL: Record<number, string> = { 0: 'So', 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa' }

function formatDatum(iso: string): string {
  const [jahr, monat, tag] = iso.split('-').map(Number)
  const datum = new Date(jahr, monat - 1, tag)
  return `${WOCHENTAG_LABEL[datum.getDay()]} ${String(tag).padStart(2, '0')}.${String(monat).padStart(2, '0')}.${jahr}`
}

function tageImMonat(monatIso: string): string[] {
  const [jahr, monat] = monatIso.split('-').map(Number)
  const letzterTag = new Date(jahr, monat, 0).getDate()
  return Array.from({ length: letzterTag }, (_, index) => `${monatIso}-${String(index + 1).padStart(2, '0')}`)
}

/** Wochen für die Monatsansicht - Montag bis Sonntag, mit null als Platzhalter für Tage außerhalb des Monats (damit jede Woche vollständige 7 Spalten hat). */
function kalenderWochen(monatIso: string): (string | null)[][] {
  const alleTage = tageImMonat(monatIso)
  const [jahr, monatNr] = monatIso.split('-').map(Number)
  const ersterWochentag = new Date(jahr, monatNr - 1, 1).getDay()
  const fuehrendeLuecken = (ersterWochentag + 6) % 7 // Montag = 0 statt Sonntag = 0
  const zellen: (string | null)[] = [...Array<null>(fuehrendeLuecken).fill(null), ...alleTage]
  while (zellen.length % 7 !== 0) zellen.push(null)
  const wochen: (string | null)[][] = []
  for (let index = 0; index < zellen.length; index += 7) wochen.push(zellen.slice(index, index + 7))
  return wochen
}

interface KachelEintrag { beamterId: string; name: string; dienstnummer: string | null; vonZeit: string | null; bisZeit: string | null }
interface DienstKachelDaten { code: string; eintraege: KachelEintrag[] }
interface AbwesenheitEintrag { beamterId: string; name: string; dienstnummer: string | null; texte: string[]; kategorie: DienstplanKategorieDb }
interface ZeitabschnittUebersicht { kacheln: DienstKachelDaten[] }
interface TagesUebersicht { datum: string; tag: ZeitabschnittUebersicht; nacht: ZeitabschnittUebersicht; abwesenheiten: AbwesenheitEintrag[] }

function Kachel({ code, eintraege, erforderlich }: { code: string; eintraege: KachelEintrag[]; erforderlich: number }) {
  const unterbesetzt = eintraege.length < erforderlich
  return <div className={`rounded-lg border p-2.5 ${unterbesetzt ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{code}{erforderlich > 1 ? ` (${eintraege.length}/${erforderlich})` : ''}</p>
    {unterbesetzt ? <p className="mt-1 flex items-center gap-1 text-sm font-medium text-red-700"><AlertTriangle className="h-3.5 w-3.5 flex-none" /> {eintraege.length === 0 ? 'nicht besetzt' : 'unterbesetzt'}</p> : null}
    {eintraege.length > 0 ? <div className="mt-1 space-y-0.5">
      {eintraege.map(eintrag => <p key={eintrag.beamterId} className="text-sm font-medium text-gray-800">
        {eintrag.name}
        <span className="ml-1.5 font-mono text-xs font-normal text-gray-500">{eintrag.vonZeit && eintrag.bisZeit ? `${eintrag.vonZeit}–${eintrag.bisZeit}` : `${NACHTDIENST_VON}–${NACHTDIENST_BIS}`}</span>
      </p>)}
    </div> : null}
  </div>
}

function Zeitabschnitt({ titel, daten }: { titel: string; daten: ZeitabschnittUebersicht }) {
  return <div>
    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">{titel}</p>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {daten.kacheln.map(kachel => <Kachel key={kachel.code} code={kachel.code} eintraege={kachel.eintraege} erforderlich={MINDESTBESETZUNG[kachel.code as GrundbesetzungCode] ?? 1} />)}
    </div>
  </div>
}

export default function DienststellenKalender() {
  const [monat, setMonat] = useState(thisMonthLocal())
  const [monatVeroeffentlicht, setMonatVeroeffentlicht] = useState<boolean | null>(null)
  const [dienste, setDienste] = useState<DienstZeile[]>([])
  const [mitarbeiter, setMitarbeiter] = useState<MitarbeiterOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const monatResult = await dienstplanSupabase.from('dienstplan_monate').select('id,status').eq('monat', `${monat}-01`).maybeSingle()
    if (monatResult.error) { setError('Der Dienstplan konnte nicht geladen werden.'); setLoading(false); return }
    const monatRow = monatResult.data
    if (!monatRow || monatRow.status !== 'veroeffentlicht') {
      setMonatVeroeffentlicht(false); setDienste([]); setMitarbeiter([]); setLoading(false); return
    }
    setMonatVeroeffentlicht(true)
    const [dienstResult, mitarbeiterResult] = await Promise.all([
      dienstplanSupabase.from('dienstplan_dienste').select('beamter_id,datum,zeile,rohtext,von_zeit,bis_zeit,kategorie').eq('dienstplan_monat_id', monatRow.id).order('datum').order('zeile'),
      supabase.from('profiles').select('id,name,dienstnummer').eq('active', true).order('name'),
    ])
    if (dienstResult.error || mitarbeiterResult.error) { setError('Der Dienstplan konnte nicht geladen werden.'); setLoading(false); return }
    setDienste(dienstResult.data ?? [])
    setMitarbeiter(mitarbeiterResult.data ?? [])
    setLoading(false)
  }, [monat])
  useEffect(() => { void load() }, [load])

  // Beim ersten Laden auf den vom Genehmiger hinterlegten "aktuellen
  // Dienstplan" springen (dienstplan_regeln.aktueller_planungsmonat) - die
  // Monatsnavigation bleibt danach frei.
  useEffect(() => {
    let aktiv = true
    void dienstplanSupabase.from('dienstplan_regeln').select('aktueller_planungsmonat').eq('id', 1).maybeSingle().then(result => {
      if (!aktiv) return
      const standard = result.data?.aktueller_planungsmonat?.slice(0, 7)
      if (standard) setMonat(standard)
    })
    return () => { aktiv = false }
  }, [])

  // Monatsansicht: ausgewählter Tag für die Detailanzeige neben dem
  // Kalenderraster - Standard ist der heutige Tag, wenn er im angezeigten
  // Monat liegt, sonst keine Auswahl. Wechselt der Monat, wird neu
  // ausgewählt (siehe Abhängigkeit [monat]) - innerhalb desselben Monats
  // bleibt eine manuelle Auswahl bestehen.
  const [ausgewaehlterTag, setAusgewaehlterTag] = useState<string | null>(null)
  useEffect(() => {
    const heute = todayLocal()
    setAusgewaehlterTag(heute.startsWith(monat) ? heute : null)
  }, [monat])

  const mitarbeiterById = useMemo(() => new Map(mitarbeiter.map(person => [person.id, person])), [mitarbeiter])

  function neuerZeitabschnitt(): Map<string, DienstKachelDaten> {
    return new Map(KACHEL_IMMER_SICHTBAR.map(code => [code, { code, eintraege: [] }]))
  }

  // Jede Rohzeile einzeln (nicht mehr je Person zusammengefasst) zunächst
  // nach Tagdienst/Nachtdienst (siehe tagOderNacht) und dann einer Kachel je
  // Dienst-Kürzel zuordnen (kombinierte Codes wie "SVE/TD" bleiben eine
  // Kachel). Das Kürzel "U" sowie krank/Urlaub/Sonderurlaub/Karenz bleiben
  // eine einfache Liste je Person. Dieselbe Person mit zwei Rohzeilen an
  // einem Tag (zeile 1/2, Bedeutung des Zusammenspiels noch nicht
  // abschließend geklärt, siehe lib/dienstplanImport.ts) kann dadurch
  // theoretisch in mehreren Kacheln auftauchen; in der Praxis trägt an einem
  // Tag pro Code eine andere Person die jeweilige Rohzeile.
  const tage = useMemo(() => {
    const proTag = new Map<string, { tag: ReturnType<typeof neuerZeitabschnitt>; nacht: ReturnType<typeof neuerZeitabschnitt>; abwesenheitenMap: Map<string, AbwesenheitEintrag> }>()
    for (const zeile of dienste) {
      const person = mitarbeiterById.get(zeile.beamter_id)
      if (!person) continue
      let tagesEintrag = proTag.get(zeile.datum)
      if (!tagesEintrag) { tagesEintrag = { tag: neuerZeitabschnitt(), nacht: neuerZeitabschnitt(), abwesenheitenMap: new Map() }; proTag.set(zeile.datum, tagesEintrag) }

      if (zeile.kategorie === 'dienst') {
        const { code } = parseDienstCode(zeile.rohtext)
        if (!istUrlaubsKuerzel(code)) {
          const kachelEintrag: KachelEintrag = { beamterId: zeile.beamter_id, name: person.name, dienstnummer: person.dienstnummer, vonZeit: zeile.von_zeit, bisZeit: zeile.bis_zeit }
          const abschnitt = tagOderNacht(zeile.von_zeit) === 'tag' ? tagesEintrag.tag : tagesEintrag.nacht
          const schluessel = code.toUpperCase()
          let kachel = abschnitt.get(schluessel)
          if (!kachel) { kachel = { code, eintraege: [] }; abschnitt.set(schluessel, kachel) }
          kachel.eintraege.push(kachelEintrag)
          continue
        }
      }

      let abwesenheit = tagesEintrag.abwesenheitenMap.get(zeile.beamter_id)
      if (!abwesenheit) {
        abwesenheit = { beamterId: zeile.beamter_id, name: person.name, dienstnummer: person.dienstnummer, texte: [], kategorie: zeile.kategorie === 'dienst' ? 'urlaub' : zeile.kategorie }
        tagesEintrag.abwesenheitenMap.set(zeile.beamter_id, abwesenheit)
      }
      abwesenheit.texte.push(zeile.rohtext)
    }
    const zuUebersicht = (abschnitt: ReturnType<typeof neuerZeitabschnitt>): ZeitabschnittUebersicht => ({
      kacheln: Array.from(abschnitt.values()).sort((a, b) => kachelRang(a.code) - kachelRang(b.code) || a.code.localeCompare(b.code, 'de-AT')),
    })
    return Array.from(proTag.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([datum, { tag, nacht, abwesenheitenMap }]): TagesUebersicht => ({
        datum,
        tag: zuUebersicht(tag),
        nacht: zuUebersicht(nacht),
        abwesenheiten: Array.from(abwesenheitenMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'de-AT')),
      }))
  }, [dienste, mitarbeiterById])

  const tageMap = useMemo(() => new Map(tage.map(eintrag => [eintrag.datum, eintrag])), [tage])
  const alleTage = useMemo(() => tageImMonat(monat), [monat])
  const fehlendeGrund = useMemo(() => fehlendeGrundbesetzung(dienste, alleTage), [dienste, alleTage])
  const wochen = useMemo(() => kalenderWochen(monat), [monat])
  const heute = todayLocal()
  const ausgewaehlteUebersicht = ausgewaehlterTag ? tageMap.get(ausgewaehlterTag) : undefined

  return <div className="mx-auto max-w-full px-4 py-6 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-gray-900">Dienststellenkalender</h1><p className="mt-1 text-sm text-gray-500">Monatsansicht, heutiger Tag blau hervorgehoben - Tag antippen für Tag-/Nachtdienste je Dienst-Kürzel und Abwesenheiten. Rotes Warnsymbol: fehlende Grundbesetzung, Zahl: Anzahl Abwesenheiten.</p></div>
      <input type="month" value={monat} onChange={event => setMonat(event.target.value)} className={`${inputClass} mt-0 w-auto`} />
    </div>

    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

    {loading ? <div className="mt-8 flex justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-800" /></div>
      : monatVeroeffentlicht === false ? <div className="mt-8 rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"><CalendarDays className="mx-auto mb-2 h-8 w-8 text-gray-300" /><p className="text-sm text-gray-500">Für diesen Monat wurde noch kein Dienstplan veröffentlicht.</p></div>
      : <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="lg:w-[26rem] lg:flex-none">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-gray-400 sm:gap-1.5">
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(label => <div key={label} className="pb-1">{label}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {wochen.flatMap((woche, wocheIndex) => woche.map((datum, tagIndex) => {
              if (!datum) return <div key={`${wocheIndex}-${tagIndex}`} />
              const tagText = datum.slice(-2)
              const fehlend = fehlendeGrund.get(datum)
              const abwesenheitenAnzahl = tageMap.get(datum)?.abwesenheiten.length ?? 0
              const istHeute = datum === heute
              const istAusgewaehlt = datum === ausgewaehlterTag
              return <button key={datum} type="button" onClick={() => setAusgewaehlterTag(datum)}
                className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border p-1 text-sm transition-colors ${
                  istAusgewaehlt ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' : istHeute ? 'border-blue-400 bg-blue-50/60' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <span className={`font-semibold ${istHeute ? 'text-blue-800' : 'text-gray-800'}`}>{tagText}</span>
                <div className="flex h-3 items-center gap-1">
                  {fehlend && fehlend.length > 0 ? <AlertTriangle className="h-3 w-3 flex-none text-red-600" /> : null}
                  {abwesenheitenAnzahl > 0 ? <span className="text-[0.65rem] leading-none text-amber-700">{abwesenheitenAnzahl}</span> : null}
                </div>
              </button>
            }))}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {!ausgewaehlterTag ? <p className="text-sm text-gray-500">Tag im Kalender auswählen, um Details zu sehen.</p>
            : !ausgewaehlteUebersicht ? <div className="rounded-xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">{formatDatum(ausgewaehlterTag)} – keine Diensteinträge vorhanden.</div>
            : <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="mb-3 text-sm font-bold text-gray-900">{formatDatum(ausgewaehlterTag)}</p>
              <div className="space-y-3">
                <Zeitabschnitt titel="Tagdienste" daten={ausgewaehlteUebersicht.tag} />
                <Zeitabschnitt titel="Nachtdienste" daten={ausgewaehlteUebersicht.nacht} />
              </div>
              {ausgewaehlteUebersicht.abwesenheiten.length > 0 ? <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
                {ausgewaehlteUebersicht.abwesenheiten.map(eintrag => <div key={eintrag.beamterId} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-40 flex-none font-medium text-gray-800">{eintrag.name}{eintrag.dienstnummer ? <span className="text-xs text-gray-400"> (DNr. {eintrag.dienstnummer})</span> : null}</span>
                  {KATEGORIE_LABEL[eintrag.kategorie] ? <span className={`flex-none rounded-full px-2 py-0.5 text-xs font-semibold ${KATEGORIE_BADGE[eintrag.kategorie]}`}>{KATEGORIE_LABEL[eintrag.kategorie]}</span> : null}
                </div>)}
              </div> : null}
            </div>}
        </div>
      </div>}
  </div>
}
