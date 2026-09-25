import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import { dienstplanSupabase, type DienstplanMonatRow, type DienstplanSpalteRow } from '../lib/dienstplanSupabase'
import { ErrorMessage, inputClass } from '../components/ZentraleEntryEditor'
import { automatischeSpaltenZuordnung, baueDienstePayload, istSpalteAktiv, parseDienstplanGrid, type DienstplanParseErgebnis, type DienstplanSpaltenZuordnung, type DienstplanZelle } from '../lib/dienstplanImport'
import { ET_ROSTER_ORGANISATION } from '../lib/usersSeed'

// Schritt 1-3 des Dienstplan-Imports (siehe AGENTS.md-Analyse): Datei einlesen,
// Spalten (Nachname je Excel-Spalte) einem Profil zuordnen - per
// automatischeSpaltenZuordnung() anhand des Namens vorgeschlagen (Nachname,
// bei Dubletten zusätzlich Vornamens-Initiale), sonst manuell auswählbar.
// Die bestätigte Zuordnung wird in dienstplan_spalten gemerkt und bei
// künftigen Monaten automatisch wiederverwendet, dann atomar über die RPC
// dienstplan_monat_ersetzen gespeichert. Profile nur aus der Stadtpolizei
// (ET_ROSTER_ORGANISATION) - andere Organisationen (Parkaufsicht etc.)
// erscheinen weder im Vorschlag noch in der Auswahl. Dienststellenkalender
// und persönliche Stunden-Übersicht (Auswertung der hier gespeicherten
// Rohdaten) sind eigene, spätere Schritte.

interface MitarbeiterOption { id: string; name: string; dienstnummer: string | null }
type SpaltenZuordnungRow = Pick<DienstplanSpalteRow, 'spaltenname' | 'beamter_id' | 'immer_aktiv'>
type MonatListRow = Pick<DienstplanMonatRow, 'id' | 'monat' | 'dateiname' | 'status' | 'hochgeladen_at'>

function monatLabel(monatIso: string): string {
  const [jahr, monat] = monatIso.split('-').map(Number)
  return new Date(jahr, (monat || 1) - 1, 1).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })
}

export default function SystemeinstellungenDienstplanImport() {
  const { profile } = useAuth()
  const [mitarbeiter, setMitarbeiter] = useState<MitarbeiterOption[]>([])
  const [monate, setMonate] = useState<MonatListRow[]>([])
  const [ladeGrunddaten, setLadeGrunddaten] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [dateiname, setDateiname] = useState('')
  const [ergebnis, setErgebnis] = useState<DienstplanParseErgebnis | null>(null)
  const [zuordnungen, setZuordnungen] = useState<Map<string, DienstplanSpaltenZuordnung>>(new Map())
  const [speichern, setSpeichern] = useState(false)
  const [veroeffentlichen, setVeroeffentlichen] = useState<string | null>(null)

  const ladeGrunddatenFn = useCallback(async () => {
    setLadeGrunddaten(true)
    const [mitarbeiterResult, spaltenResult, monateResult] = await Promise.all([
      supabase.from('profiles').select('id,name,dienstnummer').eq('active', true).eq('organisation', ET_ROSTER_ORGANISATION).order('name'),
      dienstplanSupabase.from('dienstplan_spalten').select('spaltenname,beamter_id,immer_aktiv'),
      dienstplanSupabase.from('dienstplan_monate').select('id,monat,dateiname,status,hochgeladen_at').order('monat', { ascending: false }),
    ])
    if (mitarbeiterResult.error || spaltenResult.error || monateResult.error) { setError('Grunddaten konnten nicht geladen werden.'); setLadeGrunddaten(false); return }
    setMitarbeiter(mitarbeiterResult.data ?? [])
    setMonate(monateResult.data ?? [])
    const gemerkt = new Map<string, DienstplanSpaltenZuordnung>()
    for (const row of (spaltenResult.data ?? []) as SpaltenZuordnungRow[]) gemerkt.set(row.spaltenname, { beamterId: row.beamter_id, immerAktiv: row.immer_aktiv })
    setZuordnungen(current => new Map([...gemerkt, ...current]))
    setError('')
    setLadeGrunddaten(false)
  }, [])
  useEffect(() => { void ladeGrunddatenFn() }, [ladeGrunddatenFn])

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(''); setNotice(''); setErgebnis(null)
    const reader = new FileReader()
    reader.onload = readEvent => {
      try {
        const workbook = XLSX.read(readEvent.target?.result, { type: 'array', cellDates: true })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as DienstplanZelle[][]
        const geparst = parseDienstplanGrid(grid)
        if ('error' in geparst) { setError(geparst.error); return }
        setDateiname(file.name)
        setErgebnis(geparst)
        // Für noch nicht gemerkte, aktive Spalten automatisch das eindeutig
        // passende Profil vorschlagen (siehe automatischeSpaltenZuordnung) -
        // bleibt bewusst nur ein Vorschlag: die Zuordnung ist im Formular
        // weiterhin änderbar, bevor sie gespeichert wird.
        setZuordnungen(current => {
          const naechste = new Map(current)
          for (const spalte of geparst.spalten) {
            if (naechste.has(spalte.name) || !spalte.hatEintraege) continue
            const treffer = automatischeSpaltenZuordnung(spalte.name, mitarbeiter)
            if (treffer) naechste.set(spalte.name, { beamterId: treffer, immerAktiv: false })
          }
          return naechste
        })
      } catch {
        setError('Datei konnte nicht gelesen werden - ist das eine gültige Dienstplan-Excel-Datei (.xlsx/.xlsm)?')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const aktiveSpalten = useMemo(() => ergebnis ? ergebnis.spalten.filter(spalte => istSpalteAktiv(spalte, zuordnungen.get(spalte.name))) : [], [ergebnis, zuordnungen])
  const inaktiveSpalten = useMemo(() => ergebnis ? ergebnis.spalten.filter(spalte => !istSpalteAktiv(spalte, zuordnungen.get(spalte.name))) : [], [ergebnis, zuordnungen])
  const nichtZugeordnet = aktiveSpalten.filter(spalte => !zuordnungen.get(spalte.name)?.beamterId)

  function setZuordnung(spaltenname: string, changes: Partial<DienstplanSpaltenZuordnung>) {
    setZuordnungen(current => {
      const naechste = new Map(current)
      const bisherig = naechste.get(spaltenname) ?? { beamterId: null, immerAktiv: false }
      naechste.set(spaltenname, { ...bisherig, ...changes })
      return naechste
    })
  }

  async function speichereImport() {
    if (!ergebnis || !profile?.id) return
    if (nichtZugeordnet.length > 0) { setError(`Bitte jede aktive Spalte zuordnen oder als „ignorieren" markieren (noch offen: ${nichtZugeordnet.map(s => s.name).join(', ')}).`); return }
    setSpeichern(true); setError(''); setNotice('')

    // Alle betroffenen Zuordnungen (auch reine "ignorieren"-Entscheidungen)
    // dauerhaft merken, damit beim nächsten Monat nicht erneut gefragt wird.
    const zuordnungsZeilen = ergebnis.spalten
      .filter(spalte => zuordnungen.has(spalte.name))
      .map(spalte => {
        const zuordnung = zuordnungen.get(spalte.name) as DienstplanSpaltenZuordnung
        return { spaltenname: spalte.name, beamter_id: zuordnung.beamterId, immer_aktiv: zuordnung.immerAktiv, updated_by: profile.id }
      })
    if (zuordnungsZeilen.length > 0) {
      const zuordnungsResult = await dienstplanSupabase.from('dienstplan_spalten').upsert(zuordnungsZeilen, { onConflict: 'spaltenname' })
      if (zuordnungsResult.error) { setSpeichern(false); setError('Die Spaltenzuordnung konnte nicht gespeichert werden.'); return }
    }

    const dienste = baueDienstePayload(ergebnis, zuordnungen)
    const rpcResult = await dienstplanSupabase.rpc('dienstplan_monat_ersetzen', { p_monat: ergebnis.monat, p_dateiname: dateiname, p_dienste: dienste as unknown as Record<string, unknown>[] })
    setSpeichern(false)
    if (rpcResult.error) { setError('Der Dienstplan konnte nicht gespeichert werden.'); return }
    logAudit('Dienstplan importiert', `${monatLabel(ergebnis.monat)} · ${dienste.length} Einträge, ${aktiveSpalten.length} Bedienstete`)
    setNotice(`${monatLabel(ergebnis.monat)} wurde importiert (${dienste.length} Einträge). Als Entwurf gespeichert - unten „Veröffentlichen", sobald die Zuordnung geprüft ist.`)
    setErgebnis(null)
    await ladeGrunddatenFn()
  }

  async function veroeffentlicheMonat(monatId: string) {
    setVeroeffentlichen(monatId); setError(''); setNotice('')
    const result = await dienstplanSupabase.rpc('dienstplan_monat_veroeffentlichen', { p_monat_id: monatId })
    setVeroeffentlichen(null)
    if (result.error) { setError('Der Monat konnte nicht veröffentlicht werden.'); return }
    logAudit('Dienstplan veröffentlicht', monate.find(monat => monat.id === monatId)?.monat ?? monatId)
    setNotice('Der Monat ist jetzt veröffentlicht.')
    await ladeGrunddatenFn()
  }

  return <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
    <Link to="/portal/systemeinstellungen" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4" /> Zu Systemeinstellungen</Link>
    <h1 className="mt-5 text-2xl font-bold text-gray-900">Dienstplan-Import</h1>
    <p className="mt-2 max-w-3xl text-sm text-gray-600">Monatliche Dienstplan-Datei (.xlsx/.xlsm) hochladen. Jede Namensspalte wird automatisch anhand des Namens einem Profil (nur Stadtpolizei) zugeordnet und für künftige Monate gemerkt - nur bei mehrdeutigen Namen oder Kürzeln ist eine manuelle Auswahl nötig. Ein erneuter Upload desselben Monats ersetzt dessen Daten vollständig (Korrektur).</p>

    {error ? <div className="mt-4"><ErrorMessage text={error} /></div> : null}
    {notice ? <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p> : null}

    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-900">
        <Upload className="h-4 w-4" /> Dienstplan-Datei wählen
        <input type="file" accept=".xlsx,.xls,.xlsm" className="hidden" onChange={handleFile} />
      </label>
      {ladeGrunddaten ? <p className="mt-3 text-sm text-gray-500">Grunddaten werden geladen…</p> : null}
    </section>

    {ergebnis ? <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-900">Vorschau: {monatLabel(ergebnis.monat)}</h2>
        <p className="text-xs text-gray-500">{dateiname} · {ergebnis.eintraege.length} Roheinträge</p>
      </div>
      <p className="mt-2 text-xs text-gray-500">Zuordnungen werden automatisch anhand des Namens vorgeschlagen (bzw. aus einem früheren Monat übernommen) - bitte kurz prüfen, bevor gespeichert wird. Nur bei Namensgleichheit/Kürzeln ohne eindeutigen Treffer ist eine manuelle Auswahl nötig.</p>

      <div className="mt-4 space-y-3">
        {aktiveSpalten.map(spalte => {
          const zuordnung = zuordnungen.get(spalte.name)
          const anzahl = ergebnis.eintraege.filter(eintrag => eintrag.spaltenname === spalte.name).length
          return <div key={spalte.name} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-3">
            <div className="min-w-32 flex-1">
              <p className="text-sm font-semibold text-gray-900">{spalte.name}</p>
              <p className="text-xs text-gray-500">{spalte.hatEintraege ? `${anzahl} Einträge diesen Monat` : 'keine Einträge diesen Monat'}</p>
            </div>
            <select className={`${inputClass} mt-0 w-auto min-w-56`} value={zuordnung?.beamterId ?? ''} onChange={event => setZuordnung(spalte.name, { beamterId: event.target.value || null })}>
              <option value="">– Profil zuordnen –</option>
              {mitarbeiter.map(person => <option key={person.id} value={person.id}>{person.name}{person.dienstnummer ? ` (DNr. ${person.dienstnummer})` : ''}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" checked={zuordnung?.immerAktiv ?? false} onChange={event => setZuordnung(spalte.name, { immerAktiv: event.target.checked })} /> immer aktiv (auch ohne Einträge)</label>
          </div>
        })}
      </div>

      {inaktiveSpalten.length > 0 ? <details className="mt-4">
        <summary className="cursor-pointer text-sm text-gray-500">{inaktiveSpalten.length} Spalten ohne Einträge diesen Monat (übersprungen)</summary>
        <div className="mt-2 space-y-2">
          {inaktiveSpalten.map(spalte => <div key={spalte.name} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-2.5 text-sm text-gray-600">
            <span className="flex-1">{spalte.name}</span>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={zuordnungen.get(spalte.name)?.immerAktiv ?? false} onChange={event => setZuordnung(spalte.name, { immerAktiv: event.target.checked })} /> trotzdem berücksichtigen (immer aktiv)</label>
          </div>)}
        </div>
      </details> : null}

      <div className="mt-5 flex justify-end">
        <button type="button" disabled={speichern} onClick={() => void speichereImport()} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{speichern ? 'Speichern…' : 'Import speichern'}</button>
      </div>
    </section> : null}

    <section className="mt-8">
      <h2 className="text-lg font-bold text-gray-900">Bisher importierte Monate</h2>
      {monate.length === 0 ? <p className="mt-3 text-sm text-gray-500">Noch kein Dienstplan importiert.</p> : <div className="mt-3 space-y-2">
        {monate.map(monat => <div key={monat.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex-1"><p className="text-sm font-semibold text-gray-900">{monatLabel(monat.monat)}</p><p className="text-xs text-gray-500">{monat.dateiname}</p></div>
          {monat.status === 'veroeffentlicht' ? <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800"><CheckCircle2 className="h-3.5 w-3.5" /> Veröffentlicht</span>
            : <button type="button" disabled={veroeffentlichen === monat.id} onClick={() => void veroeffentlicheMonat(monat.id)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 disabled:opacity-50">{veroeffentlichen === monat.id ? 'Wird veröffentlicht…' : 'Veröffentlichen'}</button>}
        </div>)}
      </div>}
    </section>
  </div>
}
