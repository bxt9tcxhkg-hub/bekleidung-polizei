import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { dienstplanSupabase, type DienstplanKategorieDb } from '../lib/dienstplanSupabase'
import { inputClass } from '../components/ZentraleEntryEditor'
import { thisMonthLocal } from '../lib/ueberstunden'
import { NACHTDIENST_BIS, NACHTDIENST_VON } from '../lib/dienstplanAuswertung'
import { GRUNDBESETZUNG_CODES, GRUNDBESETZUNG_TITEL, grundbesetzungCode, kuerzelKlartext, parseDienstCode, type GrundbesetzungCode } from '../lib/dienstplanImport'

// Dienststellenkalender: zeigt für den gewählten (veröffentlichten) Monat
// tageweise die GRUNDBESETZUNG (Z/ID/JD - siehe GRUNDBESETZUNG_CODES) im
// Vordergrund, darunter alle weiteren Diensteinträge - aus den importierten
// Dienstplan-Rohdaten (siehe SystemeinstellungenDienstplanImport.tsx). Für
// jede/n aktive/n Bediensteten sichtbar (siehe Migration
// 20260925051510_dienstplan_dienststellenweit_lesen.sql), keine eigene
// Bereichsberechtigung nötig - wer Dienst hat, ist Basisinformation für die
// ganze Dienststelle. Rein lesend; Bearbeitung passiert ausschließlich über
// den monatlichen Import.

interface DienstZeile { beamter_id: string; datum: string; zeile: 1 | 2; rohtext: string; von_zeit: string | null; bis_zeit: string | null; kategorie: DienstplanKategorieDb }
interface MitarbeiterOption { id: string; name: string; dienstnummer: string | null }

const KATEGORIE_BADGE: Partial<Record<DienstplanKategorieDb, string>> = {
  krank: 'bg-red-100 text-red-700',
  urlaub: 'bg-amber-100 text-amber-800',
  sonderurlaub: 'bg-blue-100 text-blue-700',
  karenz: 'bg-purple-100 text-purple-700',
}
const KATEGORIE_LABEL: Partial<Record<DienstplanKategorieDb, string>> = {
  krank: 'krank', urlaub: 'Urlaub', sonderurlaub: 'Sonderurlaub', karenz: 'Karenz',
}

const WOCHENTAG_LABEL: Record<number, string> = { 0: 'So', 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa' }

function formatDatum(iso: string): string {
  const [jahr, monat, tag] = iso.split('-').map(Number)
  const datum = new Date(jahr, monat - 1, tag)
  return `${WOCHENTAG_LABEL[datum.getDay()]} ${String(tag).padStart(2, '0')}.${String(monat).padStart(2, '0')}.${jahr}`
}

interface GrundbesetzungEintrag { beamterId: string; name: string; dienstnummer: string | null; vonZeit: string | null; bisZeit: string | null }
interface WeitererEintrag { beamterId: string; name: string; dienstnummer: string | null; texte: string[]; vonZeit: string | null; bisZeit: string | null; kategorie: DienstplanKategorieDb }
interface TagesUebersicht { datum: string; grundbesetzung: Record<GrundbesetzungCode, GrundbesetzungEintrag[]>; weitere: WeitererEintrag[] }

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

  const mitarbeiterById = useMemo(() => new Map(mitarbeiter.map(person => [person.id, person])), [mitarbeiter])

  // Jede Rohzeile einzeln (nicht mehr je Person zusammengefasst) einer
  // Grundbesetzungs-Kachel (Z/ID/JD) oder sonst den "weiteren Diensten"
  // zuordnen - dieselbe Person mit zwei Rohzeilen an einem Tag (zeile 1/2,
  // Bedeutung des Zusammenspiels noch nicht abschließend geklärt, siehe
  // lib/dienstplanImport.ts) kann dadurch theoretisch in mehreren Kacheln
  // auftauchen; in der Praxis trägt an einem Tag pro Code eine andere Person
  // die jeweilige Rohzeile.
  const tage = useMemo(() => {
    const proTag = new Map<string, { grund: Record<GrundbesetzungCode, GrundbesetzungEintrag[]>; weitereMap: Map<string, WeitererEintrag> }>()
    for (const zeile of dienste) {
      const person = mitarbeiterById.get(zeile.beamter_id)
      if (!person) continue
      let tagesEintrag = proTag.get(zeile.datum)
      if (!tagesEintrag) { tagesEintrag = { grund: { Z: [], ID: [], JD: [] }, weitereMap: new Map() }; proTag.set(zeile.datum, tagesEintrag) }

      const { code } = parseDienstCode(zeile.rohtext)
      const grund = zeile.kategorie === 'dienst' ? grundbesetzungCode(code) : null
      if (grund) {
        tagesEintrag.grund[grund].push({ beamterId: zeile.beamter_id, name: person.name, dienstnummer: person.dienstnummer, vonZeit: zeile.von_zeit, bisZeit: zeile.bis_zeit })
        continue
      }

      let weiter = tagesEintrag.weitereMap.get(zeile.beamter_id)
      if (!weiter) {
        weiter = { beamterId: zeile.beamter_id, name: person.name, dienstnummer: person.dienstnummer, texte: [], vonZeit: null, bisZeit: null, kategorie: zeile.kategorie }
        tagesEintrag.weitereMap.set(zeile.beamter_id, weiter)
      }
      weiter.texte.push(zeile.rohtext)
      if (!weiter.vonZeit && zeile.von_zeit) { weiter.vonZeit = zeile.von_zeit; weiter.bisZeit = zeile.bis_zeit }
      if (zeile.kategorie !== 'dienst') weiter.kategorie = zeile.kategorie
    }
    return Array.from(proTag.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([datum, { grund, weitereMap }]): TagesUebersicht => ({
        datum,
        grundbesetzung: grund,
        weitere: Array.from(weitereMap.values()).sort((a, b) => (a.vonZeit ?? '99:99').localeCompare(b.vonZeit ?? '99:99') || a.name.localeCompare(b.name, 'de-AT')),
      }))
  }, [dienste, mitarbeiterById])

  return <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-gray-900">Dienststellenkalender</h1><p className="mt-1 text-sm text-gray-500">Grundbesetzung (Zentrale/Innendienst/Journaldienst) und weitere Dienste je Tag - aus dem importierten Dienstplan.</p></div>
      <input type="month" value={monat} onChange={event => setMonat(event.target.value)} className={`${inputClass} mt-0 w-auto`} />
    </div>

    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

    {loading ? <div className="mt-8 flex justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-800" /></div>
      : monatVeroeffentlicht === false ? <div className="mt-8 rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"><CalendarDays className="mx-auto mb-2 h-8 w-8 text-gray-300" /><p className="text-sm text-gray-500">Für diesen Monat wurde noch kein Dienstplan veröffentlicht.</p></div>
      : <div className="mt-6 space-y-3">
        {tage.map(tag => <div key={tag.datum} className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-sm font-bold text-gray-900">{formatDatum(tag.datum)}</p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {GRUNDBESETZUNG_CODES.map(code => {
              const besetzung = tag.grundbesetzung[code]
              return <div key={code} className={`rounded-lg border p-2.5 ${besetzung.length === 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{GRUNDBESETZUNG_TITEL[code]} ({code})</p>
                {besetzung.length === 0 ? <p className="mt-1 flex items-center gap-1 text-sm font-medium text-red-700"><AlertTriangle className="h-3.5 w-3.5 flex-none" /> nicht besetzt</p> : <div className="mt-1 space-y-0.5">
                  {besetzung.map(eintrag => <p key={eintrag.beamterId} className="text-sm font-medium text-gray-800">
                    {eintrag.name}
                    {eintrag.vonZeit && eintrag.bisZeit ? <span className="ml-1.5 font-mono text-xs font-normal text-gray-500">{eintrag.vonZeit}–{eintrag.bisZeit}</span> : <span className="ml-1.5 font-mono text-xs font-normal text-gray-500">{NACHTDIENST_VON}–{NACHTDIENST_BIS}</span>}
                  </p>)}
                </div>}
              </div>
            })}
          </div>

          {tag.weitere.length > 0 ? <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
            {tag.weitere.map(eintrag => {
              // Ein Dienst ohne Uhrzeit ist laut Kommandant ein Nachtdienst
              // (regulär 19:00-08:00 Uhr, siehe lib/dienstplanAuswertung.ts).
              const nachtdienst = eintrag.kategorie === 'dienst' && !eintrag.vonZeit
              const zeitAnzeige = eintrag.vonZeit && eintrag.bisZeit ? `${eintrag.vonZeit}–${eintrag.bisZeit}` : nachtdienst ? `${NACHTDIENST_VON}–${NACHTDIENST_BIS}` : null
              const texteKlartext = eintrag.texte.map(text => kuerzelKlartext(parseDienstCode(text).code)).join(' · ')
              return <div key={eintrag.beamterId} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-40 flex-none font-medium text-gray-800">{eintrag.name}{eintrag.dienstnummer ? <span className="text-xs text-gray-400"> (DNr. {eintrag.dienstnummer})</span> : null}</span>
                {zeitAnzeige ? <span className="flex-none font-mono text-xs text-gray-500">{zeitAnzeige}</span> : null}
                {KATEGORIE_LABEL[eintrag.kategorie] ? <span className={`flex-none rounded-full px-2 py-0.5 text-xs font-semibold ${KATEGORIE_BADGE[eintrag.kategorie]}`}>{KATEGORIE_LABEL[eintrag.kategorie]}</span> : null}
                <span className="text-gray-600">{texteKlartext}</span>
              </div>
            })}
          </div> : null}
        </div>)}
        {tage.length === 0 ? <p className="text-sm text-gray-500">Für diesen Monat sind keine Diensteinträge vorhanden.</p> : null}
      </div>}
  </div>
}
