import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { dienstplanSupabase, type DienstplanWunschTyp } from '../lib/dienstplanSupabase'
import { thisMonthLocal } from '../lib/ueberstunden'
import { VOLLZEIT_BESCHAEFTIGUNGSGRAD } from '../lib/dienstplanSollstunden'
import { WUNSCH_LABEL, kontingentVerbrauch, laengsteSlotFolge, monatsKontingent, wunschfristAblaufdatum, wunschfristAbgelaufen, type WunschEintragKurz } from '../lib/dienstplanWunsch'

// "Meine Dienstwünsche": Freiplanungswünsche nach der Regelung des
// Kommandanten - ein ganzer freier Tag braucht ZWEI Wünsche (Tag frei +
// Nacht frei), Urlaub blockiert den ganzen Tag, kostet aber nur 1
// Kontingenteinheit. Monatliches Kontingent (18 bei Vollzeit, linear nach
// Beschäftigungsgrad skaliert) und die Regel "max. 6 Tag/Nacht-Slots am
// Stück" werden hier rein als Hilfestellung berechnet und blockieren das
// Setzen eines weiteren Wunsches (siehe lib/dienstplanWunsch.ts) - der
// Planer sieht die Wünsche, ist aber nicht daran gebunden. Nur bis zur
// konfigurierten Wunschfrist änderbar (serverseitig durchgesetzt in den
// RPCs dienstplan_wunsch_setzen/dienstplan_wunsch_loeschen).
//
// Daneben können dienstliche Termine hinterlegt werden (Gerichtsverhandlung,
// Schulverkehrserziehung-Termin, Personalvertretung-Sitzung) - das sind
// keine Freiplanungswünsche, sondern Informationen für den Planer, der den
// tatsächlichen Dienst weiterhin frei gestaltet. Sie zählen laut Kommandant
// NICHT gegen das Kontingent/die Slot-Folge-Regel (siehe TERMIN_TYPEN unten
// und die Filterung in lib/dienstplanWunsch.ts) und können optional mit
// einer Von-/Bis-Uhrzeit versehen werden.

const TERMIN_TYPEN: readonly DienstplanWunschTyp[] = ['gerichtsverhandlung', 'schulverkehrserziehung', 'personalvertretung']
const TERMIN_KURZLABEL: Partial<Record<DienstplanWunschTyp, string>> = {
  gerichtsverhandlung: 'Gericht', schulverkehrserziehung: 'SVE-Termin', personalvertretung: 'PV-Sitzung',
}

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

const TOGGLE_STIL: Record<'aktiv' | 'inaktiv', string> = {
  aktiv: 'border-blue-700 bg-blue-700 text-white',
  inaktiv: 'border-gray-300 text-gray-700 hover:bg-gray-50',
}
const TERMIN_TOGGLE_STIL: Record<'aktiv' | 'inaktiv', string> = {
  aktiv: 'border-purple-700 bg-purple-700 text-white',
  inaktiv: 'border-gray-300 text-gray-700 hover:bg-gray-50',
}

interface TerminZeit { vonZeit: string | null; bisZeit: string | null }

export default function MeineDienstwuensche() {
  const { profile } = useAuth()
  const profileId = profile?.id
  // Kein freier Monatswähler mehr - Beamte sehen nur den vom Genehmiger
  // freigegebenen Monat (dienstplan_regeln.offener_wunsch_monat), auch
  // serverseitig in den RPCs durchgesetzt (siehe Migration
  // 20260926065317_dienstplan_offener_monat.sql).
  const [offenerMonat, setOffenerMonat] = useState<string | null>(null)
  const [wunschfristTage, setWunschfristTage] = useState(14)
  const [beschaeftigungsgrad, setBeschaeftigungsgrad] = useState(VOLLZEIT_BESCHAEFTIGUNGSGRAD)
  const [wuensche, setWuensche] = useState<Map<string, Set<DienstplanWunschTyp>>>(new Map())
  const [terminZeiten, setTerminZeiten] = useState<Map<string, Map<DienstplanWunschTyp, TerminZeit>>>(new Map())
  const [speichernSchluessel, setSpeichernSchluessel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!profileId) return
    setLoading(true); setError('')
    const [regelnResult, einstellungResult] = await Promise.all([
      dienstplanSupabase.from('dienstplan_regeln').select('wunschfrist_tage,offener_wunsch_monat').eq('id', 1).maybeSingle(),
      dienstplanSupabase.from('dienstplan_person_einstellungen').select('beschaeftigungsgrad').eq('beamter_id', profileId).maybeSingle(),
    ])
    if (regelnResult.error || einstellungResult.error) { setError('Die Dienstwünsche konnten nicht geladen werden.'); setLoading(false); return }
    if (regelnResult.data) setWunschfristTage(regelnResult.data.wunschfrist_tage)
    setBeschaeftigungsgrad(einstellungResult.data?.beschaeftigungsgrad ?? VOLLZEIT_BESCHAEFTIGUNGSGRAD)
    const monat = regelnResult.data?.offener_wunsch_monat?.slice(0, 7) ?? null
    setOffenerMonat(monat)
    if (!monat) { setWuensche(new Map()); setLoading(false); return }
    const wuenscheResult = await dienstplanSupabase.from('dienstplan_wuensche').select('datum,wunsch,von_zeit,bis_zeit').eq('beamter_id', profileId).eq('monat', `${monat}-01`)
    if (wuenscheResult.error) { setError('Die Dienstwünsche konnten nicht geladen werden.'); setLoading(false); return }
    const geladen = new Map<string, Set<DienstplanWunschTyp>>()
    const geladeneZeiten = new Map<string, Map<DienstplanWunschTyp, TerminZeit>>()
    for (const row of wuenscheResult.data ?? []) {
      const menge = geladen.get(row.datum) ?? new Set<DienstplanWunschTyp>()
      menge.add(row.wunsch)
      geladen.set(row.datum, menge)
      const zeitenProTag = geladeneZeiten.get(row.datum) ?? new Map<DienstplanWunschTyp, TerminZeit>()
      zeitenProTag.set(row.wunsch, { vonZeit: row.von_zeit, bisZeit: row.bis_zeit })
      geladeneZeiten.set(row.datum, zeitenProTag)
    }
    setWuensche(geladen)
    setTerminZeiten(geladeneZeiten)
    setLoading(false)
  }, [profileId])
  useEffect(() => { void load() }, [load])

  const monat = offenerMonat ?? thisMonthLocal()

  const gesperrt = useMemo(() => wunschfristAbgelaufen(monat, wunschfristTage), [monat, wunschfristTage])
  const ablaufdatum = useMemo(() => wunschfristAblaufdatum(monat, wunschfristTage), [monat, wunschfristTage])
  const tage = useMemo(() => tageImMonat(monat), [monat])
  const kontingent = useMemo(() => monatsKontingent(beschaeftigungsgrad), [beschaeftigungsgrad])

  const alleEintraege = useMemo((): WunschEintragKurz[] => {
    const liste: WunschEintragKurz[] = []
    for (const [datum, menge] of wuensche) for (const wunsch of menge) liste.push({ datum, wunsch })
    return liste
  }, [wuensche])
  const verbraucht = useMemo(() => kontingentVerbrauch(alleEintraege), [alleEintraege])
  const laengsteFolge = useMemo(() => laengsteSlotFolge(alleEintraege), [alleEintraege])

  async function toggleWunsch(datum: string, wunsch: DienstplanWunschTyp, loeschenZusaetzlich: DienstplanWunschTyp[] = []) {
    const schluessel = `${datum}|${wunsch}`
    const aktiv = wuensche.get(datum)?.has(wunsch) ?? false

    // Vorschau, ob das Setzen (nicht das Entfernen) Kontingent oder die "max. 6 am Stück"-Regel überschreiten würde.
    if (!aktiv) {
      const testEintraege = [...alleEintraege, { datum, wunsch }]
      if (kontingentVerbrauch(testEintraege) > kontingent) { setError(`Kontingent überschritten (${kontingent} Freiplanungswünsche/Monat).`); return }
      if (laengsteSlotFolge(testEintraege) > 6) { setError('Maximal 6 Freiplanungswünsche dürfen hintereinander gesetzt werden.'); return }
    }

    setSpeichernSchluessel(schluessel); setError('')
    if (aktiv) {
      const result = await dienstplanSupabase.rpc('dienstplan_wunsch_loeschen', { p_monat: `${monat}-01`, p_datum: datum, p_wunsch: wunsch })
      if (result.error) { setSpeichernSchluessel(null); setError('Der Wunsch konnte nicht entfernt werden.'); return }
      setWuensche(current => {
        const naechste = new Map(current)
        const menge = new Set(naechste.get(datum) ?? [])
        menge.delete(wunsch)
        if (menge.size === 0) naechste.delete(datum); else naechste.set(datum, menge)
        return naechste
      })
      setTerminZeiten(current => {
        const naechste = new Map(current)
        const zeitenProTag = new Map(naechste.get(datum) ?? [])
        zeitenProTag.delete(wunsch)
        if (zeitenProTag.size === 0) naechste.delete(datum); else naechste.set(datum, zeitenProTag)
        return naechste
      })
    } else {
      for (const zuLoeschen of loeschenZusaetzlich) {
        if (wuensche.get(datum)?.has(zuLoeschen)) await dienstplanSupabase.rpc('dienstplan_wunsch_loeschen', { p_monat: `${monat}-01`, p_datum: datum, p_wunsch: zuLoeschen })
      }
      const result = await dienstplanSupabase.rpc('dienstplan_wunsch_setzen', { p_monat: `${monat}-01`, p_datum: datum, p_wunsch: wunsch })
      if (result.error) { setSpeichernSchluessel(null); setError('Der Wunsch konnte nicht gespeichert werden.'); return }
      setWuensche(current => {
        const naechste = new Map(current)
        const menge = new Set(naechste.get(datum) ?? [])
        for (const zuLoeschen of loeschenZusaetzlich) menge.delete(zuLoeschen)
        menge.add(wunsch)
        naechste.set(datum, menge)
        return naechste
      })
    }
    setSpeichernSchluessel(null)
  }

  /** Optionale Von-/Bis-Uhrzeit zu einem bereits gesetzten Termin (Gerichtsverhandlung/Schulverkehrserziehung/Personalvertretung) speichern - der Termin selbst muss bereits per toggleWunsch angelegt sein. */
  async function setzeTerminZeit(datum: string, wunsch: DienstplanWunschTyp, feld: keyof TerminZeit, wert: string) {
    const bisher = terminZeiten.get(datum)?.get(wunsch) ?? { vonZeit: null, bisZeit: null }
    const naechsteZeit: TerminZeit = { ...bisher, [feld]: wert || null }
    setTerminZeiten(current => {
      const naechste = new Map(current)
      const zeitenProTag = new Map(naechste.get(datum) ?? [])
      zeitenProTag.set(wunsch, naechsteZeit)
      naechste.set(datum, zeitenProTag)
      return naechste
    })
    const result = await dienstplanSupabase.rpc('dienstplan_wunsch_setzen', { p_monat: `${monat}-01`, p_datum: datum, p_wunsch: wunsch, p_von_zeit: naechsteZeit.vonZeit, p_bis_zeit: naechsteZeit.bisZeit })
    if (result.error) setError('Die Uhrzeit konnte nicht gespeichert werden.')
  }

  return <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-gray-900">Meine Dienstwünsche</h1><p className="mt-1 text-sm text-gray-500">Freiplanungswünsche für den vom Genehmiger freigegebenen Monat vormerken - der Planer sieht das, ist aber nicht daran gebunden.</p></div>
      {offenerMonat ? <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">{monat}</span> : null}
    </div>

    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

    {loading ? <div className="mt-8 flex justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-800" /></div>
      : !offenerMonat ? <div className="mt-8 rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center">
        <CalendarDays className="mx-auto mb-2 h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">Aktuell ist kein Monat für Freiplanungswünsche freigegeben. Bitte beim Genehmiger nachfragen.</p>
      </div>
      : <>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
        <span className={verbraucht > kontingent ? 'font-semibold text-red-700' : 'font-semibold text-gray-800'}>{verbraucht} / {kontingent} Freiplanungswünsche verwendet</span>
        <span className="text-gray-400">·</span>
        <span className={laengsteFolge > 6 ? 'font-semibold text-red-700' : 'text-gray-600'}>längste Folge: {laengsteFolge} / 6</span>
      </div>
      <p className={`mt-2 flex items-center gap-1.5 text-sm ${gesperrt ? 'text-amber-700' : 'text-gray-500'}`}>
        {gesperrt ? <AlertTriangle className="h-4 w-4 flex-none" /> : <CalendarDays className="h-4 w-4 flex-none" />}
        {gesperrt
          ? `Die Frist für Dienstwünsche in diesem Monat ist abgelaufen (war bis ${ablaufdatum.toLocaleDateString('de-AT')}) - nur noch lesbar.`
          : `Einreichbar bis ${ablaufdatum.toLocaleDateString('de-AT')}. Ein ganzer freier Tag = Tag frei + Nacht frei (2 Einheiten), Urlaub kostet nur 1. Gerichtsverhandlung/Schulverkehrserziehung-Termin/Personalvertretung-Sitzung sind reine Hinweise für den Planer und zählen nicht zum Kontingent.`}
      </p>

      <div className="mt-4 space-y-1.5">
        {tage.map(datum => {
          const menge = wuensche.get(datum) ?? new Set<DienstplanWunschTyp>()
          const deaktiviert = (wunsch: DienstplanWunschTyp) => gesperrt || speichernSchluessel === `${datum}|${wunsch}`
          const zeitenHeute = terminZeiten.get(datum)
          return <div key={datum} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 flex-none text-sm font-medium text-gray-800">{formatDatum(datum)}</span>
              <button type="button" disabled={deaktiviert('frei_tag')} onClick={() => void toggleWunsch(datum, 'frei_tag', ['urlaub'])} className={`rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${TOGGLE_STIL[menge.has('frei_tag') ? 'aktiv' : 'inaktiv']}`}>Tag frei</button>
              <button type="button" disabled={deaktiviert('frei_nacht')} onClick={() => void toggleWunsch(datum, 'frei_nacht', ['urlaub'])} className={`rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${TOGGLE_STIL[menge.has('frei_nacht') ? 'aktiv' : 'inaktiv']}`}>Nacht frei</button>
              <button type="button" disabled={deaktiviert('urlaub')} onClick={() => void toggleWunsch(datum, 'urlaub', ['frei_tag', 'frei_nacht'])} className={`rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${TOGGLE_STIL[menge.has('urlaub') ? 'aktiv' : 'inaktiv']}`}>Urlaub</button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {TERMIN_TYPEN.map(wunsch => {
                const aktiv = menge.has(wunsch)
                const zeit = zeitenHeute?.get(wunsch)
                return <span key={wunsch} className="flex flex-wrap items-center gap-1">
                  <button type="button" disabled={deaktiviert(wunsch)} title={WUNSCH_LABEL[wunsch]} onClick={() => void toggleWunsch(datum, wunsch)} className={`rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${TERMIN_TOGGLE_STIL[aktiv ? 'aktiv' : 'inaktiv']}`}>{TERMIN_KURZLABEL[wunsch]}</button>
                  {aktiv ? <>
                    <input type="time" disabled={gesperrt} value={zeit?.vonZeit?.slice(0, 5) ?? ''} onChange={event => void setzeTerminZeit(datum, wunsch, 'vonZeit', event.target.value)} className="w-24 rounded border border-gray-300 px-1 py-0.5 text-xs disabled:opacity-50" />
                    <span className="text-xs text-gray-400">–</span>
                    <input type="time" disabled={gesperrt} value={zeit?.bisZeit?.slice(0, 5) ?? ''} onChange={event => void setzeTerminZeit(datum, wunsch, 'bisZeit', event.target.value)} className="w-24 rounded border border-gray-300 px-1 py-0.5 text-xs disabled:opacity-50" />
                  </> : null}
                </span>
              })}
            </div>
          </div>
        })}
      </div>
    </>}
  </div>
}
