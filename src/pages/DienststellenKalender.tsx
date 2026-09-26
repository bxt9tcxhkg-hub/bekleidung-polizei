import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { dienstplanSupabase, type DienstplanKategorieDb, type DienstplanMarkierungKategorie } from '../lib/dienstplanSupabase'
import { inputClass } from '../components/ZentraleEntryEditor'
import { thisMonthLocal, todayLocal } from '../lib/ueberstunden'
import { NACHTDIENST_BIS, NACHTDIENST_VON } from '../lib/dienstplanAuswertung'
import { parseDienstCode } from '../lib/dienstplanImport'
import { KACHEL_IMMER_SICHTBAR, fehlendeGrundbesetzung, kachelRang, tagOderNacht } from '../lib/dienstplanBesetzung'
import { kategorieFarbenMap, kategorieFarbKlassen, type DienstplanAbsenzKategorie } from '../lib/dienstplanMarkierungen'
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
// restlichen Kacheln alphabetisch danach. Urlaub/Krank/Sonderurlaub/Karenz/
// Stundenersatz landen NICHT unter den Tagdiensten, sondern in einem
// eigenen Abschnitt "Abwesenheiten" - dort außerdem je Kategorie
// zusammengefasst statt je Rohcode, damit z. B. "U" und "Urlaub" (beides
// Kategorie "urlaub", siehe kategorieAusRohtext in dienstplanImport.ts) in
// einer gemeinsamen Kachel landen. Farblich markiert wie im Planer-Grid
// (siehe kategorieFarbKlassen). Für
// jede/n aktive/n Bediensteten sichtbar (siehe Migration
// 20260925051510_dienstplan_dienststellenweit_lesen.sql), keine eigene
// Bereichsberechtigung nötig - wer Dienst hat, ist Basisinformation für die
// ganze Dienststelle. Rein lesend; Bearbeitung passiert ausschließlich über
// den monatlichen Import.

interface DienstZeile { beamter_id: string; datum: string; zeile: 1 | 2; rohtext: string; von_zeit: string | null; bis_zeit: string | null; kategorie: DienstplanKategorieDb }
interface MitarbeiterOption { id: string; name: string; dienstnummer: string | null }

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

interface KachelEintrag { beamterId: string; name: string; dienstnummer: string | null; vonZeit: string | null; bisZeit: string | null; kategorie: DienstplanKategorieDb }
interface DienstKachelDaten { code: string; eintraege: KachelEintrag[] }
interface ZeitabschnittUebersicht { kacheln: DienstKachelDaten[] }
interface AbwesenheitKachelDaten { kategorie: DienstplanAbsenzKategorie; eintraege: KachelEintrag[] }
interface TagesUebersicht { datum: string; tag: ZeitabschnittUebersicht; nacht: ZeitabschnittUebersicht; abwesenheiten: AbwesenheitKachelDaten[] }

function Kachel({ code, eintraege, erforderlich, kategorieFarben, zeigeKategorieLabel = true }: { code: string; eintraege: KachelEintrag[]; erforderlich: number; kategorieFarben: ReadonlyMap<DienstplanAbsenzKategorie, string>; zeigeKategorieLabel?: boolean }) {
  const unterbesetzt = eintraege.length < erforderlich
  const farbe = eintraege[0] ? kategorieFarbKlassen(eintraege[0].kategorie, kategorieFarben) : null
  return <div className={`rounded-lg border p-2.5 ${farbe ? `border-transparent ${farbe.bg}` : unterbesetzt ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
    <p className={`text-xs font-semibold uppercase tracking-wide ${farbe ? farbe.text : 'text-gray-500'}`}>{code}{erforderlich > 1 ? ` (${eintraege.length}/${erforderlich})` : ''}</p>
    {unterbesetzt ? <p className="mt-1 flex items-center gap-1 text-sm font-medium text-red-700"><AlertTriangle className="h-3.5 w-3.5 flex-none" /> {eintraege.length === 0 ? 'nicht besetzt' : 'unterbesetzt'}</p> : null}
    {eintraege.length > 0 ? <div className="mt-1 space-y-0.5">
      {eintraege.map(eintrag => <p key={eintrag.beamterId} className={`text-sm font-medium ${farbe ? farbe.text : 'text-gray-800'}`}>
        {eintrag.name}
        {zeigeKategorieLabel ? <span className={`ml-1.5 font-mono text-xs font-normal ${farbe ? farbe.text : 'text-gray-500'}`}>
          {eintrag.kategorie !== 'dienst' ? (KATEGORIE_LABEL[eintrag.kategorie] ?? '') : eintrag.vonZeit && eintrag.bisZeit ? `${eintrag.vonZeit}–${eintrag.bisZeit}` : `${NACHTDIENST_VON}–${NACHTDIENST_BIS}`}
        </span> : null}
      </p>)}
    </div> : null}
  </div>
}

function Zeitabschnitt({ titel, daten, kategorieFarben }: { titel: string; daten: ZeitabschnittUebersicht; kategorieFarben: ReadonlyMap<DienstplanAbsenzKategorie, string> }) {
  return <div>
    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">{titel}</p>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {daten.kacheln.map(kachel => <Kachel key={kachel.code} code={kachel.code} eintraege={kachel.eintraege} erforderlich={MINDESTBESETZUNG[kachel.code as GrundbesetzungCode] ?? 1} kategorieFarben={kategorieFarben} />)}
    </div>
  </div>
}

/** Eigener Abschnitt für Urlaub/Krank/Sonderurlaub/Karenz/Stundenersatz, getrennt von den Tag-/Nachtdienst-Kacheln - je Kategorie eine Kachel (kein "erforderlich", keine "nicht besetzt"-Warnung, kein Uhrzeit-Suffix, da der Kachel-Titel die Kategorie schon nennt). */
function AbwesenheitenAbschnitt({ daten, kategorieFarben }: { daten: AbwesenheitKachelDaten[]; kategorieFarben: ReadonlyMap<DienstplanAbsenzKategorie, string> }) {
  if (daten.length === 0) return null
  return <div>
    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">Abwesenheiten</p>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {daten.map(kachel => <Kachel key={kachel.kategorie} code={KATEGORIE_LABEL[kachel.kategorie] ?? kachel.kategorie} eintraege={kachel.eintraege} erforderlich={0} kategorieFarben={kategorieFarben} zeigeKategorieLabel={false} />)}
    </div>
  </div>
}

export default function DienststellenKalender() {
  const [monat, setMonat] = useState(thisMonthLocal())
  const [monatVeroeffentlicht, setMonatVeroeffentlicht] = useState<boolean | null>(null)
  const [dienste, setDienste] = useState<DienstZeile[]>([])
  const [mitarbeiter, setMitarbeiter] = useState<MitarbeiterOption[]>([])
  const [markierungen, setMarkierungen] = useState<{ kategorie: DienstplanMarkierungKategorie | null; farbe: string }[]>([])
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
    const [dienstResult, mitarbeiterResult, markierungenResult] = await Promise.all([
      dienstplanSupabase.from('dienstplan_dienste').select('beamter_id,datum,zeile,rohtext,von_zeit,bis_zeit,kategorie').eq('dienstplan_monat_id', monatRow.id).order('datum').order('zeile'),
      supabase.from('profiles').select('id,name,dienstnummer').eq('active', true).order('name'),
      dienstplanSupabase.from('dienstplan_markierungen').select('kategorie,farbe'),
    ])
    if (dienstResult.error || mitarbeiterResult.error || markierungenResult.error) { setError('Der Dienstplan konnte nicht geladen werden.'); setLoading(false); return }
    setDienste(dienstResult.data ?? [])
    setMitarbeiter(mitarbeiterResult.data ?? [])
    setMarkierungen(markierungenResult.data ?? [])
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
  // nach Tagdienst/Nachtdienst (siehe tagOderNacht) und dann einer Kachel
  // je Dienst-Kürzel zuordnen (kombinierte Codes wie "SVE/TD" bleiben eine
  // Kachel). Urlaub/Krank/Sonderurlaub/Karenz/Stundenersatz haben weder
  // Uhrzeit noch gehören sie zu Tag- oder Nachtdienst - sie landen separat
  // in tagesEintrag.abwesenheiten, je Kategorie eine Kachel (nicht je
  // Rohcode, damit z. B. "U" und "Urlaub" zusammen erscheinen). Dieselbe
  // Person mit zwei Rohzeilen an einem Tag (zeile 1/2, Bedeutung des
  // Zusammenspiels noch nicht abschließend geklärt, siehe
  // lib/dienstplanImport.ts) kann dadurch theoretisch in mehreren Kacheln
  // auftauchen; in der Praxis trägt an einem Tag pro Code eine andere
  // Person die jeweilige Rohzeile.
  const tage = useMemo(() => {
    const proTag = new Map<string, { tag: ReturnType<typeof neuerZeitabschnitt>; nacht: ReturnType<typeof neuerZeitabschnitt>; abwesenheiten: Map<DienstplanAbsenzKategorie, AbwesenheitKachelDaten> }>()
    for (const zeile of dienste) {
      const person = mitarbeiterById.get(zeile.beamter_id)
      if (!person) continue
      let tagesEintrag = proTag.get(zeile.datum)
      if (!tagesEintrag) { tagesEintrag = { tag: neuerZeitabschnitt(), nacht: neuerZeitabschnitt(), abwesenheiten: new Map() }; proTag.set(zeile.datum, tagesEintrag) }

      // "sonstiges" ist keine echte Abwesenheit, sondern eine rein farbliche
      // Markierung auf einer sonst leeren Zelle (kein Kürzel, siehe
      // DienstplanPlanung.tsx) - bekommt daher weder eine Dienst- noch eine
      // Abwesenheits-Kachel.
      if (zeile.kategorie === 'sonstiges') continue

      const kachelEintrag: KachelEintrag = { beamterId: zeile.beamter_id, name: person.name, dienstnummer: person.dienstnummer, vonZeit: zeile.von_zeit, bisZeit: zeile.bis_zeit, kategorie: zeile.kategorie }

      if (zeile.kategorie !== 'dienst') {
        let abwesenheitKachel = tagesEintrag.abwesenheiten.get(zeile.kategorie)
        if (!abwesenheitKachel) { abwesenheitKachel = { kategorie: zeile.kategorie, eintraege: [] }; tagesEintrag.abwesenheiten.set(zeile.kategorie, abwesenheitKachel) }
        abwesenheitKachel.eintraege.push(kachelEintrag)
        continue
      }

      const { code } = parseDienstCode(zeile.rohtext)
      const abschnitt = tagOderNacht(zeile.von_zeit) === 'tag' ? tagesEintrag.tag : tagesEintrag.nacht
      const schluessel = code.toUpperCase()
      let kachel = abschnitt.get(schluessel)
      if (!kachel) { kachel = { code, eintraege: [] }; abschnitt.set(schluessel, kachel) }
      kachel.eintraege.push(kachelEintrag)
    }
    const zuUebersicht = (abschnitt: ReturnType<typeof neuerZeitabschnitt>): ZeitabschnittUebersicht => ({
      kacheln: Array.from(abschnitt.values()).sort((a, b) => kachelRang(a.code) - kachelRang(b.code) || a.code.localeCompare(b.code, 'de-AT')),
    })
    return Array.from(proTag.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([datum, { tag, nacht, abwesenheiten }]): TagesUebersicht => ({
        datum, tag: zuUebersicht(tag), nacht: zuUebersicht(nacht),
        abwesenheiten: Array.from(abwesenheiten.values()).sort((a, b) => (KATEGORIE_LABEL[a.kategorie] ?? '').localeCompare(KATEGORIE_LABEL[b.kategorie] ?? '', 'de-AT')),
      }))
  }, [dienste, mitarbeiterById])

  const kategorieFarben = useMemo(() => kategorieFarbenMap(markierungen), [markierungen])

  const tageMap = useMemo(() => new Map(tage.map(eintrag => [eintrag.datum, eintrag])), [tage])
  const alleTage = useMemo(() => tageImMonat(monat), [monat])
  const fehlendeGrund = useMemo(() => fehlendeGrundbesetzung(dienste, alleTage), [dienste, alleTage])
  // Anzahl abwesender Personen je Tag (krank/Urlaub/Sonderurlaub/Karenz/
  // Stundenersatz) für den kompakten Hinweis im Kalenderraster - unabhängig
  // von den Kacheln, da eine Person pro Tag nur einmal zählen soll.
  const abwesenheitenAnzahlProTag = useMemo(() => {
    const proTag = new Map<string, Set<string>>()
    for (const zeile of dienste) {
      if (zeile.kategorie === 'dienst' || zeile.kategorie === 'sonstiges') continue
      let personen = proTag.get(zeile.datum)
      if (!personen) { personen = new Set(); proTag.set(zeile.datum, personen) }
      personen.add(zeile.beamter_id)
    }
    return new Map(Array.from(proTag.entries()).map(([datum, personen]) => [datum, personen.size]))
  }, [dienste])
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
              const abwesenheitenAnzahl = abwesenheitenAnzahlProTag.get(datum) ?? 0
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
                <Zeitabschnitt titel="Tagdienste" daten={ausgewaehlteUebersicht.tag} kategorieFarben={kategorieFarben} />
                <Zeitabschnitt titel="Nachtdienste" daten={ausgewaehlteUebersicht.nacht} kategorieFarben={kategorieFarben} />
                <AbwesenheitenAbschnitt daten={ausgewaehlteUebersicht.abwesenheiten} kategorieFarben={kategorieFarben} />
              </div>
            </div>}
        </div>
      </div>}
  </div>
}
