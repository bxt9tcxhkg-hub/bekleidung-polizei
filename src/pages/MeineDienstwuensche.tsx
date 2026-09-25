import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { dienstplanSupabase, type DienstplanWunschTyp } from '../lib/dienstplanSupabase'
import { inputClass } from '../components/ZentraleEntryEditor'
import { thisMonthLocal } from '../lib/ueberstunden'
import { WUNSCH_LABEL, wunschfristAblaufdatum, wunschfristAbgelaufen } from '../lib/dienstplanWunsch'

// "Meine Dienstwünsche": pro Tag im gewählten Monat höchstens ein Wunsch
// (frei/Tagdienst bevorzugt/Nachtdienst bevorzugt) + optionale Notiz - für
// jede/n aktive/n Beamten erreichbar (siehe App.tsx, kein Genehmiger nötig).
// Der Planer sieht diese Wünsche beim Planen (Phase 3), ist aber nicht
// daran gebunden - reine Willensäußerung, keine Zusage. Nur bis zur
// konfigurierten Wunschfrist änderbar (siehe lib/dienstplanWunsch.ts,
// serverseitig durchgesetzt in den RPCs dienstplan_wunsch_setzen/
// dienstplan_wunsch_loeschen).

const WOCHENTAG_LABEL: Record<number, string> = { 0: 'So', 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa' }

function tageImMonat(monatIso: string): string[] {
  const [jahr, monat] = monatIso.split('-').map(Number)
  const letzterTag = new Date(jahr, monat, 0).getDate()
  return Array.from({ length: letzterTag }, (_, index) => `${monatIso}-${String(index + 1).padStart(2, '0')}`)
}

function formatDatum(iso: string): string {
  const [jahr, monat, tag] = iso.split('-').map(Number)
  const datum = new Date(jahr, monat - 1, tag)
  return `${WOCHENTAG_LABEL[datum.getDay()]} ${String(tag).padStart(2, '0')}.${String(monat).padStart(2, '0')}.`
}

interface WunschEintrag { wunsch: DienstplanWunschTyp; notiz: string }

export default function MeineDienstwuensche() {
  const { profile } = useAuth()
  const profileId = profile?.id
  const [monat, setMonat] = useState(thisMonthLocal())
  const [wunschfristTage, setWunschfristTage] = useState(14)
  const [wuensche, setWuensche] = useState<Map<string, WunschEintrag>>(new Map())
  const [notizEntwuerfe, setNotizEntwuerfe] = useState<Map<string, string>>(new Map())
  const [speichernDatum, setSpeichernDatum] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!profileId) return
    setLoading(true); setError('')
    const [regelnResult, wuenscheResult] = await Promise.all([
      dienstplanSupabase.from('dienstplan_regeln').select('wunschfrist_tage').eq('id', 1).maybeSingle(),
      dienstplanSupabase.from('dienstplan_wuensche').select('datum,wunsch,notiz').eq('beamter_id', profileId).eq('monat', `${monat}-01`),
    ])
    if (regelnResult.error || wuenscheResult.error) { setError('Die Dienstwünsche konnten nicht geladen werden.'); setLoading(false); return }
    if (regelnResult.data) setWunschfristTage(regelnResult.data.wunschfrist_tage)
    const geladen = new Map<string, WunschEintrag>()
    for (const row of wuenscheResult.data ?? []) geladen.set(row.datum, { wunsch: row.wunsch, notiz: row.notiz ?? '' })
    setWuensche(geladen)
    setNotizEntwuerfe(new Map(Array.from(geladen.entries()).map(([datum, eintrag]) => [datum, eintrag.notiz])))
    setLoading(false)
  }, [monat, profileId])
  useEffect(() => { void load() }, [load])

  const gesperrt = useMemo(() => wunschfristAbgelaufen(monat, wunschfristTage), [monat, wunschfristTage])
  const ablaufdatum = useMemo(() => wunschfristAblaufdatum(monat, wunschfristTage), [monat, wunschfristTage])
  const tage = useMemo(() => tageImMonat(monat), [monat])

  async function setzeWunsch(datum: string, wunsch: DienstplanWunschTyp) {
    setSpeichernDatum(datum); setError('')
    const result = await dienstplanSupabase.rpc('dienstplan_wunsch_setzen', { p_monat: `${monat}-01`, p_datum: datum, p_wunsch: wunsch, p_notiz: notizEntwuerfe.get(datum) || null })
    setSpeichernDatum(null)
    if (result.error) { setError('Der Wunsch konnte nicht gespeichert werden.'); return }
    setWuensche(current => new Map(current).set(datum, { wunsch, notiz: notizEntwuerfe.get(datum) ?? '' }))
  }

  async function loescheWunsch(datum: string) {
    setSpeichernDatum(datum); setError('')
    const result = await dienstplanSupabase.rpc('dienstplan_wunsch_loeschen', { p_monat: `${monat}-01`, p_datum: datum })
    setSpeichernDatum(null)
    if (result.error) { setError('Der Wunsch konnte nicht gelöscht werden.'); return }
    setWuensche(current => { const naechste = new Map(current); naechste.delete(datum); return naechste })
  }

  async function speichereNotiz(datum: string) {
    const bestehend = wuensche.get(datum)
    if (!bestehend) return
    const notiz = notizEntwuerfe.get(datum) ?? ''
    if (notiz === bestehend.notiz) return
    await setzeWunsch(datum, bestehend.wunsch)
  }

  return <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-gray-900">Meine Dienstwünsche</h1><p className="mt-1 text-sm text-gray-500">Freie Tage oder bevorzugte Dienstart für einen Monat vormerken - der Planer sieht das, ist aber nicht daran gebunden.</p></div>
      <input type="month" value={monat} onChange={event => setMonat(event.target.value)} className={`${inputClass} mt-0 w-auto`} />
    </div>

    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

    {loading ? <div className="mt-8 flex justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-800" /></div> : <>
      <p className={`mt-4 flex items-center gap-1.5 text-sm ${gesperrt ? 'text-amber-700' : 'text-gray-500'}`}>
        {gesperrt ? <AlertTriangle className="h-4 w-4 flex-none" /> : <CalendarDays className="h-4 w-4 flex-none" />}
        {gesperrt
          ? `Die Frist für Dienstwünsche in diesem Monat ist abgelaufen (war bis ${ablaufdatum.toLocaleDateString('de-AT')}) - nur noch lesbar.`
          : `Einreichbar bis ${ablaufdatum.toLocaleDateString('de-AT')}.`}
      </p>

      <div className="mt-4 space-y-1.5">
        {tage.map(datum => {
          const eintrag = wuensche.get(datum)
          const speichern = speichernDatum === datum
          return <div key={datum} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <span className="w-20 flex-none font-medium text-gray-800">{formatDatum(datum)}</span>
            <select
              className={`${inputClass} mt-0 w-auto min-w-48 flex-none`}
              disabled={gesperrt || speichern}
              value={eintrag?.wunsch ?? ''}
              onChange={event => { const wert = event.target.value as DienstplanWunschTyp | ''; if (wert === '') void loescheWunsch(datum); else void setzeWunsch(datum, wert) }}
            >
              <option value="">– kein Wunsch –</option>
              {(Object.keys(WUNSCH_LABEL) as DienstplanWunschTyp[]).map(typ => <option key={typ} value={typ}>{WUNSCH_LABEL[typ]}</option>)}
            </select>
            <input
              type="text"
              placeholder="Notiz (optional)"
              disabled={gesperrt || speichern || !eintrag}
              className={`${inputClass} mt-0 min-w-40 flex-1`}
              value={notizEntwuerfe.get(datum) ?? ''}
              onChange={event => setNotizEntwuerfe(current => new Map(current).set(datum, event.target.value))}
              onBlur={() => void speichereNotiz(datum)}
            />
          </div>
        })}
      </div>
    </>}
  </div>
}
