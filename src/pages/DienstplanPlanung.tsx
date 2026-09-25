import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, Sparkles, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { dienstplanSupabase, type DienstplanKategorieDb, type DienstplanWunschTyp } from '../lib/dienstplanSupabase'
import { Modal, Actions, ErrorMessage, inputClass } from '../components/ZentraleEntryEditor'
import { thisMonthLocal } from '../lib/ueberstunden'
import { NACHTDIENST_BIS, NACHTDIENST_VON } from '../lib/dienstplanAuswertung'
import { kategorisiereRohtext, parseDienstCode } from '../lib/dienstplanImport'
import { fehlendeGrundbesetzung, tagOderNacht } from '../lib/dienstplanBesetzung'
import { ruhezeitVerletzungen } from '../lib/dienstplanRegelpruefung'
import { generiereGrundbesetzungsVorschlag, type VorschlagEintrag } from '../lib/dienstplanVorschlag'
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

interface DienstZeile { beamter_id: string; datum: string; zeile: 1 | 2; rohtext: string; von_zeit: string | null; bis_zeit: string | null; kategorie: DienstplanKategorieDb }
interface MitarbeiterOption { id: string; name: string; dienstnummer: string | null }
interface WunschEintrag { wunsch: DienstplanWunschTyp; notiz: string | null }

const WOCHENTAG_LABEL: Record<number, string> = { 0: 'So', 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa' }
const ABSCHNITT_LABEL = { tag: 'Tag', nacht: 'Nacht' } as const

function tageImMonat(monatIso: string): string[] {
  const [jahr, monat] = monatIso.split('-').map(Number)
  const letzterTag = new Date(jahr, monat, 0).getDate()
  return Array.from({ length: letzterTag }, (_, index) => `${monatIso}-${String(index + 1).padStart(2, '0')}`)
}

/** Ob ein Dienstwunsch den angegebenen Zeitabschnitt betrifft - Urlaub blockiert ganztägig, siehe lib/dienstplanWunsch.ts. */
function wunschBetrifftAbschnitt(wunsch: DienstplanWunschTyp, abschnitt: 'tag' | 'nacht'): boolean {
  if (wunsch === 'urlaub') return true
  return wunsch === (abschnitt === 'tag' ? 'frei_tag' : 'frei_nacht')
}

const QUICK_KUERZEL = ['Z', 'ID', 'JD', 'VD', 'TD', 'ET', 'SVE', 'RA', 'BHF', 'KFZ', 'MOT', 'PV', 'SCH', 'ZIV']
const ABWESENHEIT_KUERZEL: { label: string; code: string }[] = [
  { label: 'Urlaub', code: 'U' },
  { label: 'Krank', code: 'Krank' },
  { label: 'Sonderurlaub', code: 'SoUrl' },
  { label: 'Karenz', code: 'Karenz' },
]

interface ZeileForm { code: string; vonZeit: string; bisZeit: string }
const LEERE_ZEILE: ZeileForm = { code: '', vonZeit: '', bisZeit: '' }

function ZeileEditor({ titel, form, setForm, entfernen }: { titel: string; form: ZeileForm; setForm: (form: ZeileForm) => void; entfernen?: () => void }) {
  const kategorie = form.code ? kategorisiereRohtext(form.code) : null
  const zeitRelevant = kategorie === null || kategorie === 'dienst'
  return <div className="rounded-lg border border-gray-200 p-3">
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titel}</p>
      {entfernen ? <button type="button" onClick={entfernen} className="text-xs text-red-700 hover:underline">löschen</button> : null}
    </div>
    <div className="mt-2 flex flex-wrap gap-1.5">
      {QUICK_KUERZEL.map(code => <button key={code} type="button" onClick={() => setForm({ ...form, code })} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${form.code.toUpperCase() === code ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{code}</button>)}
      {ABWESENHEIT_KUERZEL.map(({ label, code }) => <button key={code} type="button" onClick={() => setForm({ code, vonZeit: '', bisZeit: '' })} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${form.code.toUpperCase() === code.toUpperCase() ? 'border-amber-700 bg-amber-700 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{label}</button>)}
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
  </div>
}

export default function DienstplanPlanung() {
  const [monat, setMonat] = useState(thisMonthLocal())
  const [monatRow, setMonatRow] = useState<{ id: string; status: string } | null>(null)
  const [mindestruhezeitStunden, setMindestruhezeitStunden] = useState(11)
  const [mitarbeiter, setMitarbeiter] = useState<MitarbeiterOption[]>([])
  const [dienste, setDienste] = useState<DienstZeile[]>([])
  const [wuensche, setWuensche] = useState<Map<string, WunschEintrag[]>>(new Map())
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

  const load = useCallback(async () => {
    setLoading(true); setError(''); setVorschlaege(new Map())
    const [regelnResult, mitarbeiterResult, monatResult] = await Promise.all([
      dienstplanSupabase.from('dienstplan_regeln').select('mindestruhezeit_stunden').eq('id', 1).maybeSingle(),
      supabase.from('profiles').select('id,name,dienstnummer,roles').eq('active', true).eq('organisation', ET_ROSTER_ORGANISATION).order('name'),
      dienstplanSupabase.from('dienstplan_monate').select('id,status').eq('monat', `${monat}-01`).maybeSingle(),
    ])
    if (regelnResult.error || mitarbeiterResult.error || monatResult.error) { setError('Grunddaten konnten nicht geladen werden.'); setLoading(false); return }
    if (regelnResult.data) setMindestruhezeitStunden(regelnResult.data.mindestruhezeit_stunden)
    // Admin-Konten sind laut Kommandant nie Teil der einteilbaren Beamten;
    // Kommando/Dienstführung sollen als eigene Blöcke zusammenstehen (siehe
    // lib/dienstplanRoster.ts).
    const einteilbar = (mitarbeiterResult.data ?? []).filter(person => !istAdminProfil(person.roles))
    setMitarbeiter(sortiereNachDienstplanGruppe(einteilbar))
    setMonatRow(monatResult.data)

    if (!monatResult.data) { setDienste([]); setWuensche(new Map()); setLoading(false); return }
    const [dienstResult, wunschResult] = await Promise.all([
      dienstplanSupabase.from('dienstplan_dienste').select('beamter_id,datum,zeile,rohtext,von_zeit,bis_zeit,kategorie').eq('dienstplan_monat_id', monatResult.data.id).order('datum').order('zeile'),
      dienstplanSupabase.from('dienstplan_wuensche').select('beamter_id,datum,wunsch,notiz').eq('monat', `${monat}-01`),
    ])
    if (dienstResult.error || wunschResult.error) { setError('Grunddaten konnten nicht geladen werden.'); setLoading(false); return }
    setDienste(dienstResult.data ?? [])
    const wunschMap = new Map<string, WunschEintrag[]>()
    for (const row of wunschResult.data ?? []) {
      const schluessel = `${row.beamter_id}|${row.datum}`
      const liste = wunschMap.get(schluessel) ?? []
      liste.push({ wunsch: row.wunsch, notiz: row.notiz })
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
      const schluessel = `${zeile.beamter_id}|${zeile.datum}|${tagOderNacht(zeile.von_zeit)}`
      const liste = map.get(schluessel) ?? []
      liste.push(zeile)
      map.set(schluessel, liste)
    }
    return map
  }, [dienste])

  // Für die Kopfzeile: Kommando/Dienstführung/Übrige-Blöcke als
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

  const kurznamenMap = useMemo(() => kurznamen(mitarbeiter), [mitarbeiter])

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

  function zeileZuForm(zeile: DienstZeile | undefined): ZeileForm {
    if (!zeile) return LEERE_ZEILE
    return { code: parseDienstCode(zeile.rohtext).code, vonZeit: zeile.von_zeit ?? '', bisZeit: zeile.bis_zeit ?? '' }
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
      if (!form || !form.code.trim()) {
        if (bestandVorher) aufgaben.push(dienstplanSupabase.rpc('dienstplan_dienst_loeschen', { p_monat_id: monatRow.id, p_beamter_id: bearbeitung.beamterId, p_datum: bearbeitung.datum, p_zeile: nummer }))
        neueZeilen.set(nummer, null)
        continue
      }
      const code = form.code.trim()
      const kategorie = kategorisiereRohtext(code)
      const vonZeit = kategorie === 'dienst' ? form.vonZeit : ''
      const bisZeit = kategorie === 'dienst' ? form.bisZeit : ''
      aufgaben.push(dienstplanSupabase.rpc('dienstplan_dienst_setzen', {
        p_monat_id: monatRow.id, p_beamter_id: bearbeitung.beamterId, p_datum: bearbeitung.datum, p_zeile: nummer,
        p_rohtext: code, p_von_zeit: vonZeit, p_bis_zeit: bisZeit, p_kategorie: kategorie,
      }))
      neueZeilen.set(nummer, { beamter_id: bearbeitung.beamterId, datum: bearbeitung.datum, zeile: nummer, rohtext: code, von_zeit: vonZeit || null, bis_zeit: bisZeit || null, kategorie })
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

  // Vorschlag generieren (Phase 4) - reine, lokale Berechnung über
  // lib/dienstplanVorschlag.ts, keine DB-Schreibzugriffe. Ersetzt
  // bestehende Vorschläge komplett (kein Zusammenführen über mehrere
  // Läufe hinweg, um Altdaten nicht unbemerkt stehen zu lassen).
  function vorschlagGenerieren() {
    const eingabeDienste = dienste.map(zeile => ({ beamterId: zeile.beamter_id, datum: zeile.datum, vonZeit: zeile.von_zeit, bisZeit: zeile.bis_zeit, kategorie: zeile.kategorie, code: parseDienstCode(zeile.rohtext).code }))
    const eingabeWuensche = Array.from(wuensche.entries()).flatMap(([schluessel, liste]) => {
      const [beamterId, datum] = schluessel.split('|')
      return liste.map(eintrag => ({ beamterId, datum, wunsch: eintrag.wunsch }))
    })
    // Kommando ist nicht Teil der automatischen Grundbesetzungs-Zuteilung
    // (siehe lib/dienstplanRoster.ts) - kann aber weiterhin manuell über die
    // Zelle im Grid eingeteilt werden.
    const einteilbareMitarbeiter = mitarbeiter.filter(person => istAutomatischEinteilbar(person.dienstnummer))
    const ergebnis = generiereGrundbesetzungsVorschlag({ mitarbeiter: einteilbareMitarbeiter, tage, bestehendeDienste: eingabeDienste, wuensche: eingabeWuensche, mindestruhezeitStunden })
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
      neueZeilen.push({ beamter_id: vorschlag.beamterId, datum: vorschlag.datum, zeile: nummer, rohtext: vorschlag.code, von_zeit: vorschlag.vonZeit, bis_zeit: vorschlag.bisZeit, kategorie: 'dienst' })
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
      <div><h1 className="text-2xl font-bold text-gray-900">Dienstplan-Planung</h1><p className="mt-1 text-sm text-gray-500">Tage × Personen, je Tag eine Tag- und eine Nachtzeile - Zelle anklicken, um den Dienst einzutragen. Rot markiert: fehlende Grundbesetzung (Zeile) bzw. zu kurze Ruhezeit (Zelle).</p></div>
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
            {monatRow.status !== 'veroeffentlicht' ? <button type="button" disabled={veroeffentlichen} onClick={() => void monatVeroeffentlichen()} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> {veroeffentlichen ? 'Wird veröffentlicht…' : 'Veröffentlichen'}</button> : null}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="text-xs">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky left-0 z-20 w-24 border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600">Datum</th>
                <th rowSpan={2} className="sticky left-24 z-20 w-14 border-b border-r border-gray-200 bg-gray-50 px-2 py-2 text-left font-semibold text-gray-600"></th>
                {personGruppenSpans.map(({ gruppe, span }, index) => <th key={index} colSpan={span} className="border-b border-r border-gray-200 bg-gray-100 px-2 py-1 text-center text-[0.65rem] font-bold uppercase tracking-wide text-gray-500">{DIENSTPLAN_GRUPPE_LABEL[gruppe]}</th>)}
              </tr>
              <tr>
                {mitarbeiter.map(person => <th key={person.id} title={person.name} className="min-w-16 border-b border-gray-200 px-1 py-2 text-center font-semibold text-gray-600">{kurznamenMap.get(person.id) ?? person.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {tage.map(datum => {
                const [, , tagText] = datum.split('-')
                const wochentag = new Date(Number(datum.slice(0, 4)), Number(datum.slice(5, 7)) - 1, Number(tagText)).getDay()
                return (['tag', 'nacht'] as const).map(abschnitt => {
                  const fehlend = (fehlendeGrund.get(datum) ?? []).filter(text => text.endsWith(abschnitt === 'tag' ? '(Tag)' : '(Nacht)'))
                  return <tr key={`${datum}|${abschnitt}`} className={`odd:bg-white even:bg-gray-50/50 ${abschnitt === 'tag' ? 'border-t border-gray-200' : ''}`}>
                    {abschnitt === 'tag' ? (
                      <td rowSpan={2} className="sticky left-0 z-10 w-24 border-r border-gray-200 bg-inherit px-3 py-1.5 align-top">
                        <span className="font-medium text-gray-800">{WOCHENTAG_LABEL[wochentag]} {tagText}.</span>
                      </td>
                    ) : null}
                    <td title={fehlend.length > 0 ? fehlend.join(', ') : undefined} className={`sticky left-24 z-10 w-14 border-r border-gray-200 px-2 py-1.5 ${fehlend.length > 0 ? 'bg-red-50' : 'bg-inherit'}`}>
                      <span className={`text-[0.65rem] uppercase tracking-wide ${fehlend.length > 0 ? 'text-red-600' : abschnitt === 'tag' ? 'text-gray-400' : 'text-gray-500'}`}>{ABSCHNITT_LABEL[abschnitt]}</span>
                      {fehlend.length > 0 ? <AlertTriangle className="ml-1 inline h-3 w-3 text-red-600" /> : null}
                    </td>
                    {mitarbeiter.map(person => {
                      const zeilen = (dienstByKeyAbschnitt.get(`${person.id}|${datum}|${abschnitt}`) ?? []).slice().sort((a, b) => a.zeile - b.zeile)
                      const wuenscheHeute = (wuensche.get(`${person.id}|${datum}`) ?? []).filter(eintrag => wunschBetrifftAbschnitt(eintrag.wunsch, abschnitt))
                      const ruheVerletzung = ruheVerletzt.has(`${person.id}|${datum}`)
                      const vorschlag = vorschlaege.get(`${person.id}|${datum}|${abschnitt}`)
                      return <td key={person.id}
                        onClick={() => oeffneZelle(person.id, person.name, datum)}
                        title={wuenscheHeute.length > 0 ? `Wunsch: ${wuenscheHeute.map(eintrag => `${WUNSCH_LABEL[eintrag.wunsch]}${eintrag.notiz ? ` – ${eintrag.notiz}` : ''}`).join(', ')}` : undefined}
                        className={`min-w-16 cursor-pointer border-b border-gray-100 px-1 py-1.5 text-center hover:bg-blue-50 ${ruheVerletzung ? 'bg-red-50' : ''}`}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          {zeilen.map(zeile => <span key={zeile.zeile} className={`rounded px-1 font-medium ${ruheVerletzung ? 'text-red-700' : 'text-gray-800'}`}>{parseDienstCode(zeile.rohtext).code}</span>)}
                          {vorschlag ? <span className="rounded border border-dashed border-blue-400 px-1 font-medium text-blue-700">{vorschlag.code}</span> : null}
                          {wuenscheHeute.length > 0 ? <span className="text-amber-500">●</span> : null}
                        </div>
                      </td>
                    })}
                  </tr>
                })
              })}
            </tbody>
          </table>
        </div>
      </>}

    {bearbeitung ? <Modal title={`${bearbeitung.name} – ${bearbeitung.datum.split('-').reverse().join('.')}`} close={() => setBearbeitung(null)}>
      <ZeileEditor titel="Zeile 1" form={zeile1} setForm={setZeile1} entfernen={zeile1.code ? () => setZeile1(LEERE_ZEILE) : undefined} />
      {zeile2 ? <ZeileEditor titel="Zeile 2" form={zeile2} setForm={setZeile2} entfernen={() => setZeile2(null)} />
        : <button type="button" onClick={() => setZeile2(LEERE_ZEILE)} className="text-xs text-blue-700 hover:underline">+ Zweiter Eintrag</button>}
      {modalError ? <ErrorMessage text={modalError} /> : null}
      <Actions saving={speichern} close={() => setBearbeitung(null)} save={speichereZelle} />
    </Modal> : null}
  </div>
}
