import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, CalendarRange, CheckCircle2, Moon, Printer, Sparkles, Sun, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { isAustrianHoliday } from '../lib/austrianHolidays'
import { officerPrintName } from '../lib/printDocs'
import { generateDienstplanDruckPdf } from '../lib/dienstplanDruckPdf'
import { dienstplanSupabase, type DienstplanKategorieDb, type DienstplanMarkierungRow, type DienstplanWunschTyp } from '../lib/dienstplanSupabase'
import { besondererTagFarbe, besondererTagFarbKlassen, kategorieFarbenMap, kategorieFarbKlassen, markierungFarbKlassen } from '../lib/dienstplanMarkierungen'
import { Modal, Actions, ErrorMessage, inputClass } from '../components/ZentraleEntryEditor'
import { formatStunden, thisMonthLocal } from '../lib/ueberstunden'
import { NACHTDIENST_BIS, NACHTDIENST_VON, persoenlicheStundenUebersicht, zaehleDienstarten } from '../lib/dienstplanAuswertung'
import { kategorisiereRohtext, parseDienstCode } from '../lib/dienstplanImport'
import { abschnittFuerAnzeige, effektiveAbwesenheitJeTag, fehlendeGrundbesetzung, tagOderNacht } from '../lib/dienstplanBesetzung'
import { ruhezeitVerletzungen } from '../lib/dienstplanRegelpruefung'
import { generiereGrundbesetzungsVorschlag, type VorschlagEintrag } from '../lib/dienstplanVorschlag'
import { berechneSollstunden, istWerktag, VOLLZEIT_BESCHAEFTIGUNGSGRAD } from '../lib/dienstplanSollstunden'
import { WUNSCH_LABEL } from '../lib/dienstplanWunsch'
import { DIENSTPLAN_GRUPPE_LABEL, dienstplanGruppe, istAdminProfil, istAutomatischEinteilbar, kurznamen, sortiereNachDienstplanGruppe, type DienstplanGruppe } from '../lib/dienstplanRoster'
import { ET_ROSTER_ORGANISATION } from '../lib/usersSeed'

// Planer-Grid für die Dienstplan-Planung im Portal (siehe
// /root/.claude/plans/glowing-imagining-badger.md, Phase 3): Personen ×
// Tage, Klick auf eine Zelle öffnet einen Editor für die (bis zu zwei)
// Rohzeilen dieses Tages - Kürzel per Chip oder Freitext, Uhrzeit per
// Preset oder frei. Speichert über die granularen RPCs
// dienstplan_dienst_setzen/dienstplan_dienst_loeschen (Migration
// 20260925153300), nicht über den Excel-Import-Weg. Live-Warnungen: rote
// Markierung in der Tagesspalte bei fehlender Grundbesetzung (Z/ID/JD,
// siehe lib/dienstplanBesetzung.ts - dieselbe Logik wie im
// Dienststellenkalender) und rote Zellenmarkierung bei zu kurzer Ruhezeit
// (lib/dienstplanRegelpruefung.ts). Eingereichte Dienstwünsche (Phase 2)
// werden als kleines Symbol angezeigt, binden den Planer aber nicht.
// "Vorschlag generieren" (Phase 4) füllt unbesetzte Grundbesetzungs-Slots
// heuristisch vor (lib/dienstplanVorschlag.ts) - die Vorschläge werden NUR
// im Browser gehalten (gestrichelt dargestellt), bis der Planer sie über
// "Vorschläge übernehmen" bewusst speichert oder verwirft. Nur
// Admin/Genehmiger erreichen diese Seite (siehe ProtectedRoute
// genehmigerOnly in App.tsx).

interface DienstZeile { beamter_id: string; datum: string; zeile: 1 | 2; rohtext: string; von_zeit: string | null; bis_zeit: string | null; kategorie: DienstplanKategorieDb; markierung_id: string | null }
interface MitarbeiterOption { id: string; name: string; dienstnummer: string | null }
interface WunschEintrag { wunsch: DienstplanWunschTyp; notiz: string | null; vonZeit: string | null; bisZeit: string | null }

const WOCHENTAG_LABEL: Record<number, string> = { 0: 'So', 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa' }
const ABSCHNITT_LABEL = { tag: 'Tag', nacht: 'Nacht' } as const

function tageImMonat(monatIso: string): string[] {
  const [jahr, monat] = monatIso.split('-').map(Number)
  const letzterTag = new Date(jahr, monat, 0).getDate()
  return Array.from({ length: letzterTag }, (_, index) => `${monatIso}-${String(index + 1).padStart(2, '0')}`)
}

/** Letzter Kalendertag des Vormonats als 'YYYY-MM-DD' - für die Ruhezeit-Prüfung über den Monatswechsel hinweg (Nachtdienst am Monatsletzten blockiert Tagdienst am 1.). */
function vorherigerMonatLetzterTag(monatIso: string): string {
  const [jahr, monat] = monatIso.split('-').map(Number)
  const letzterTagVormonat = new Date(jahr, monat - 1, 0)
  return `${letzterTagVormonat.getFullYear()}-${String(letzterTagVormonat.getMonth() + 1).padStart(2, '0')}-${String(letzterTagVormonat.getDate()).padStart(2, '0')}`
}

/** 'YYYY-MM-DD' als lokales Datum (nicht UTC) - wie an mehreren Stellen in dieser Datei für Wochentags-/Feiertagsprüfungen gebraucht. */
function datumAusIso(datumIso: string): Date {
  const [jahr, monat, tag] = datumIso.split('-').map(Number)
  return new Date(jahr, monat - 1, tag)
}

/** Ob ein Dienstwunsch den angegebenen Zeitabschnitt betrifft - Urlaub sowie die dienstlichen Termine (Gerichtsverhandlung/Schulverkehrserziehung/Personalvertretung, siehe lib/dienstplanWunsch.ts) sind ganztägig relevant, unabhängig von einer evtl. angegebenen Uhrzeit. */
function wunschBetrifftAbschnitt(wunsch: DienstplanWunschTyp, abschnitt: 'tag' | 'nacht'): boolean {
  if (wunsch === 'urlaub' || wunsch === 'gerichtsverhandlung' || wunsch === 'schulverkehrserziehung' || wunsch === 'personalvertretung') return true
  return wunsch === (abschnitt === 'tag' ? 'frei_tag' : 'frei_nacht')
}

const QUICK_KUERZEL = ['Z', 'ID', 'JD', 'VD', 'TD', 'ET', 'SVE', 'RA', 'BHF', 'KFZ', 'MOT', 'PV', 'SCH', 'ZIV']
const ABWESENHEIT_KUERZEL: { label: string; code: string }[] = [
  { label: 'Urlaub', code: 'U' },
  { label: 'Krank', code: 'Krank' },
  { label: 'Sonderurlaub', code: 'SoUrl' },
  { label: 'Stundenersatz', code: 'StdErsatz' },
  { label: 'Karenz', code: 'Karenz' },
]

interface ZeileForm { code: string; vonZeit: string; bisZeit: string; markierungId: string }
const LEERE_ZEILE: ZeileForm = { code: '', vonZeit: '', bisZeit: '', markierungId: '' }

function ZeileEditor({ titel, form, setForm, entfernen, markierungen }: { titel: string; form: ZeileForm; setForm: (form: ZeileForm) => void; entfernen?: () => void; markierungen: readonly DienstplanMarkierungRow[] }) {
  const kategorie = form.code ? kategorisiereRohtext(form.code) : null
  const zeitRelevant = kategorie === 'dienst'
  return <div className="rounded-lg border border-gray-200 p-3">
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titel}</p>
      {entfernen ? <button type="button" onClick={entfernen} className="text-xs text-red-700 hover:underline">löschen</button> : null}
    </div>
    <div className="mt-2 flex flex-wrap gap-1.5">
      {QUICK_KUERZEL.map(code => <button key={code} type="button" onClick={() => setForm({ ...form, code })} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${form.code.toUpperCase() === code ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{code}</button>)}
      {ABWESENHEIT_KUERZEL.map(({ label, code }) => <button key={code} type="button" onClick={() => setForm({ ...form, code, vonZeit: '', bisZeit: '' })} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${form.code.toUpperCase() === code.toUpperCase() ? 'border-amber-700 bg-amber-700 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{label}</button>)}
    </div>
    <label className="mt-2 block text-xs font-medium text-gray-600">Kürzel (frei, z. B. "SVE/TD")
      <input type="text" className={inputClass} value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} />
    </label>
    {zeitRelevant ? <div className="mt-2">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setForm({ ...form, vonZeit: '08:00', bisZeit: '19:00' })} className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">Tag 08:00–19:00</button>
        <button type="button" onClick={() => setForm({ ...form, vonZeit: '', bisZeit: '' })} className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">Ohne Zeit (Standard {NACHTDIENST_VON}–{NACHTDIENST_BIS})</button>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <input type="time" className={`${inputClass} mt-0 w-auto`} value={form.vonZeit} onChange={event => setForm({ ...form, vonZeit: event.target.value })} />
        <span className="text-xs text-gray-400">bis</span>
        <input type="time" className={`${inputClass} mt-0 w-auto`} value={form.bisZeit} onChange={event => setForm({ ...form, bisZeit: event.target.value })} />
      </div>
    </div> : null}
    {markierungen.length > 0 ? <label className="mt-2 block text-xs font-medium text-gray-600">Farbmarkierung (rein visuell, z. B. Überstunden - auch ohne Kürzel setzbar, z. B. um ein übersehenes Wochenende bei Krank/Urlaub nachträglich einzufärben)
      <select className={inputClass} value={form.markierungId} onChange={event => setForm({ ...form, markierungId: event.target.value })}>
        <option value="">Keine</option>
        {markierungen.map(markierung => <option key={markierung.id} value={markierung.id}>{markierung.name}</option>)}
      </select>
    </label> : <p className="mt-2 text-xs text-gray-400">Noch keine Farbmarkierungen definiert - unter Dienstplan-Einstellungen anlegen, danach hier auswählbar.</p>}
  </div>
}

const DE_MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
function monatLangLabel(monatIso: string): string {
  const [jahr, monatNr] = monatIso.split('-').map(Number)
  return `${DE_MONATE[monatNr - 1]} ${jahr}`
}

export default function DienstplanPlanung() {
  const { profile } = useAuth()
  const [monat, setMonat] = useState(thisMonthLocal())
  const [monatRow, setMonatRow] = useState<{ id: string; status: string } | null>(null)
  const [mindestruhezeitStunden, setMindestruhezeitStunden] = useState(11)
  const [stundenProWerktag, setStundenProWerktag] = useState(8.75)
  const [beschaeftigungsgrade, setBeschaeftigungsgrade] = useState<Map<string, number>>(new Map())
  const [mitarbeiter, setMitarbeiter] = useState<MitarbeiterOption[]>([])
  const [dienste, setDienste] = useState<DienstZeile[]>([])
  const [wuensche, setWuensche] = useState<Map<string, WunschEintrag[]>>(new Map())
  const [markierungen, setMarkierungen] = useState<DienstplanMarkierungRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [anlegen, setAnlegen] = useState(false)
  const [veroeffentlichen, setVeroeffentlichen] = useState(false)
  const [vorschlaege, setVorschlaege] = useState<Map<string, VorschlagEintrag>>(new Map())
  const [vorschlagUebernehmen, setVorschlagUebernehmen] = useState(false)

  const [bearbeitung, setBearbeitung] = useState<{ beamterId: string; name: string; datum: string } | null>(null)
  const [zeile1, setZeile1] = useState<ZeileForm>(LEERE_ZEILE)
  const [zeile2, setZeile2] = useState<ZeileForm | null>(null)
  const [speichern, setSpeichern] = useState(false)
  const [modalError, setModalError] = useState('')

  // Mehrfachauswahl (z. B. Urlaub für einen Zeitraum/mehrere Personen auf
  // einmal eintragen, statt jede Zelle einzeln zu bearbeiten) - Schlüssel
  // `${beamterId}|${datum}` wie beim einzelnen Zellen-Klick, wirkt also auf
  // beide Tag-/Nacht-Unterzeilen dieses Tages. Auf Geräten mit Maus (grober
  // Zeiger = false, siehe pointer:coarse) per Ziehen über die Zellen, auf
  // Touch-Geräten (Ziehen kollidiert dort mit dem Scrollen) stattdessen
  // über ein eigenes Zeitraum-Formular.
  const istTouchGeraet = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, [])
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set())
  const [mehrfachSpeichern, setMehrfachSpeichern] = useState(false)

  const [dragStart, setDragStart] = useState<{ beamterId: string; datum: string } | null>(null)
  const [dragEnde, setDragEnde] = useState<{ beamterId: string; datum: string } | null>(null)
  const [dragBewegt, setDragBewegt] = useState(false)

  const [zeitraumModal, setZeitraumModal] = useState(false)
  const [zeitraumForm, setZeitraumForm] = useState({ beamterId: '', von: '', bis: '', code: '' })
  const [zeitraumError, setZeitraumError] = useState('')

  // Wer am letzten Tag des Vormonats Nachtdienst hatte, darf laut
  // Kommandant am 1. dieses Monats keinen Tagdienst bekommen (24 Stunden
  // Ruhezeit nach einem Nachtdienst) - wird am 1. rot markiert, siehe JSX.
  const [naechtlicherUebertrag, setNaechtlicherUebertrag] = useState<Set<string>>(new Set())

  // Beim ersten Laden auf den vom Genehmiger hinterlegten "aktuellen
  // Dienstplan" (dienstplan_regeln.aktueller_planungsmonat) springen, statt
  // immer den Kalendermonat zu zeigen - danach bleibt die Monatsnavigation
  // frei (siehe monatInput.onChange).
  const standardMonatAngewandt = useRef(false)

  const load = useCallback(async () => {
    setLoading(true); setError(''); setVorschlaege(new Map())
    const [regelnResult, mitarbeiterResult, einstellungenResult, monatResult, vorMonatNachtResult, markierungenResult] = await Promise.all([
      dienstplanSupabase.from('dienstplan_regeln').select('stunden_pro_werktag,mindestruhezeit_stunden,aktueller_planungsmonat').eq('id', 1).maybeSingle(),
      supabase.from('profiles').select('id,name,dienstnummer,roles').eq('active', true).eq('organisation', ET_ROSTER_ORGANISATION).order('name'),
      dienstplanSupabase.from('dienstplan_person_einstellungen').select('beamter_id,beschaeftigungsgrad'),
      dienstplanSupabase.from('dienstplan_monate').select('id,status').eq('monat', `${monat}-01`).maybeSingle(),
      dienstplanSupabase.from('dienstplan_dienste').select('beamter_id,von_zeit').eq('datum', vorherigerMonatLetzterTag(monat)).eq('kategorie', 'dienst'),
      dienstplanSupabase.from('dienstplan_markierungen').select('id,name,farbe,kategorie,reihenfolge,updated_by,updated_at').order('reihenfolge').order('name'),
    ])
    if (regelnResult.error || mitarbeiterResult.error || einstellungenResult.error || monatResult.error || vorMonatNachtResult.error || markierungenResult.error) { setError('Grunddaten konnten nicht geladen werden.'); setLoading(false); return }
    setMarkierungen(markierungenResult.data ?? [])
    if (!standardMonatAngewandt.current) {
      standardMonatAngewandt.current = true
      const standard = regelnResult.data?.aktueller_planungsmonat?.slice(0, 7)
      if (standard && standard !== monat) { setMonat(standard); return }
    }
    if (regelnResult.data) { setStundenProWerktag(regelnResult.data.stunden_pro_werktag); setMindestruhezeitStunden(regelnResult.data.mindestruhezeit_stunden) }
    setBeschaeftigungsgrade(new Map((einstellungenResult.data ?? []).map(row => [row.beamter_id, row.beschaeftigungsgrad])))
    setNaechtlicherUebertrag(new Set((vorMonatNachtResult.data ?? []).filter(row => tagOderNacht(row.von_zeit) === 'nacht').map(row => row.beamter_id)))
    // Admin-Konten sind laut Kommandant nie Teil der einteilbaren Beamten;
    // Kommando/Dienstführung sollen als eigene Blöcke zusammenstehen (siehe
    // lib/dienstplanRoster.ts).
    const einteilbar = (mitarbeiterResult.data ?? []).filter(person => !istAdminProfil(person.roles))
    setMitarbeiter(sortiereNachDienstplanGruppe(einteilbar))
    setMonatRow(monatResult.data)

    if (!monatResult.data) { setDienste([]); setWuensche(new Map()); setLoading(false); return }
    const [dienstResult, wunschResult] = await Promise.all([
      dienstplanSupabase.from('dienstplan_dienste').select('beamter_id,datum,zeile,rohtext,von_zeit,bis_zeit,kategorie,markierung_id').eq('dienstplan_monat_id', monatResult.data.id).order('datum').order('zeile'),
      dienstplanSupabase.from('dienstplan_wuensche').select('beamter_id,datum,wunsch,notiz,von_zeit,bis_zeit').eq('monat', `${monat}-01`),
    ])
    if (dienstResult.error || wunschResult.error) { setError('Grunddaten konnten nicht geladen werden.'); setLoading(false); return }
    setDienste(dienstResult.data ?? [])
    const wunschMap = new Map<string, WunschEintrag[]>()
    for (const row of wunschResult.data ?? []) {
      const schluessel = `${row.beamter_id}|${row.datum}`
      const liste = wunschMap.get(schluessel) ?? []
      liste.push({ wunsch: row.wunsch, notiz: row.notiz, vonZeit: row.von_zeit, bisZeit: row.bis_zeit })
      wunschMap.set(schluessel, liste)
    }
    setWuensche(wunschMap)
    setLoading(false)
  }, [monat])
  useEffect(() => { void load() }, [load])

  const tage = useMemo(() => tageImMonat(monat), [monat])

  const dienstByKey = useMemo(() => {
    const map = new Map<string, DienstZeile[]>()
    for (const zeile of dienste) {
      const schluessel = `${zeile.beamter_id}|${zeile.datum}`
      const liste = map.get(schluessel) ?? []
      liste.push(zeile)
      map.set(schluessel, liste)
    }
    return map
  }, [dienste])

  // Für die Tag-/Nacht-Zweizeilenansicht (siehe unten): jede Rohzeile nach
  // tagOderNacht(von_zeit) einsortiert - dieselbe Logik wie im
  // Dienststellenkalender, damit beide Ansichten konsistent sind.
  const dienstByKeyAbschnitt = useMemo(() => {
    const map = new Map<string, DienstZeile[]>()
    for (const zeile of dienste) {
      const schluessel = `${zeile.beamter_id}|${zeile.datum}|${abschnittFuerAnzeige(zeile)}`
      const liste = map.get(schluessel) ?? []
      liste.push(zeile)
      map.set(schluessel, liste)
    }
    return map
  }, [dienste])

  const markierungenById = useMemo(() => new Map(markierungen.map(markierung => [markierung.id, markierung])), [markierungen])

  // Wer über ein Wochenende/Feiertag hinweg durchgehend abwesend ist (z. B.
  // Freitag UND der folgende Montag "krank"), soll dort auch farblich
  // durchgehend erscheinen, obwohl für Wochenenden/Feiertage bewusst keine
  // echten Abwesenheits-Zeilen angelegt werden (siehe
  // wendeKuerzelAufZellenAn) - reine Anzeige-Ergänzung, siehe
  // lib/dienstplanBesetzung.ts::effektiveAbwesenheitJeTag.
  const effektiveAbwesenheit = useMemo(
    () => effektiveAbwesenheitJeTag(dienste, mitarbeiter.map(person => person.id), tage),
    [dienste, mitarbeiter, tage],
  )

  // Farbe je Abwesenheitskategorie (Urlaub/Krank/Sonderurlaub/Karenz/
  // Stundenersatz) kommt aus den gleichnamigen "System"-Markierungen (siehe
  // lib/dienstplanMarkierungen.ts) - der Planer kann sie in den
  // Dienstplan-Einstellungen umfärben.
  const kategorieFarben = useMemo(() => kategorieFarbenMap(markierungen), [markierungen])

  // Farbe für die Wochenende/Feiertag-Hervorhebung kommt ebenso aus einer
  // "System"-Markierung (kategorie 'wochenende_feiertag') - der Planer kann
  // sie in den Dienstplan-Einstellungen umfärben (Standard Orange, siehe
  // lib/dienstplanMarkierungen.ts).
  const besondererTagFarben = useMemo(() => besondererTagFarbKlassen(besondererTagFarbe(markierungen)), [markierungen])

  // id der System-Markierung "Überstunden" (kategorie 'ueberstunden') - für
  // die Überstunden-Zeile in der Auswertung (siehe zaehleDienstarten).
  const ueberstundenMarkierungId = useMemo(() => markierungen.find(markierung => markierung.kategorie === 'ueberstunden')?.id ?? null, [markierungen])

  // Für die Kopfzeile: Kommando/Dienstführung/Beamte-Blöcke als
  // zusammenhängende Spaltengruppen (mitarbeiter ist bereits per
  // sortiereNachDienstplanGruppe geordnet, siehe load()).
  const personGruppenSpans = useMemo(() => {
    const spans: { gruppe: DienstplanGruppe; span: number }[] = []
    for (const person of mitarbeiter) {
      const gruppe = dienstplanGruppe(person.dienstnummer)
      const letzter = spans[spans.length - 1]
      if (letzter && letzter.gruppe === gruppe) letzter.span++
      else spans.push({ gruppe, span: 1 })
    }
    return spans
  }, [mitarbeiter])

  // Spalten-Trennlinien: dicke Linie zwischen Personen-Gruppen, dünne
  // zwischen einzelnen Beamten-Spalten - die letzte Spalte insgesamt
  // bekommt keine (Tabellenrand). Auf jede Personen-Spalte angewendet
  // (Kopf- und Datenzellen), damit beide Zeilen konsistent aussehen.
  const spaltenBorderKlasse = useMemo(() => {
    const klasse = new Map<string, string>()
    let index = 0
    for (const { span } of personGruppenSpans) {
      for (let i = 0; i < span; i++) {
        const person = mitarbeiter[index]
        const istLetzteSpalte = index === mitarbeiter.length - 1
        const istGruppenEnde = i === span - 1
        klasse.set(person.id, istLetzteSpalte ? '' : istGruppenEnde ? 'border-r-2 border-r-gray-400' : 'border-r border-r-gray-200')
        index++
      }
    }
    return klasse
  }, [personGruppenSpans, mitarbeiter])

  const kurznamenMap = useMemo(() => kurznamen(mitarbeiter), [mitarbeiter])

  // Verfügbare Stunden je Person für die Kopfzeile: Sollstunden (aus
  // Beschäftigungsgrad, siehe lib/dienstplanSollstunden.ts) abzüglich der
  // bereits im Grid eingeplanten Stunden. Echte Dienste zählen mit ihrer
  // tatsächlichen Dauer (lib/dienstplanAuswertung.ts, dieselbe Berechnung
  // wie in "Meine Dienste"); ganztägige Abwesenheiten (Urlaub/Krank/
  // Sonderurlaub/Karenz/Stundenersatz) haben keine Uhrzeit und zählen
  // stattdessen pauschal mit den Stunden pro Werktag - aber nur an
  // Werktagen (Wochenenden/Feiertage werden laut Kommandant nicht
  // mitgezählt, siehe istWerktag). Vorschläge (Phase 4) zählen erst nach
  // dem Übernehmen, solange sie nur lokal vorgeschlagen sind.
  const verfuegbareStunden = useMemo(() => {
    const dienstePerPerson = new Map<string, DienstZeile[]>()
    for (const zeile of dienste) {
      const liste = dienstePerPerson.get(zeile.beamter_id) ?? []
      liste.push(zeile)
      dienstePerPerson.set(zeile.beamter_id, liste)
    }
    const ergebnis = new Map<string, number>()
    for (const person of mitarbeiter) {
      const zeilen = dienstePerPerson.get(person.id) ?? []
      const grad = beschaeftigungsgrade.get(person.id) ?? VOLLZEIT_BESCHAEFTIGUNGSGRAD
      const soll = berechneSollstunden(monat, stundenProWerktag, grad)
      const abwesenheitsTage = new Set(zeilen.filter(zeile => zeile.kategorie !== 'dienst' && zeile.kategorie !== 'sonstiges' && istWerktag(datumAusIso(zeile.datum))).map(zeile => zeile.datum))
      const geplant = persoenlicheStundenUebersicht(zeilen).gesamt + abwesenheitsTage.size * stundenProWerktag
      ergebnis.set(person.id, soll - geplant)
    }
    return ergebnis
  }, [dienste, mitarbeiter, beschaeftigungsgrade, monat, stundenProWerktag])

  // Auswertung unterhalb des Planer-Grids (als zusätzliche Fußzeilen
  // derselben Tabelle, je Person in ihrer eigenen Spalte - nicht als
  // separate Tabelle mit Personen als Zeilen, da die Personen schon die
  // Spaltenköpfe des Grids sind): Stunden sowie Anzahl/Art der Dienste je
  // Person (Grund- vs. Zusatzdienst, Tag- vs. Nachtdienst - siehe
  // lib/dienstplanAuswertung.ts::zaehleDienstarten). Reine Anzeige, keine
  // Auswirkung auf verfuegbareStunden/das Grid selbst.
  const auswertungByPersonId = useMemo(() => {
    const dienstePerPerson = new Map<string, DienstZeile[]>()
    for (const zeile of dienste) {
      const liste = dienstePerPerson.get(zeile.beamter_id) ?? []
      liste.push(zeile)
      dienstePerPerson.set(zeile.beamter_id, liste)
    }
    return new Map(mitarbeiter.map(person => {
      const zeilen = dienstePerPerson.get(person.id) ?? []
      return [person.id, { stunden: persoenlicheStundenUebersicht(zeilen).gesamt, arten: zaehleDienstarten(zeilen, ueberstundenMarkierungId) }] as const
    }))
  }, [dienste, mitarbeiter, ueberstundenMarkierungId])

  const fehlendeGrund = useMemo(() => fehlendeGrundbesetzung(dienste, tage), [dienste, tage])
  const ruheVerletzt = useMemo(
    () => ruhezeitVerletzungen(dienste.map(zeile => ({ beamterId: zeile.beamter_id, datum: zeile.datum, vonZeit: zeile.von_zeit, bisZeit: zeile.bis_zeit, kategorie: zeile.kategorie })), mindestruhezeitStunden),
    [dienste, mindestruhezeitStunden],
  )

  async function monatAnlegen() {
    setAnlegen(true); setError('')
    const result = await dienstplanSupabase.rpc('dienstplan_monat_anlegen', { p_monat: `${monat}-01` })
    setAnlegen(false)
    if (result.error || !result.data) { setError('Der Monat konnte nicht angelegt werden.'); return }
    setMonatRow({ id: result.data, status: 'entwurf' })
  }

  async function monatVeroeffentlichen() {
    if (!monatRow) return
    setVeroeffentlichen(true); setError('')
    const result = await dienstplanSupabase.rpc('dienstplan_monat_veroeffentlichen', { p_monat_id: monatRow.id })
    setVeroeffentlichen(false)
    if (result.error) { setError('Der Monat konnte nicht veröffentlicht werden.'); return }
    setNotice('Der Monat ist jetzt veröffentlicht.')
    setMonatRow(current => current ? { ...current, status: 'veroeffentlicht' } : current)
  }

  // Druck-/Exportansicht (Phase 6) - reine Darstellung der bereits
  // geladenen Monatsdaten, kein zusätzlicher Datenbankzugriff nötig.
  function druckAusgeben() {
    generateDienstplanDruckPdf({
      monatLabel: monatLangLabel(monat),
      bearbeiterName: officerPrintName(profile),
      personen: mitarbeiter.map(person => ({ ...person, kurzname: kurznamenMap.get(person.id) ?? person.name, gruppe: dienstplanGruppe(person.dienstnummer) })),
      tage,
      dienste,
      markierungen,
    })
  }

  function zeileZuForm(zeile: DienstZeile | undefined): ZeileForm {
    if (!zeile) return LEERE_ZEILE
    return { code: parseDienstCode(zeile.rohtext).code, vonZeit: zeile.von_zeit ?? '', bisZeit: zeile.bis_zeit ?? '', markierungId: zeile.markierung_id ?? '' }
  }

  function oeffneZelle(beamterId: string, name: string, datum: string) {
    const vorhandene = dienstByKey.get(`${beamterId}|${datum}`) ?? []
    setZeile1(zeileZuForm(vorhandene.find(zeile => zeile.zeile === 1)))
    const zweite = vorhandene.find(zeile => zeile.zeile === 2)
    setZeile2(zweite ? zeileZuForm(zweite) : null)
    setModalError('')
    setBearbeitung({ beamterId, name, datum })
  }

  async function speichereZelle() {
    if (!bearbeitung || !monatRow) return
    setSpeichern(true); setModalError('')
    const aufgaben: PromiseLike<{ error: unknown }>[] = []
    const neueZeilen = new Map<1 | 2, DienstZeile | null>()
    for (const [nummer, form] of [[1, zeile1], [2, zeile2]] as const) {
      const bestandVorher = (dienstByKey.get(`${bearbeitung.beamterId}|${bearbeitung.datum}`) ?? []).some(zeile => zeile.zeile === nummer)
      const markierungIdOhneCode = form?.markierungId || null
      if (!form || (!form.code.trim() && !markierungIdOhneCode)) {
        if (bestandVorher) aufgaben.push(dienstplanSupabase.rpc('dienstplan_dienst_loeschen', { p_monat_id: monatRow.id, p_beamter_id: bearbeitung.beamterId, p_datum: bearbeitung.datum, p_zeile: nummer }))
        neueZeilen.set(nummer, null)
        continue
      }
      const code = form.code.trim()
      // Eine Farbmarkierung soll sich auch auf eine sonst leere Zelle setzen
      // lassen (z. B. um ein bei einem Krankenstand übersehenes Wochenende
      // nachträglich einzufärben) - ohne Kürzel bekommt die Zeile die
      // neutrale Kategorie "sonstiges" (zählt nirgends als Dienst oder
      // Abwesenheitstag, siehe zaehleDienstarten/persoenlicheStundenUebersicht/
      // verfuegbareStunden).
      const kategorie = code ? kategorisiereRohtext(code) : 'sonstiges'
      const vonZeit = kategorie === 'dienst' ? form.vonZeit : ''
      const bisZeit = kategorie === 'dienst' ? form.bisZeit : ''
      const markierungId = markierungIdOhneCode
      aufgaben.push(dienstplanSupabase.rpc('dienstplan_dienst_setzen', {
        p_monat_id: monatRow.id, p_beamter_id: bearbeitung.beamterId, p_datum: bearbeitung.datum, p_zeile: nummer,
        p_rohtext: code, p_von_zeit: vonZeit, p_bis_zeit: bisZeit, p_kategorie: kategorie, p_markierung_id: markierungId,
      }))
      neueZeilen.set(nummer, { beamter_id: bearbeitung.beamterId, datum: bearbeitung.datum, zeile: nummer, rohtext: code, von_zeit: vonZeit || null, bis_zeit: bisZeit || null, kategorie, markierung_id: markierungId })
    }
    const ergebnisse = await Promise.all(aufgaben)
    setSpeichern(false)
    if (ergebnisse.some(ergebnis => ergebnis.error)) { setModalError('Der Diensteintrag konnte nicht gespeichert werden.'); return }
    const { beamterId, datum } = bearbeitung
    setDienste(current => {
      const rest = current.filter(zeile => !(zeile.beamter_id === beamterId && zeile.datum === datum && neueZeilen.has(zeile.zeile)))
      const hinzu = Array.from(neueZeilen.values()).filter((zeile): zeile is DienstZeile => zeile !== null)
      return [...rest, ...hinzu]
    })
    setBearbeitung(null)
  }

  /**
   * Setzt Zeile 1 für alle Zellen in `ziel` (Schlüssel `${beamterId}|${datum}`)
   * auf dasselbe Kürzel (z. B. Urlaub für einen ganzen Zeitraum/mehrere
   * Personen auf einmal, statt jede Zelle einzeln über den Editor
   * abzutippen) - genutzt sowohl von der Drag-Auswahl (Maus) als auch vom
   * Zeitraum-Formular (Touch). Zeile 2 bleibt je Zelle unangetastet, wie
   * beim einzelnen Speichern auch.
   */
  async function wendeKuerzelAufZellenAn(ziel: Set<string>, code: string) {
    if (!monatRow || ziel.size === 0) return
    setMehrfachSpeichern(true); setError('')
    const kategorie = kategorisiereRohtext(code)
    const alleEintraege = Array.from(ziel).map(schluessel => {
      const [beamterId, datum] = schluessel.split('|')
      return { beamterId, datum }
    })
    // Abwesenheiten (Urlaub/Krank/...) werden laut Kommandant nur an
    // Werktagen eingetragen - Wochenenden/Feiertage werden übersprungen
    // (kein Eintrag, zählen auch bei den Sollstunden nicht mit).
    const eintraege = alleEintraege.filter(({ datum }) => istWerktag(datumAusIso(datum)))
    if (eintraege.length === 0) { setMehrfachSpeichern(false); setError('Der ausgewählte Zeitraum enthält keinen Werktag.'); return }
    const ergebnisse = await Promise.all(eintraege.map(({ beamterId, datum }) =>
      dienstplanSupabase.rpc('dienstplan_dienst_setzen', { p_monat_id: monatRow.id, p_beamter_id: beamterId, p_datum: datum, p_zeile: 1, p_rohtext: code, p_von_zeit: '', p_bis_zeit: '', p_kategorie: kategorie }),
    ))
    setMehrfachSpeichern(false)
    if (ergebnisse.some(ergebnis => ergebnis.error)) { setError('Nicht alle ausgewählten Zellen konnten gespeichert werden.'); return }
    setDienste(current => {
      const betroffen = new Set(eintraege.map(({ beamterId, datum }) => `${beamterId}|${datum}|1`))
      const rest = current.filter(zeile => !betroffen.has(`${zeile.beamter_id}|${zeile.datum}|${zeile.zeile}`))
      const neu = eintraege.map(({ beamterId, datum }): DienstZeile => ({ beamter_id: beamterId, datum, zeile: 1, rohtext: code, von_zeit: null, bis_zeit: null, kategorie, markierung_id: null }))
      return [...rest, ...neu]
    })
    const uebersprungen = alleEintraege.length - eintraege.length
    setNotice(`${eintraege.length} Zellen auf "${code}" gesetzt.${uebersprungen > 0 ? ` ${uebersprungen} Wochenend-/Feiertagszelle${uebersprungen === 1 ? '' : 'n'} übersprungen.` : ''}`)
    setAuswahl(new Set())
  }

  async function loescheZellen(ziel: Set<string>) {
    if (!monatRow || ziel.size === 0) return
    setMehrfachSpeichern(true); setError('')
    const eintraege = Array.from(ziel).map(schluessel => {
      const [beamterId, datum] = schluessel.split('|')
      return { beamterId, datum }
    })
    const ergebnisse = await Promise.all(eintraege.map(({ beamterId, datum }) =>
      dienstplanSupabase.rpc('dienstplan_dienst_loeschen', { p_monat_id: monatRow.id, p_beamter_id: beamterId, p_datum: datum, p_zeile: 1 }),
    ))
    setMehrfachSpeichern(false)
    if (ergebnisse.some(ergebnis => ergebnis.error)) { setError('Nicht alle ausgewählten Zellen konnten gelöscht werden.'); return }
    setDienste(current => {
      const betroffen = new Set(eintraege.map(({ beamterId, datum }) => `${beamterId}|${datum}|1`))
      return current.filter(zeile => !betroffen.has(`${zeile.beamter_id}|${zeile.datum}|${zeile.zeile}`))
    })
    setNotice(`${eintraege.length} Zellen gelöscht.`)
    setAuswahl(new Set())
  }

  /** Alle Zellen im rechteckigen Bereich zwischen start und ende (Personen-Spalten × Tage-Zeilen) - für die Drag-Auswahl mit der Maus. */
  function rechteckAuswahl(start: { beamterId: string; datum: string } | null, ende: { beamterId: string; datum: string } | null): Set<string> {
    if (!start || !ende) return new Set()
    const personIndex = mitarbeiter.map(person => person.id)
    const startPersonIdx = personIndex.indexOf(start.beamterId)
    const endePersonIdx = personIndex.indexOf(ende.beamterId)
    const startTagIdx = tage.indexOf(start.datum)
    const endeTagIdx = tage.indexOf(ende.datum)
    if (startPersonIdx === -1 || endePersonIdx === -1 || startTagIdx === -1 || endeTagIdx === -1) return new Set()
    const [minPerson, maxPerson] = [Math.min(startPersonIdx, endePersonIdx), Math.max(startPersonIdx, endePersonIdx)]
    const [minTag, maxTag] = [Math.min(startTagIdx, endeTagIdx), Math.max(startTagIdx, endeTagIdx)]
    const ergebnis = new Set<string>()
    for (let pi = minPerson; pi <= maxPerson; pi++) {
      for (let ti = minTag; ti <= maxTag; ti++) ergebnis.add(`${mitarbeiter[pi].id}|${tage[ti]}`)
    }
    return ergebnis
  }

  function dragStarten(beamterId: string, datum: string) {
    setDragStart({ beamterId, datum }); setDragEnde({ beamterId, datum }); setDragBewegt(false)
  }
  function dragBewegen(beamterId: string, datum: string) {
    if (!dragStart) return
    if (beamterId !== dragStart.beamterId || datum !== dragStart.datum) setDragBewegt(true)
    setDragEnde({ beamterId, datum })
  }
  // Ohne Bewegung war es ein normaler Klick (öffnet den Zellen-Editor wie
  // bisher) - erst ein tatsächliches Ziehen über eine andere Zelle löst die
  // Mehrfachauswahl aus. Der globale mouseup-Listener fängt auch ein
  // Loslassen außerhalb der Tabelle ab.
  useEffect(() => {
    if (!dragStart) return
    function dragBeenden() {
      if (dragBewegt) {
        setAuswahl(rechteckAuswahl(dragStart, dragEnde))
      } else {
        const person = mitarbeiter.find(p => p.id === dragStart?.beamterId)
        if (person && dragStart) oeffneZelle(person.id, person.name, dragStart.datum)
      }
      setDragStart(null); setDragEnde(null); setDragBewegt(false)
    }
    window.addEventListener('mouseup', dragBeenden)
    return () => window.removeEventListener('mouseup', dragBeenden)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragStart, dragEnde, dragBewegt])

  const angezeigteAuswahl = dragBewegt ? rechteckAuswahl(dragStart, dragEnde) : auswahl

  function zeitraumTage(von: string, bis: string): string[] {
    if (!von || !bis || von > bis) return []
    return tage.filter(datum => datum >= von && datum <= bis)
  }

  async function zeitraumUebernehmen() {
    setZeitraumError('')
    if (!zeitraumForm.beamterId) { setZeitraumError('Bitte eine Person wählen.'); return }
    if (!zeitraumForm.code) { setZeitraumError('Bitte ein Kürzel wählen.'); return }
    const betroffeneTage = zeitraumTage(zeitraumForm.von, zeitraumForm.bis)
    if (betroffeneTage.length === 0) { setZeitraumError('Bitte einen gültigen Zeitraum innerhalb des angezeigten Monats wählen.'); return }
    const ziel = new Set(betroffeneTage.map(datum => `${zeitraumForm.beamterId}|${datum}`))
    await wendeKuerzelAufZellenAn(ziel, zeitraumForm.code)
    setZeitraumModal(false)
    setZeitraumForm({ beamterId: '', von: '', bis: '', code: '' })
  }

  async function zeitraumLoeschen() {
    setZeitraumError('')
    if (!zeitraumForm.beamterId) { setZeitraumError('Bitte eine Person wählen.'); return }
    const betroffeneTage = zeitraumTage(zeitraumForm.von, zeitraumForm.bis)
    if (betroffeneTage.length === 0) { setZeitraumError('Bitte einen gültigen Zeitraum innerhalb des angezeigten Monats wählen.'); return }
    const ziel = new Set(betroffeneTage.map(datum => `${zeitraumForm.beamterId}|${datum}`))
    await loescheZellen(ziel)
    setZeitraumModal(false)
    setZeitraumForm({ beamterId: '', von: '', bis: '', code: '' })
  }

  // Vorschlag generieren (Phase 4) - reine, lokale Berechnung über
  // lib/dienstplanVorschlag.ts, keine DB-Schreibzugriffe. Ersetzt
  // bestehende Vorschläge komplett (kein Zusammenführen über mehrere
  // Läufe hinweg, um Altdaten nicht unbemerkt stehen zu lassen).
  function vorschlagGenerieren() {
    const eingabeDienste = dienste.map(zeile => ({ beamterId: zeile.beamter_id, datum: zeile.datum, vonZeit: zeile.von_zeit, bisZeit: zeile.bis_zeit, kategorie: zeile.kategorie, code: parseDienstCode(zeile.rohtext).code }))
    // Wer über ein Wochenende/Feiertag hinweg durchgehend abwesend ist
    // (siehe effektiveAbwesenheit oben), muss dem Algorithmus auch für
    // diese Tage als abwesend übergeben werden - sonst schlägt er die
    // Person dort fälschlich vor, weil dafür keine echte Zeile existiert.
    const luecken = Array.from(effektiveAbwesenheit.entries()).map(([schluessel, kategorie]) => {
      const [beamterId, datum] = schluessel.split('|')
      return { beamterId, datum, vonZeit: null, bisZeit: null, kategorie, code: '' }
    })
    // Wer am letzten Tag des Vormonats Nachtdienst hatte, ist laut
    // Mindestruhezeit (24 Std. nach einem Nachtdienst) am 1. dieses Monats
    // für den Tagdienst gesperrt (siehe naechtlicherUebertrag/uebertragWarnung
    // oben) - dieser vorangegangene Dienst wird dem Algorithmus als
    // synthetischer Diensteintrag am Vortag übergeben, sonst kennt die
    // Ruhezeit-Prüfung (die nur die Diensteinträge DIESES Monats sieht)
    // diesen Übertrag nicht und schlägt die Person fälschlich vor.
    const vortag = vorherigerMonatLetzterTag(monat)
    const uebertragEintraege = Array.from(naechtlicherUebertrag).map(beamterId => ({ beamterId, datum: vortag, vonZeit: null, bisZeit: null, kategorie: 'dienst' as const, code: '' }))
    const eingabeWuensche = Array.from(wuensche.entries()).flatMap(([schluessel, liste]) => {
      const [beamterId, datum] = schluessel.split('|')
      return liste.map(eintrag => ({ beamterId, datum, wunsch: eintrag.wunsch }))
    })
    // Kommando ist nicht Teil der automatischen Grundbesetzungs-Zuteilung
    // (siehe lib/dienstplanRoster.ts) - kann aber weiterhin manuell über die
    // Zelle im Grid eingeteilt werden.
    const einteilbareMitarbeiter = mitarbeiter.filter(person => istAutomatischEinteilbar(person.dienstnummer))
    const ergebnis = generiereGrundbesetzungsVorschlag({ mitarbeiter: einteilbareMitarbeiter, tage, bestehendeDienste: [...eingabeDienste, ...luecken, ...uebertragEintraege], wuensche: eingabeWuensche, mindestruhezeitStunden })
    setVorschlaege(new Map(ergebnis.map(eintrag => [`${eintrag.beamterId}|${eintrag.datum}|${eintrag.abschnitt}`, eintrag])))
    setNotice(ergebnis.length > 0 ? `${ergebnis.length} Vorschläge generiert - bitte prüfen und übernehmen.` : 'Es gibt aktuell nichts vorzuschlagen (alles besetzt oder niemand verfügbar).')
    setError('')
  }

  function vorschlaegeVerwerfen() {
    setVorschlaege(new Map())
  }

  async function vorschlaegeUebernehmen() {
    if (!monatRow || vorschlaege.size === 0) return
    setVorschlagUebernehmen(true); setError('')
    const belegteZeilen = new Map<string, Set<1 | 2>>()
    function naechsteFreieZeile(beamterId: string, datum: string): 1 | 2 | null {
      const schluessel = `${beamterId}|${datum}`
      if (!belegteZeilen.has(schluessel)) belegteZeilen.set(schluessel, new Set((dienstByKey.get(schluessel) ?? []).map(zeile => zeile.zeile)))
      const belegt = belegteZeilen.get(schluessel)!
      const nummer = !belegt.has(1) ? 1 : !belegt.has(2) ? 2 : null
      if (nummer !== null) belegt.add(nummer)
      return nummer
    }

    const aufgaben: PromiseLike<{ error: unknown }>[] = []
    const neueZeilen: DienstZeile[] = []
    for (const vorschlag of vorschlaege.values()) {
      const nummer = naechsteFreieZeile(vorschlag.beamterId, vorschlag.datum)
      if (nummer === null) continue // sollte durch den Algorithmus schon ausgeschlossen sein, sicherheitshalber übersprungen statt überschrieben
      aufgaben.push(dienstplanSupabase.rpc('dienstplan_dienst_setzen', {
        p_monat_id: monatRow.id, p_beamter_id: vorschlag.beamterId, p_datum: vorschlag.datum, p_zeile: nummer,
        p_rohtext: vorschlag.code, p_von_zeit: vorschlag.vonZeit ?? '', p_bis_zeit: vorschlag.bisZeit ?? '', p_kategorie: 'dienst',
      }))
      neueZeilen.push({ beamter_id: vorschlag.beamterId, datum: vorschlag.datum, zeile: nummer, rohtext: vorschlag.code, von_zeit: vorschlag.vonZeit, bis_zeit: vorschlag.bisZeit, kategorie: 'dienst', markierung_id: null })
    }
    const ergebnisse = await Promise.all(aufgaben)
    setVorschlagUebernehmen(false)
    if (ergebnisse.some(ergebnis => ergebnis.error)) { setError('Nicht alle Vorschläge konnten gespeichert werden.'); return }
    setDienste(current => [...current, ...neueZeilen])
    setVorschlaege(new Map())
    setNotice(`${neueZeilen.length} Vorschläge übernommen.`)
  }

  return <div className="mx-auto max-w-full px-4 py-6 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-gray-900">Dienstplan-Planung</h1><p className="mt-1 text-sm text-gray-500">Tage × Personen, je Tag eine Tag- und eine Nachtzeile - Zelle anklicken, um den Dienst einzutragen. Rot markiert: fehlende Grundbesetzung (Zeile), zu kurze Ruhezeit bzw. Nachtdienst am Vortag des Vormonats (Zelle). Wochenende/Feiertag hervorgehoben (Farbe unter Dienstplan-Einstellungen änderbar, Standard Orange). Sonne/Mond: Tag-/Nachtzeile. Gelb: Urlaub/Sonderurlaub/Stundenersatz. Grün: krank. Rosa: Karenz.</p></div>
      <input type="month" value={monat} onChange={event => setMonat(event.target.value)} className={`${inputClass} mt-0 w-auto`} />
    </div>

    {error ? <div className="mt-4"><ErrorMessage text={error} /></div> : null}
    {notice ? <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p> : null}

    {loading ? <div className="mt-8 flex justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-800" /></div>
      : !monatRow ? <div className="mt-8 rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center">
        <CalendarDays className="mx-auto mb-2 h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">Für diesen Monat existiert noch kein Dienstplan.</p>
        <button type="button" disabled={anlegen} onClick={() => void monatAnlegen()} className="mt-4 rounded-lg bg-blue-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{anlegen ? 'Wird angelegt…' : 'Monat anlegen'}</button>
      </div>
      : <>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500">Status: <span className="font-medium text-gray-800">{monatRow.status === 'veroeffentlicht' ? 'Veröffentlicht' : 'Entwurf'}</span></p>
          <div className="flex flex-wrap items-center gap-2">
            {vorschlaege.size > 0 ? <>
              <span className="text-xs text-gray-500">{vorschlaege.size} Vorschläge (gestrichelt im Grid)</span>
              <button type="button" onClick={vorschlaegeVerwerfen} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"><X className="h-3.5 w-3.5" /> Verwerfen</button>
              <button type="button" disabled={vorschlagUebernehmen} onClick={() => void vorschlaegeUebernehmen()} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> {vorschlagUebernehmen ? 'Wird übernommen…' : 'Vorschläge übernehmen'}</button>
            </> : <button type="button" onClick={vorschlagGenerieren} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><Sparkles className="h-3.5 w-3.5" /> Vorschlag generieren</button>}
            {istTouchGeraet ? <button type="button" onClick={() => { setZeitraumError(''); setZeitraumModal(true) }} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><CalendarRange className="h-3.5 w-3.5" /> Zeitraum eintragen</button> : null}
            {monatRow.status !== 'veroeffentlicht' ? <button type="button" disabled={veroeffentlichen} onClick={() => void monatVeroeffentlichen()} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> {veroeffentlichen ? 'Wird veröffentlicht…' : 'Veröffentlichen'}</button> : null}
            {monatRow.status === 'veroeffentlicht' ? <button type="button" onClick={druckAusgeben} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><Printer className="h-3.5 w-3.5" /> Drucken/Exportieren</button> : null}
          </div>
        </div>

        {!istTouchGeraet ? <p className="mt-2 text-xs text-gray-400">Tipp: Über mehrere Zellen ziehen (Personen × Tage), um sie gemeinsam z. B. auf Urlaub zu setzen.</p> : null}

        {auswahl.size > 0 ? <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <span className="text-xs font-medium text-blue-900">{auswahl.size} Zelle{auswahl.size === 1 ? '' : 'n'} ausgewählt:</span>
          {ABWESENHEIT_KUERZEL.map(({ label, code }) => <button key={code} type="button" disabled={mehrfachSpeichern} onClick={() => void wendeKuerzelAufZellenAn(auswahl, code)} className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50">{label}</button>)}
          <button type="button" disabled={mehrfachSpeichern} onClick={() => void loescheZellen(auswahl)} className="rounded-full border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Löschen</button>
          <button type="button" onClick={() => setAuswahl(new Set())} className="text-xs text-blue-800 hover:underline">Auswahl aufheben</button>
        </div> : null}

        <div className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-gray-200 bg-white">
          <table className="text-xs">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky left-0 z-20 w-[6rem] min-w-[6rem] max-w-[6rem] whitespace-nowrap border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600">Datum</th>
                <th rowSpan={2} className="sticky left-[6rem] z-20 w-[5.75rem] min-w-[5.75rem] max-w-[5.75rem] whitespace-nowrap border-b border-r border-gray-200 bg-gray-50 px-2 py-2 text-left font-semibold text-gray-600"></th>
                {personGruppenSpans.map(({ gruppe, span }, index) => <th key={index} colSpan={span} className={`border-b border-gray-200 bg-gray-100 px-2 py-1 text-center text-[0.65rem] font-bold uppercase tracking-wide text-gray-500 ${index < personGruppenSpans.length - 1 ? 'border-r-2 border-r-gray-400' : ''}`}>{DIENSTPLAN_GRUPPE_LABEL[gruppe]}</th>)}
              </tr>
              <tr>
                {mitarbeiter.map(person => {
                  const verfuegbar = verfuegbareStunden.get(person.id) ?? 0
                  return <th key={person.id} title={person.name} className={`min-w-20 whitespace-nowrap border-b border-gray-200 px-1.5 py-2 text-center font-semibold text-gray-600 ${spaltenBorderKlasse.get(person.id) ?? ''}`}>
                    {kurznamenMap.get(person.id) ?? person.name}
                    <span className={`block text-[0.6rem] font-normal normal-case tracking-normal ${verfuegbar < 0 ? 'text-red-600' : 'text-gray-400'}`}>{formatStunden(verfuegbar)} Std. frei</span>
                  </th>
                })}
              </tr>
            </thead>
            <tbody>
              {tage.map(datum => {
                const [, , tagText] = datum.split('-')
                const datumObjekt = new Date(Number(datum.slice(0, 4)), Number(datum.slice(5, 7)) - 1, Number(tagText))
                const wochentag = datumObjekt.getDay()
                // Wochenenden und Feiertage sollen optisch hervorstechen (Farbe
                // aus der System-Markierung 'wochenende_feiertag', siehe
                // besondererTagFarben oben), Tag/Nacht bekommt zusätzlich zur
                // Hintergrundfarbe je ein eigenes Icon (Sonne/Mond), damit
                // beides auch unabhängig voneinander erkennbar bleibt.
                const besondererTag = wochentag === 0 || wochentag === 6 || isAustrianHoliday(datumObjekt)
                return (['tag', 'nacht'] as const).map(abschnitt => {
                  const fehlend = (fehlendeGrund.get(datum) ?? []).filter(text => text.endsWith(abschnitt === 'tag' ? '(Tag)' : '(Nacht)'))
                  const zeilenHintergrund = besondererTag ? (abschnitt === 'tag' ? besondererTagFarben.bg : besondererTagFarben.bgNacht) : (abschnitt === 'tag' ? 'bg-white' : 'bg-gray-50/50')
                  return <tr key={`${datum}|${abschnitt}`} className={`${zeilenHintergrund} ${abschnitt === 'tag' ? 'border-t border-gray-200' : ''}`}>
                    {abschnitt === 'tag' ? (
                      <td rowSpan={2} className={`sticky left-0 z-10 w-[6rem] min-w-[6rem] max-w-[6rem] whitespace-nowrap border-r border-gray-200 px-3 py-1.5 align-top ${besondererTag ? besondererTagFarben.bg : 'bg-white'}`}>
                        <span className={`font-medium ${besondererTag ? besondererTagFarben.textTag : 'text-gray-800'}`}>{WOCHENTAG_LABEL[wochentag]} {tagText}.</span>
                      </td>
                    ) : null}
                    <td title={fehlend.length > 0 ? fehlend.join(', ') : undefined} className={`sticky left-[6rem] z-10 w-[5.75rem] min-w-[5.75rem] max-w-[5.75rem] whitespace-nowrap border-r border-gray-200 px-2 py-1.5 ${fehlend.length > 0 ? 'bg-red-50' : besondererTag ? (abschnitt === 'tag' ? besondererTagFarben.bg : besondererTagFarben.bgNacht) : abschnitt === 'tag' ? 'bg-white' : 'bg-gray-50'}`}>
                      {abschnitt === 'tag' ? <Sun className="mr-0.5 inline h-3 w-3 text-amber-500" /> : <Moon className="mr-0.5 inline h-3 w-3 text-indigo-500" />}
                      <span className={`text-[0.65rem] uppercase tracking-wide ${fehlend.length > 0 ? 'text-red-600' : abschnitt === 'tag' ? 'text-amber-700' : 'text-indigo-700'}`}>{ABSCHNITT_LABEL[abschnitt]}</span>
                      {fehlend.length > 0 ? <AlertTriangle className="ml-1 inline h-3 w-3 text-red-600" /> : null}
                    </td>
                    {mitarbeiter.map(person => {
                      const zeilen = (dienstByKeyAbschnitt.get(`${person.id}|${datum}|${abschnitt}`) ?? []).slice().sort((a, b) => a.zeile - b.zeile)
                      const wuenscheHeute = (wuensche.get(`${person.id}|${datum}`) ?? []).filter(eintrag => wunschBetrifftAbschnitt(eintrag.wunsch, abschnitt))
                      const ruheVerletzung = ruheVerletzt.has(`${person.id}|${datum}`)
                      const vorschlag = vorschlaege.get(`${person.id}|${datum}|${abschnitt}`)
                      const ausgewaehlt = angezeigteAuswahl.has(`${person.id}|${datum}`)
                      const uebertragWarnung = abschnitt === 'tag' && datum === tage[0] && naechtlicherUebertrag.has(person.id)
                      // Eine Abwesenheit gilt ganztägig, ist aber nur als EINE Rohzeile
                      // in der Tag-Zeile gespeichert (siehe abschnittFuerAnzeige) - über
                      // dienstByKey (alle Zeilen des Tages, unabhängig vom Abschnitt)
                      // nachschlagen, damit die Farbmarkierung durchgehend über Tag UND
                      // Nacht sichtbar ist, mit einer kräftigeren Nuance für die Nacht.
                      const absenz = (dienstByKey.get(`${person.id}|${datum}`) ?? []).find(zeile => zeile.kategorie !== 'dienst')
                      const absenzKategorie = absenz?.kategorie ?? effektiveAbwesenheit.get(`${person.id}|${datum}`)
                      const absenzFarben = absenzKategorie ? kategorieFarbKlassen(absenzKategorie, kategorieFarben) : null
                      const absenzHintergrund = absenzFarben ? (abschnitt === 'tag' ? absenzFarben.bg : absenzFarben.bgNacht) : null
                      // Vom Planer frei definierte Farbmarkierung (z. B. "Überstunden"
                      // blau, siehe lib/dienstplanMarkierungen.ts) - rein visuell,
                      // unabhängig von der Kategorie. Bewusst als eigene, explizite
                      // Hintergrundfarbe gesetzt (nicht nur über die Zeile vererbt),
                      // damit sie auch an Wochenenden (die sonst per Zeilen-Hintergrund
                      // eingefärbt sind) sichtbar bleibt. Eine Markierung auf einem
                      // echten (zeitgebundenen) Dienst bleibt auf dessen Abschnitt
                      // beschränkt (zeilen); eine Markierung auf einer sonst leeren
                      // Zelle (kategorie "sonstiges", keine Uhrzeit, siehe
                      // abschnittFuerAnzeige) gilt wie eine Abwesenheit ganztägig und
                      // muss deshalb - wie absenz oben - über dienstByKey (unabhängig
                      // vom Abschnitt) nachgeschlagen werden, sonst erscheint sie nur
                      // in der Tag-Zeile.
                      const markierterZeile = zeilen.find(zeile => zeile.markierung_id)
                        ?? (dienstByKey.get(`${person.id}|${datum}`) ?? []).find(zeile => zeile.kategorie !== 'dienst' && zeile.markierung_id)
                      const markierung = markierterZeile?.markierung_id ? markierungenById.get(markierterZeile.markierung_id) : undefined
                      const markierungFarben = markierung ? markierungFarbKlassen(markierung.farbe) : null
                      const markierungHintergrund = markierungFarben ? (abschnitt === 'tag' ? markierungFarben.bg : markierungFarben.bgNacht) : null
                      const titel = [
                        wuenscheHeute.length > 0 ? `Wunsch: ${wuenscheHeute.map(eintrag => `${WUNSCH_LABEL[eintrag.wunsch]}${eintrag.vonZeit && eintrag.bisZeit ? ` ${eintrag.vonZeit.slice(0, 5)}–${eintrag.bisZeit.slice(0, 5)}` : ''}${eintrag.notiz ? ` – ${eintrag.notiz}` : ''}`).join(', ')}` : null,
                        uebertragWarnung ? 'Nachtdienst am letzten Tag des Vormonats - heute laut Ruhezeit (24 Std.) kein Tagdienst möglich' : null,
                        markierung ? `Markierung: ${markierung.name}` : null,
                      ].filter(Boolean).join(' · ') || undefined
                      return <td key={person.id}
                        onClick={istTouchGeraet ? () => oeffneZelle(person.id, person.name, datum) : undefined}
                        onMouseDown={!istTouchGeraet ? () => dragStarten(person.id, datum) : undefined}
                        onMouseEnter={!istTouchGeraet ? () => dragBewegen(person.id, datum) : undefined}
                        title={titel}
                        className={`min-w-20 cursor-pointer select-none border-b border-gray-100 px-1 py-1.5 text-center hover:bg-blue-50 ${spaltenBorderKlasse.get(person.id) ?? ''} ${ausgewaehlt ? 'bg-blue-100 ring-2 ring-inset ring-blue-600' : ruheVerletzung || uebertragWarnung ? 'bg-red-50' : absenzHintergrund ?? markierungHintergrund ?? ''}`}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          {/* uebertragWarnung-Icon bewusst in derselben Zeile wie das Kürzel (nicht als eigener Flex-Block darunter) - sonst wird nur die Tagzeile des 1. eines Monats durch die zusätzliche Zeile höher als alle anderen Tage. */}
                          <div className="flex items-center gap-0.5">
                            {zeilen.map(zeile => <span key={zeile.zeile} className={`rounded px-1 font-medium ${ruheVerletzung || uebertragWarnung ? 'text-red-700' : absenzFarben ? absenzFarben.text : markierungFarben ? markierungFarben.text : 'text-gray-800'}`}>{parseDienstCode(zeile.rohtext).code}</span>)}
                            {uebertragWarnung ? <AlertTriangle className="h-3 w-3 shrink-0 text-red-600" /> : null}
                          </div>
                          {vorschlag ? <span className="rounded border border-dashed border-blue-400 px-1 font-medium text-blue-700">{vorschlag.code}</span> : null}
                          {wuenscheHeute.length > 0 ? <span className="text-amber-500">●</span> : null}
                        </div>
                      </td>
                    })}
                  </tr>
                })
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2 + mitarbeiter.length} className="border-t-2 border-gray-400 bg-gray-100 px-3 py-1.5 text-left text-[0.65rem] font-bold uppercase tracking-wide text-gray-500">Auswertung ({monatLangLabel(monat)})</td>
              </tr>
              {[
                { label: 'Stunden', wert: (personId: string) => formatStunden(auswertungByPersonId.get(personId)?.stunden ?? 0) },
                { label: 'Grunddienste Tag', wert: (personId: string) => auswertungByPersonId.get(personId)?.arten.grundTag ?? 0 },
                { label: 'Grunddienste Nacht', wert: (personId: string) => auswertungByPersonId.get(personId)?.arten.grundNacht ?? 0 },
                { label: 'Zusatzdienste Tag', wert: (personId: string) => auswertungByPersonId.get(personId)?.arten.zusatzTag ?? 0 },
                { label: 'Zusatzdienste Nacht', wert: (personId: string) => auswertungByPersonId.get(personId)?.arten.zusatzNacht ?? 0 },
                { label: 'Überstunden', wert: (personId: string) => auswertungByPersonId.get(personId)?.arten.ueberstunden ?? 0 },
                {
                  label: 'Gesamt Dienste', wert: (personId: string) => {
                    const arten = auswertungByPersonId.get(personId)?.arten
                    return arten ? arten.grundTag + arten.grundNacht + arten.zusatzTag + arten.zusatzNacht : 0
                  },
                },
              ].map(({ label, wert }) => <tr key={label} className="bg-gray-50">
                <td colSpan={2} className="sticky left-0 z-10 w-[11.75rem] min-w-[11.75rem] max-w-[11.75rem] whitespace-nowrap border-r border-gray-200 bg-gray-50 px-3 py-1 text-left text-gray-600">{label}</td>
                {mitarbeiter.map(person => <td key={person.id} className={`whitespace-nowrap px-1.5 py-1 text-center tabular-nums text-gray-700 ${spaltenBorderKlasse.get(person.id) ?? ''}`}>{wert(person.id)}</td>)}
              </tr>)}
            </tfoot>
          </table>
        </div>
      </>}

    {bearbeitung ? <Modal title={`${bearbeitung.name} – ${bearbeitung.datum.split('-').reverse().join('.')}`} close={() => setBearbeitung(null)}>
      <ZeileEditor titel="Zeile 1" form={zeile1} setForm={setZeile1} entfernen={zeile1.code ? () => setZeile1(LEERE_ZEILE) : undefined} markierungen={markierungen} />
      {zeile2 ? <ZeileEditor titel="Zeile 2" form={zeile2} setForm={setZeile2} entfernen={() => setZeile2(null)} markierungen={markierungen} />
        : <button type="button" onClick={() => setZeile2(LEERE_ZEILE)} className="text-xs text-blue-700 hover:underline">+ Zweiter Eintrag</button>}
      {modalError ? <ErrorMessage text={modalError} /> : null}
      <Actions saving={speichern} close={() => setBearbeitung(null)} save={speichereZelle} />
    </Modal> : null}

    {zeitraumModal ? <Modal title="Zeitraum eintragen" close={() => setZeitraumModal(false)}>
      <label className="block text-xs font-medium text-gray-600">Person
        <select className={inputClass} value={zeitraumForm.beamterId} onChange={event => setZeitraumForm(form => ({ ...form, beamterId: event.target.value }))}>
          <option value="">– wählen –</option>
          {mitarbeiter.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-gray-600">Von
          <input type="date" className={inputClass} min={tage[0]} max={tage[tage.length - 1]} value={zeitraumForm.von} onChange={event => setZeitraumForm(form => ({ ...form, von: event.target.value }))} />
        </label>
        <label className="block text-xs font-medium text-gray-600">Bis
          <input type="date" className={inputClass} min={tage[0]} max={tage[tage.length - 1]} value={zeitraumForm.bis} onChange={event => setZeitraumForm(form => ({ ...form, bis: event.target.value }))} />
        </label>
      </div>
      <p className="mt-2 text-xs font-medium text-gray-600">Kürzel</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {ABWESENHEIT_KUERZEL.map(({ label, code }) => <button key={code} type="button" onClick={() => setZeitraumForm(form => ({ ...form, code }))} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${zeitraumForm.code === code ? 'border-amber-700 bg-amber-700 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{label}</button>)}
      </div>
      {zeitraumError ? <ErrorMessage text={zeitraumError} /> : null}
      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" disabled={mehrfachSpeichern} onClick={() => void zeitraumLoeschen()} className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50">Im Zeitraum löschen</button>
        <Actions saving={mehrfachSpeichern} close={() => setZeitraumModal(false)} save={zeitraumUebernehmen} />
      </div>
    </Modal> : null}
  </div>
}
