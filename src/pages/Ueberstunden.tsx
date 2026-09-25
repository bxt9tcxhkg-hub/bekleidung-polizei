import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileOutput, Pencil, Plus, RotateCcw, Send, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { fetchAllPages, supabase } from '../lib/supabase'
import PortalChrome from '../components/PortalChrome'
import { Actions, Area, ErrorMessage, Field, Modal, inputClass } from '../components/ZentraleEntryEditor'
import { generateUeberstundenPdf, generateUeberstundenSammelPdf } from '../lib/ueberstundenPdf'
import { officerPrintName } from '../lib/printDocs'
import { EMPTY_MELDUNG_FORM, KATEGORIEN, MAX_MELDUNG_DAUER_TAGE, POOL_STATUS, STATUS_COLOR, STATUS_LABEL, VERGUETUNG_LABEL, bereitsVerwendeteFeiertagsstunden, berechneAufschluesselung, formToPayload, formatStunden, formatZeitraum, istUebersprungeneSommerzeitStunde, istViertelstundenRaster, meldungToForm, meldungZeitraum, monatsAnteileMap, monatsUebersicht, thisMonthLocal, totalStunden, vollstaendigeMonatsUebersicht, type MeldungFormState, type MonatsAnteilRow, type UeberstundenKategorieKey } from '../lib/ueberstunden'
import type { UeberstundenMeldung, UeberstundenVerguetung } from '../lib/types'

const OFFEN_STATUS: UeberstundenMeldung['status'][] = ['entwurf', 'rueckfrage']

// Überstundenmeldung: self-service - jede/r Bedienstete erfasst die eigenen
// Überstunden über einen Zeitraum (von Datum/Uhrzeit bis Datum/Uhrzeit); die
// Aufschlüsselung nach Lohnarten (siehe lib/ueberstunden.ts) wird daraus
// automatisch berechnet, nicht manuell eingegeben. Verwaltet als Entwurf,
// dann eingereicht; der Genehmiger entscheidet (Abschnitt "Zu entscheiden",
// nur für Genehmiger sichtbar). Kein eigener Bereichs-Layout/Sidebar nötig,
// dafür ist die Seite zu klein - eine einzelne Seite wie z. B. Hilfe.tsx.

function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center"><CheckCircle2 className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{text}</p></div> }

function StundenBreakdown({ item }: { item: UeberstundenMeldung }) {
  const parts = KATEGORIEN.filter(kat => item[kat.key] > 0).map(kat => `${kat.code} ${formatStunden(item[kat.key])} Std.`)
  if (parts.length === 0) return null
  return <p className="text-xs text-gray-500 mt-1">{parts.join(' · ')}</p>
}

// Tabellarische Aufschlüsselung nach Lohnarten - einheitlich formatierte
// Zeilen (Label + Hinweis/Satz/Code + rechtsbündiger Wert) statt einzelner
// Kacheln, die je nach Kategorie unterschiedlich viel Text enthielten.
function AufschluesselungTabelle({ werte }: { werte: Record<UeberstundenKategorieKey, number> | null }) {
  const gesamt = werte ? KATEGORIEN.reduce((sum, kat) => sum + werte[kat.key], 0) : null
  return <div className="rounded-lg border border-gray-200 overflow-hidden">
    <table className="w-full text-sm">
      <tbody>
        {KATEGORIEN.map(kat => <tr key={kat.key} className="border-b border-gray-100 last:border-0">
          <td className="px-3 py-2 align-top"><p className="font-medium text-gray-800">{kat.label}</p><p className="text-xs text-gray-400 mt-0.5">{kat.hinweis} · {kat.satz} · {kat.code}</p></td>
          <td className="px-3 py-2 text-right align-top font-semibold text-gray-900 tabular-nums whitespace-nowrap">{werte ? formatStunden(werte[kat.key]) : '–'} Std.</td>
        </tr>)}
        <tr className="bg-gray-50"><td className="px-3 py-2 font-bold text-gray-900">Gesamt</td><td className="px-3 py-2 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">{gesamt !== null ? formatStunden(gesamt) : '–'} Std.</td></tr>
      </tbody>
    </table>
  </div>
}

export default function Ueberstunden() {
  const { profile, isGenehmiger } = useAuth()
  const [eigene, setEigene] = useState<UeberstundenMeldung[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<UeberstundenMeldung | null>(null)
  const [form, setForm] = useState<MeldungFormState>(EMPTY_MELDUNG_FORM)
  const [monat, setMonat] = useState(thisMonthLocal())
  const [uebersichtMeldungen, setUebersichtMeldungen] = useState<UeberstundenMeldung[]>([])
  const [uebersichtAnteile, setUebersichtAnteile] = useState<Map<string, Record<UeberstundenKategorieKey, number>>>(new Map())
  // Feste, vom Kommandanten vorgegebene Genehmiger-Kette (Rang 1 = primär,
  // Rang 2/3 = Stellvertreter, falls der/die Vorherige nicht da ist) - beim
  // Anlegen einer Meldung wählt der Ersteller daraus, wer sie vorgelegt
  // bekommen soll (rein informativ, keine Entscheidung). RPC statt
  // Client-Abfrage auf profiles, da ein einfacher Bediensteter die Rollen/
  // den Rang anderer Profile laut RLS gar nicht einsehen darf (siehe
  // Migration 20260919040000_genehmiger_kette.sql).
  const [genehmigerKette, setGenehmigerKette] = useState<{ id: string; name: string; rang: number }[]>([])
  useEffect(() => { void supabase.rpc('genehmiger_kette').then(({ data }) => setGenehmigerKette(data ?? [])) }, [])
  const kettenName = useCallback((id: string | null) => genehmigerKette.find(row => row.id === id)?.name ?? null, [genehmigerKette])

  // Alle aktiven Bediensteten (für die Sammelansicht: die soll wie die
  // bisher händisch geführte Excel-Liste des Kommandanten jeden auflisten,
  // auch ohne Meldung im gewählten Monat - siehe vollstaendigeMonatsUebersicht.
  const [alleBediensteten, setAlleBediensteten] = useState<{ id: string; name: string; dienstnummer: string | null }[]>([])
  useEffect(() => {
    if (!isGenehmiger) { setAlleBediensteten([]); return }
    void supabase.from('profiles').select('id,name,dienstnummer').eq('active', true).order('name').then(({ data }) => setAlleBediensteten(data ?? []))
  }, [isGenehmiger])

  // "Meine Meldungen" - explizit nach beamter_id gefiltert (nicht nur
  // clientseitig aus einer allgemeinen Liste herausgefiltert): die RLS-
  // Policy zeigt einem Genehmiger nämlich ALLE Meldungen aller Beamten, eine
  // unfilterte Abfrage würde bei wachsender Tabelle also schon von fremden
  // Zeilen gedeckelt, bevor überhaupt nach den eigenen gefiltert wird - eine
  // eigene ältere Meldung könnte dadurch für einen Genehmiger unsichtbar und
  // unbearbeitbar werden. Zusätzlich mit fetchAllPages, falls ein Beamter
  // selbst mehr Meldungen hat als eine einzelne Seite fasst.
  const profileId = profile?.id
  const load = useCallback(async () => {
    if (!profileId) return
    setLoading(true)
    const result = await fetchAllPages<UeberstundenMeldung>((from, to) => supabase.from('ueberstunden_meldungen')
      .select('*, beamter:profiles!ueberstunden_meldungen_beamter_id_fkey(id,name,dienstnummer), genehmiger:profiles!ueberstunden_meldungen_genehmiger_id_fkey(id,name,dienstnummer,dienstgrad)')
      .eq('beamter_id', profileId)
      .order('von_datum', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(from, to) as unknown as PromiseLike<{ data: UeberstundenMeldung[] | null; error: { message: string } | null }>)
    if (result.error) setError('Die Überstundenmeldungen konnten nicht geladen werden.')
    else setError('')
    setEigene(result.data)
    setLoading(false)
  }, [profileId])
  useEffect(() => { void load() }, [load])

  // Eigene, gezielt auf den gewählten Monat gefilterte Abfrage (alle
  // Beamten, nicht nur der aktuelle) für die Genehmiger-Monatsübersicht.
  const loadUebersicht = useCallback(async () => {
    if (!isGenehmiger) { setUebersichtMeldungen([]); setUebersichtAnteile(new Map()); return }
    const [jahr, monatNr] = monat.split('-').map(Number)
    if (!jahr || !monatNr) return
    const vonDatum = `${monat}-01`
    const bisDatum = monatNr === 12 ? `${jahr + 1}-01-01` : `${jahr}-${String(monatNr + 1).padStart(2, '0')}-01`
    // Meldungen, die den Monat BERÜHREN, nicht nur solche, deren von_datum
    // darin liegt - eine über Mitternacht in den Folgemonat reichende
    // Meldung (z. B. 30.09. 23:00 - 01.10. 02:00) hat sonst für Oktober keine
    // Zeile, obwohl monatsUebersicht (siehe lib/ueberstunden.ts) ihr
    // anteiliges Kontingent diesem Monat zurechnet.
    //
    // fetchAllPages statt einer einzelnen Abfrage - ein Monat mit mehr
    // genehmigten Meldungen als die von PostgREST gedeckelte Standard-
    // Seitengröße würde sonst eine unvollständige (aber unauffällig falsche)
    // Sammelansicht/Monatsübersicht liefern.
    const [result, anteileResult] = await Promise.all([
      fetchAllPages<UeberstundenMeldung>((from, to) => supabase.from('ueberstunden_meldungen')
        .select('*, beamter:profiles!ueberstunden_meldungen_beamter_id_fkey(id,name,dienstnummer)')
        .eq('status', 'genehmigt').lt('von_datum', bisDatum).gte('bis_datum', vonDatum)
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: UeberstundenMeldung[] | null; error: { message: string } | null }>),
      // Exakte, serverseitig je Kalendertag berechnete Aufteilung auf den
      // gewählten Monat (RPC ueberstunden_monatsanteile, Migration Runde 16) -
      // eine rein client-seitige Rekonstruktion aus den gespeicherten
      // Gesamtsummen kann die 100%/200%-Sonn-/Feiertags-Schwelle nicht exakt
      // zurückrechnen, sobald an einem betroffenen Tag auch andere Meldungen
      // desselben Beamten zum Topf beitrugen. fetchAllPages wie bei der
      // Meldungen-Abfrage oben - ohne Paginierung würde ein Monat mit mehr
      // genehmigten Meldungen als die von PostgREST gedeckelte Standard-
      // Seitengröße nur einen Teil der Anteile liefern, und monatsUebersicht
      // würde die fehlenden Meldungen (kein Eintrag in der Map) still-
      // schweigend aus der Sammelansicht/dem PDF weglassen (Migration
      // Runde 17 sorgt mit ORDER BY meldung_id für die dafür nötige
      // deterministische Reihenfolge über mehrere Seiten hinweg).
      fetchAllPages<MonatsAnteilRow>((from, to) => supabase.rpc('ueberstunden_monatsanteile', { p_monat_start: vonDatum, p_monat_ende: bisDatum })
        .range(from, to) as unknown as PromiseLike<{ data: MonatsAnteilRow[] | null; error: { message: string } | null }>),
    ])
    if (result.error || anteileResult.error) { setError('Die Monatsübersicht konnte nicht geladen werden.'); return }
    setUebersichtMeldungen(result.data)
    setUebersichtAnteile(monatsAnteileMap(anteileResult.data))
  }, [monat, isGenehmiger])
  useEffect(() => { void loadUebersicht() }, [loadUebersicht])

  // Live-Vorschau der Aufschlüsselung, während im Formular an Von/Bis getippt
  // wird - berücksichtigt dabei die eigenen, bereits im Feiertags-Topf
  // zählenden Meldungen (eingereicht/genehmigt/Rückfrage, siehe
  // POOL_STATUS), damit sie nicht von der serverseitig beim Speichern
  // berechneten Aufteilung abweicht (fremde Meldungen anderer Beamter
  // fließen bewusst nicht ein - die sieht die Vorschau nicht).
  const zeitraum = useMemo(() => meldungZeitraum(form), [form])
  // Obergrenze (siehe MAX_MELDUNG_DAUER_TAGE) auch hier prüfen, nicht erst
  // beim Speichern - sonst würde ein Tippfehler bei der Jahreszahl die
  // tageweise Schleife in berechneAufschluesselung schon bei jedem
  // Tastendruck im Formular durchlaufen und den Browser einfrieren.
  const zeitraumZuLang = zeitraum ? (zeitraum.bis.getTime() - zeitraum.von.getTime()) > MAX_MELDUNG_DAUER_TAGE * 24 * 60 * 60 * 1000 : false
  const vorschau = useMemo(() => {
    if (!zeitraum || zeitraumZuLang) return null
    const andereEigene = eigene
      .filter(item => POOL_STATUS.includes(item.status) && item.id !== editing?.id)
      .map(item => meldungZeitraum(meldungToForm(item)))
      .filter((z): z is { von: Date; bis: Date } => z !== null)
    return berechneAufschluesselung(zeitraum.von, zeitraum.bis, bereitsVerwendeteFeiertagsstunden(andereEigene, zeitraum.von))
  }, [zeitraum, zeitraumZuLang, eigene, editing?.id])
  // Genehmiger-Monatsübersicht: alle genehmigten Meldungen aller Bediensteten
  // im gewählten Monat, je Beamten/-in aufsummiert - Grundlage für die
  // Sammelansicht zur Weiterleitung an die Lohnberechnung.
  const uebersicht = useMemo(() => monatsUebersicht(uebersichtMeldungen, uebersichtAnteile), [uebersichtMeldungen, uebersichtAnteile])

  function openNew() {
    setEditing(null)
    // Standardauswahl: der ranghöchste Genehmiger der Kette, der nicht der
    // Ersteller selbst ist (ein Kommandant meldet z. B. nicht sich selbst).
    const vorschlag = genehmigerKette.find(row => row.id !== profile?.id)?.id ?? null
    setForm({ ...EMPTY_MELDUNG_FORM, genehmigerWahlId: vorschlag })
    setShowForm(true); setError('')
  }
  function openEdit(item: UeberstundenMeldung) { setEditing(item); setForm(meldungToForm(item)); setShowForm(true); setError('') }

  async function saveDraft() {
    if (!profile?.id) return
    if (!form.grund.trim()) { setError('Bitte den Grund der Überstunde(n) angeben.'); return }
    if (!zeitraum) { setError('Bitte einen gültigen Zeitraum angeben (Von/Bis vollständig ausfüllen, Ende muss nach Beginn liegen).'); return }
    if (!istViertelstundenRaster(form.vonZeit) || !istViertelstundenRaster(form.bisZeit)) { setError('Bitte Uhrzeiten in Viertelstunden-Schritten angeben (z. B. 08:00, 08:15, 08:30, 08:45).'); return }
    if (istUebersprungeneSommerzeitStunde(form.vonDatum, form.vonZeit) || istUebersprungeneSommerzeitStunde(form.bisDatum, form.bisZeit)) { setError('Die Uhrzeit 02:00-03:00 Uhr existiert am Tag der Sommerzeit-Umstellung (letzter Sonntag im März) nicht - bitte eine andere Uhrzeit wählen.'); return }
    if ((zeitraum.bis.getTime() - zeitraum.von.getTime()) > MAX_MELDUNG_DAUER_TAGE * 24 * 60 * 60 * 1000) { setError(`Der Zeitraum einer einzelnen Meldung darf höchstens ${MAX_MELDUNG_DAUER_TAGE} Tage umfassen.`); return }
    const payload = formToPayload(form)
    setSaving(true)
    const response = editing
      ? await supabase.from('ueberstunden_meldungen').update(payload).eq('id', editing.id)
      : await supabase.from('ueberstunden_meldungen').insert({ ...payload, beamter_id: profile.id, created_by: profile.id })
    setSaving(false)
    if (response.error) { setError('Die Meldung konnte nicht gespeichert werden.'); return }
    setShowForm(false); setNotice('Entwurf wurde gespeichert.'); await Promise.all([load(), loadUebersicht()])
  }
  async function submitMeldung(item: UeberstundenMeldung) {
    const result = await supabase.from('ueberstunden_meldungen').update({ status: 'eingereicht', eingereicht_at: new Date().toISOString() }).eq('id', item.id)
    if (result.error) { setError('Die Meldung konnte nicht eingereicht werden.'); return }
    logAudit('Überstundenmeldung eingereicht', `${formatZeitraum(item)} · ${formatStunden(totalStunden(item))} Std.`)
    setNotice('Meldung wurde eingereicht und wartet auf Genehmigung.'); await Promise.all([load(), loadUebersicht()])
  }
  async function withdrawMeldung(item: UeberstundenMeldung) {
    const result = await supabase.from('ueberstunden_meldungen').update({ status: 'entwurf' }).eq('id', item.id)
    if (result.error) { setError('Die Meldung konnte nicht zurückgezogen werden.'); return }
    setNotice('Meldung wurde zurückgezogen und ist wieder als Entwurf bearbeitbar.'); await Promise.all([load(), loadUebersicht()])
  }
  async function deleteMeldung(item: UeberstundenMeldung) {
    if (!window.confirm('Diesen Entwurf endgültig löschen?')) return
    const result = await supabase.from('ueberstunden_meldungen').delete().eq('id', item.id)
    if (result.error) { setError('Die Meldung konnte nicht gelöscht werden.'); return }
    setNotice('Entwurf wurde gelöscht.'); await load()
  }

  function printMeldung(item: UeberstundenMeldung) {
    // Vor der Entscheidung gibt es noch keinen genehmiger-Eintrag - solange
    // wird stattdessen der vom Ersteller gewählte, voraussichtliche
    // Genehmiger statt "–" angezeigt, unabhängig davon, wer gerade druckt.
    const genehmigerName = item.genehmiger ? officerPrintName(item.genehmiger) : (kettenName(item.genehmiger_wahl_id) ? officerPrintName({ name: kettenName(item.genehmiger_wahl_id) }) : null)
    generateUeberstundenPdf({
      beamterName: item.beamter?.name ?? '–', bearbeiterName: officerPrintName(profile), genehmigerName,
      vonDatum: item.von_datum, vonZeit: item.von_zeit.slice(0, 5), bisDatum: item.bis_datum, bisZeit: item.bis_zeit.slice(0, 5), grund: item.grund,
      verguetung: item.verguetung,
      stunden: { std_werktag_50: item.std_werktag_50, std_sonn_100: item.std_sonn_100, std_19_22: item.std_19_22, std_22_06: item.std_22_06, std_sonn_200: item.std_sonn_200 },
    })
  }

  function printSammelansicht() {
    const [jahr, monatNr] = monat.split('-').map(Number)
    const monatLabel = new Date(jahr, (monatNr || 1) - 1, 1).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })
    const zeilen = vollstaendigeMonatsUebersicht(uebersicht, alleBediensteten)
    generateUeberstundenSammelPdf({ monatLabel, bearbeiterName: officerPrintName(profile), zeilen })
  }

  return <PortalChrome wide>
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Mein Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Überstundenmeldung</h1><p className="text-sm text-gray-500 mt-1">Überstunden über das vorgegebene Formular erfassen und zur Prüfung abgeben.</p></div><button type="button" onClick={openNew} className="inline-flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Neue Meldung</button></div>
    {error ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : <div className="space-y-8">

      {isGenehmiger ? <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-bold text-gray-900">Monatsübersicht – genehmigte Überstunden</h2>
          <div className="flex items-center gap-2">
            <input type="month" value={monat} onChange={event => setMonat(event.target.value)} className={`${inputClass} w-auto`} />
            <button type="button" onClick={printSammelansicht} disabled={alleBediensteten.length === 0} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 border border-blue-200 px-3 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"><FileOutput className="w-3.5 h-3.5" /> Sammelansicht drucken</button>
          </div>
        </div>
        {uebersicht.length === 0 ? <Empty text="Keine genehmigten Meldungen in diesem Monat." /> : <div className="rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Beamter/in</th>
              <th className="px-3 py-2 font-medium">Vergütung</th>
              {KATEGORIEN.map(kat => <th key={kat.key} className="px-3 py-2 font-medium text-right whitespace-nowrap">{kat.code}</th>)}
              <th className="px-3 py-2 font-medium text-right">Gesamt</th>
            </tr></thead>
            <tbody>{uebersicht.map(zeile => <tr key={`${zeile.beamterId}:${zeile.verguetung}`} className="border-b border-gray-100 last:border-0">
              <td className="px-3 py-2 font-medium text-gray-800">{zeile.beamterName}{zeile.dienstnummer ? <span className="text-xs text-gray-400"> (DNr. {zeile.dienstnummer})</span> : null}</td>
              <td className="px-3 py-2 text-gray-600">{zeile.verguetung ? VERGUETUNG_LABEL[zeile.verguetung] : '–'}</td>
              {KATEGORIEN.map(kat => <td key={kat.key} className="px-3 py-2 text-right tabular-nums">{zeile.stunden[kat.key] ? formatStunden(zeile.stunden[kat.key]) : '–'}</td>)}
              <td className="px-3 py-2 text-right font-bold tabular-nums">{formatStunden(zeile.gesamt)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section> : null}

      <section>
        <h2 className="font-bold text-gray-900 mb-3">Meine Meldungen</h2>
        {eigene.length === 0 ? <Empty text="Noch keine Überstundenmeldung erfasst." /> : <div className="space-y-3">{eigene.map(item => <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="font-bold text-gray-900">{formatZeitraum(item)}</span><span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLOR[item.status]}`}>{STATUS_LABEL[item.status]}</span></div>
              {!item.genehmiger && kettenName(item.genehmiger_wahl_id) ? <p className="text-xs text-gray-500 mt-1">Genehmiger: {kettenName(item.genehmiger_wahl_id)}</p> : null}
              <p className="text-sm text-gray-700 mt-1">{item.grund}</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{formatStunden(totalStunden(item))} Std. gesamt</p>
              <StundenBreakdown item={item} />
              {item.status === 'abgelehnt' && item.genehmiger_note ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg mt-2">Begründung: {item.genehmiger_note}</p> : null}
              {item.status === 'rueckfrage' ? <p className="text-sm text-blue-700 bg-blue-50 px-3 py-2 rounded-lg mt-2">Rückfrage{item.genehmiger ? ` von ${item.genehmiger.name}` : ''}{item.genehmiger_note ? `: ${item.genehmiger_note}` : ' – bitte prüfen, ergänzen und erneut einreichen.'}</p> : null}
              {item.status === 'genehmigt' && item.genehmiger ? <p className="text-xs text-green-700 mt-1">Genehmigt von {item.genehmiger.name}</p> : null}
            </div>
            <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
              <button type="button" onClick={() => printMeldung(item)} className="p-2 text-blue-700 hover:bg-blue-50 rounded-lg" aria-label="Als PDF ausgeben"><FileOutput className="w-4 h-4" /></button>
              {OFFEN_STATUS.includes(item.status) ? <>
                <button type="button" onClick={() => openEdit(item)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Bearbeiten"><Pencil className="w-4 h-4" /></button>
                <button type="button" onClick={() => void submitMeldung(item)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 border border-blue-200 px-3 py-2 rounded-lg"><Send className="w-3.5 h-3.5" /> Einreichen</button>
                {item.status === 'entwurf' ? <button type="button" onClick={() => void deleteMeldung(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Löschen"><Trash2 className="w-4 h-4" /></button> : null}
              </> : null}
              {item.status === 'eingereicht' || item.status === 'rueckfrage' ? <button type="button" onClick={() => void withdrawMeldung(item)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-300 px-3 py-2 rounded-lg"><RotateCcw className="w-3.5 h-3.5" /> Zurückziehen</button> : null}
            </div>
          </div>
        </article>)}</div>}
      </section>
    </div>}

    {showForm ? <Modal title={editing ? 'Überstundenmeldung bearbeiten' : 'Neue Überstundenmeldung'} close={() => setShowForm(false)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Von – Datum *" type="date" value={form.vonDatum} onChange={value => setForm(current => ({ ...current, vonDatum: value }))} />
          <Field label="Von – Uhrzeit *" type="time" step={900} value={form.vonZeit} onChange={value => setForm(current => ({ ...current, vonZeit: value }))} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Bis – Datum *" type="date" value={form.bisDatum} onChange={value => setForm(current => ({ ...current, bisDatum: value }))} />
          <Field label="Bis – Uhrzeit *" type="time" step={900} value={form.bisZeit} onChange={value => setForm(current => ({ ...current, bisZeit: value }))} />
        </div>
      </div>
      {!zeitraum ? <p className="text-xs text-amber-700 -mt-2">Bitte Von/Bis vollständig angeben – das Ende muss nach dem Beginn liegen.</p> : null}
      {zeitraum && zeitraumZuLang ? <p className="text-xs text-amber-700 -mt-2">Der Zeitraum einer einzelnen Meldung darf höchstens {MAX_MELDUNG_DAUER_TAGE} Tage umfassen.</p> : null}
      <Area label="Grund der Überstunde(n) *" value={form.grund} onChange={value => setForm(current => ({ ...current, grund: value }))} />
      {genehmigerKette.length > 0 ? <label className="block text-xs font-medium text-gray-600">Genehmiger
        <select className={inputClass} value={form.genehmigerWahlId ?? ''} onChange={event => setForm(current => ({ ...current, genehmigerWahlId: event.target.value || null }))}>
          <option value="">– bitte wählen –</option>
          {genehmigerKette.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </label> : null}
      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">Vergütung *</p>
        <div className="flex gap-4">
          {(['auszahlung', 'stundenersatz'] as UeberstundenVerguetung[]).map(option => <label key={option} className="inline-flex items-center gap-1.5 text-sm text-gray-700">
            <input type="radio" name="verguetung" checked={form.verguetung === option} onChange={() => setForm(current => ({ ...current, verguetung: option }))} className="text-blue-700 focus:ring-blue-700" />
            {VERGUETUNG_LABEL[option]}
          </label>)}
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-gray-600 mb-2">Ü-Std aufgeschlüsselt <span className="font-normal text-gray-400">– wird automatisch aus dem Zeitraum berechnet (österreichische Feiertage berücksichtigt)</span></p>
        <AufschluesselungTabelle werte={vorschau} />
      </div>
      {error ? <ErrorMessage text={error} /> : null}
      <Actions saving={saving} close={() => setShowForm(false)} save={saveDraft} />
    </Modal> : null}
  </PortalChrome>
}
