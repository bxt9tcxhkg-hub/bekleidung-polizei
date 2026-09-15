import { isSonnOderFeiertag } from './austrianHolidays'
import type { UeberstundenMeldung, UeberstundenStatus, UeberstundenVerguetung } from './types'

// Von Ueberstunden.tsx (Seite) und lib/ueberstundenPdf.ts (PDF-Export)
// gemeinsam genutzte Konstanten/Hilfsfunktionen.

export const STATUS_LABEL: Record<UeberstundenStatus, string> = { entwurf: 'Entwurf', eingereicht: 'Eingereicht', genehmigt: 'Genehmigt', abgelehnt: 'Abgelehnt', rueckfrage: 'Rückfrage' }
export const STATUS_COLOR: Record<UeberstundenStatus, string> = { entwurf: 'bg-gray-100 text-gray-600', eingereicht: 'bg-amber-100 text-amber-800', genehmigt: 'bg-green-100 text-green-800', abgelehnt: 'bg-red-100 text-red-800', rueckfrage: 'bg-blue-100 text-blue-800' }

export const VERGUETUNG_LABEL: Record<UeberstundenVerguetung, string> = { auszahlung: 'Auszahlung', stundenersatz: 'Stundenersatz' }

/** Meldungen mit diesem Status zählen zum gemeinsamen Feiertags-Topf - Pendant zu SQL ueberstunden_zaehlt_zum_topf(). */
export const POOL_STATUS: UeberstundenStatus[] = ['eingereicht', 'genehmigt', 'rueckfrage']

export type UeberstundenKategorieKey = 'std_werktag_50' | 'std_sonn_100' | 'std_19_22' | 'std_22_06' | 'std_sonn_200'

// Reihenfolge/Aufteilung wie in der offiziellen Vorlage (Spalten der Tabelle
// "Ü-Std aufgeschlüsselt") - Bezeichnung, Lohnsatz und LA-Code je Kategorie.
export const KATEGORIEN: { key: UeberstundenKategorieKey; label: string; hinweis: string; satz: string; code: string }[] = [
  { key: 'std_werktag_50', label: 'Überstunden an Werktagen', hinweis: 'Mo 06.00 bis 19.00 Uhr (werden mit 50 % Lohn verrechnet)', satz: '50 %', code: 'LA 3250' },
  { key: 'std_19_22', label: 'Stunden in der Zeit von 19-22 Uhr', hinweis: 'an Werktagen', satz: '50 %', code: 'LA 3500' },
  { key: 'std_22_06', label: 'Stunden in der Zeit von 22-06 Uhr', hinweis: 'an Werktagen', satz: '100 %', code: 'LA 3510' },
  { key: 'std_sonn_100', label: 'Überstunden an Sonn- und Feiertagen', hinweis: 'die ersten 8 Stunden je Tag', satz: 'So 100 %', code: 'LA 3520' },
  { key: 'std_sonn_200', label: 'Überstunden an Sonn- u. Feiertagen', hinweis: 'ab der 9. Stunde je Tag', satz: '200 %', code: 'LA 3530' },
]

export function totalStunden(item: Pick<UeberstundenMeldung, UeberstundenKategorieKey>): number {
  return KATEGORIEN.reduce((sum, kat) => sum + (item[kat.key] || 0), 0)
}

export function formatStunden(value: number): string {
  return value.toLocaleString('de-AT', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })
}

export function todayLocal(): string { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }

export const EMPTY_MELDUNG_FORM = {
  vonDatum: todayLocal(), vonZeit: '', bisDatum: todayLocal(), bisZeit: '', grund: '', verguetung: 'auszahlung' as UeberstundenVerguetung,
}
export type MeldungFormState = typeof EMPTY_MELDUNG_FORM

const LEERE_AUFSCHLUESSELUNG: Record<UeberstundenKategorieKey, number> = { std_werktag_50: 0, std_sonn_100: 0, std_19_22: 0, std_22_06: 0, std_sonn_200: 0 }

/** JS-Pendant zu SQL ueberstunden_tagesstunden() - Gesamtstunden je Kalendertag für einen Zeitraum. */
function tageStunden(von: Date, bis: Date): { tag: Date; stunden: number }[] {
  const result: { tag: Date; stunden: number }[] = []
  if (!(bis > von)) return result
  let cursor = new Date(von)
  while (cursor < bis) {
    const tagesbeginn = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
    const naechsterTag = new Date(tagesbeginn.getFullYear(), tagesbeginn.getMonth(), tagesbeginn.getDate() + 1)
    const abschnittsende = bis < naechsterTag ? bis : naechsterTag
    result.push({ tag: tagesbeginn, stunden: (abschnittsende.getTime() - cursor.getTime()) / 3_600_000 })
    cursor = abschnittsende
  }
  return result
}

/**
 * Baut aus den (bereits eingereichten/genehmigten/zur Rückfrage stehenden)
 * eigenen Meldungen einen Nachschlage-Wert "an diesem Tag bereits verwendete
 * Feiertagsstunden" für die Live-Vorschau - nur zeitlich VOR dem eigenen
 * Zeitraum liegende Meldungen zählen (dieselbe Prioritätsregel wie
 * serverseitig, siehe ueberstunden_berechne_aufschluesselung), sonst würde
 * die Vorschau von der beim Speichern serverseitig berechneten Aufteilung
 * abweichen.
 */
export function bereitsVerwendeteFeiertagsstunden(andereMeldungen: readonly { von: Date; bis: Date }[], eigenerVon: Date): (tag: Date) => number {
  const proTag = new Map<number, number>()
  for (const m of andereMeldungen) {
    if (!(m.von < eigenerVon)) continue
    for (const { tag, stunden } of tageStunden(m.von, m.bis)) {
      const key = tag.getTime()
      proTag.set(key, (proTag.get(key) ?? 0) + stunden)
    }
  }
  return (tag: Date) => proTag.get(tag.getTime()) ?? 0
}

/**
 * Zerlegt den Zeitraum [von, bis) tageweise und ordnet jeden Abschnitt der
 * passenden Lohnart zu:
 * - An einem Sonn-/Feiertag zählt der gesamte Tag zur Feiertagsregel,
 *   unabhängig von der Uhrzeit: die ersten 8 Überstunden dieses Tages zu
 *   100 % (LA 3520), alles darüber hinaus an diesem Tag zu 200 % (LA 3530) -
 *   "die ersten 8" nach Abzug schon anderweitig (siehe bereitsVerwendet)
 *   verbrauchter Stunden desselben Tages.
 * - An einem Werktag wird nach Uhrzeit unterschieden: 06:00-19:00 zu 50 %
 *   (LA 3250), 19:00-22:00 zu 50 % (LA 3500), 22:00-06:00 zu 100 % (LA 3510) -
 *   Stunden vor 06:00 zählen dabei zur Nachtstunden-Kategorie des Vortags.
 * Feiertage nach lib/austrianHolidays.ts (bundesweite österreichische
 * Feiertage - gelten auch für Vorarlberg, keine gesonderten Landesfeiertage).
 * bereitsVerwendet ist nur für die Live-Vorschau relevant (siehe
 * bereitsVerwendeteFeiertagsstunden) - die serverseitige Berechnung
 * (Migration ueberstunden_berechne_aufschluesselung) ist die eigentliche
 * Quelle der Wahrheit und berücksichtigt zusätzlich fremde Meldungen.
 */
export function berechneAufschluesselung(von: Date, bis: Date, bereitsVerwendet: (tag: Date) => number = () => 0): Record<UeberstundenKategorieKey, number> {
  const result: Record<UeberstundenKategorieKey, number> = { ...LEERE_AUFSCHLUESSELUNG }
  if (!(bis > von)) return result
  let cursor = new Date(von)
  while (cursor < bis) {
    const tagesbeginn = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
    const naechsterTag = new Date(tagesbeginn.getFullYear(), tagesbeginn.getMonth(), tagesbeginn.getDate() + 1)
    const abschnittsende = bis < naechsterTag ? bis : naechsterTag
    const dauerStunden = (abschnittsende.getTime() - cursor.getTime()) / 3_600_000

    if (isSonnOderFeiertag(tagesbeginn)) {
      const verbleibend = Math.max(8 - bereitsVerwendet(tagesbeginn), 0)
      const ersten8 = Math.min(dauerStunden, verbleibend)
      result.std_sonn_100 += ersten8
      result.std_sonn_200 += dauerStunden - ersten8
    } else {
      const fenster: [number, number, UeberstundenKategorieKey][] = [
        [0, 6, 'std_22_06'], [6, 19, 'std_werktag_50'], [19, 22, 'std_19_22'], [22, 24, 'std_22_06'],
      ]
      for (const [vonStunde, bisStunde, kategorie] of fenster) {
        const fensterStart = new Date(tagesbeginn.getTime() + vonStunde * 3_600_000)
        const fensterEnde = new Date(tagesbeginn.getTime() + bisStunde * 3_600_000)
        const ueberlappStart = cursor > fensterStart ? cursor : fensterStart
        const ueberlappEnde = abschnittsende < fensterEnde ? abschnittsende : fensterEnde
        if (ueberlappEnde > ueberlappStart) result[kategorie] += (ueberlappEnde.getTime() - ueberlappStart.getTime()) / 3_600_000
      }
    }
    cursor = abschnittsende
  }
  // Auf Viertelstunden runden - wie bei der Lohnverrechnung üblich.
  for (const key of Object.keys(result) as UeberstundenKategorieKey[]) result[key] = Math.round(result[key] * 4) / 4
  return result
}

function parseZeitpunkt(datum: string, zeit: string): Date | null {
  if (!datum || !zeit) return null
  const [year, month, day] = datum.split('-').map(Number)
  const [hours, minutes] = zeit.split(':').map(Number)
  if ([year, month, day, hours, minutes].some(n => Number.isNaN(n))) return null
  return new Date(year, month - 1, day, hours, minutes)
}

// Das step=900 auf den Zeit-Inputs ist nur ein Browser-Hinweis (die Maske
// wird nicht als natives Formular abgeschickt) - vor dem Speichern wird das
// Viertelstunden-Raster deshalb explizit geprüft (siehe auch die DB-Checks
// ueberstunden_meldungen_von/bis_zeit_raster, die das serverseitig ebenfalls
// erzwingen - Grundlage für die rundungsfreie Lohnarten-Kategorisierung).
export function istViertelstundenRaster(zeit: string): boolean {
  const minuten = Number(zeit.split(':')[1])
  return !Number.isNaN(minuten) && minuten % 15 === 0
}

/**
 * Obergrenze für den Zeitraum einer einzelnen Meldung in Tagen - großzügig
 * für eine reale zusammenhängende Überstunden-Meldung, verhindert aber, dass
 * ein Tippfehler bei der Jahreszahl (z. B. "9999") die tageweise Schleife in
 * berechneAufschluesselung/ueberstunden_berechne_aufschluesselung über
 * Millionen Iterationen laufen lässt und Browser bzw. Datenbank blockiert.
 * Muss mit dem DB-CHECK ueberstunden_meldungen_zeitraum_maximal (Migration
 * Runde 15) übereinstimmen.
 */
export const MAX_MELDUNG_DAUER_TAGE = 31

/** Letzter Sonntag im März eines Jahres (Kalendertag 1-31) - Beginn der Sommerzeit in Europe/Vienna (wie in der ganzen EU). */
function letzterMaerzSonntag(jahr: number): number {
  const einunddreissigsterMaerz = new Date(jahr, 2, 31)
  return 31 - einunddreissigsterMaerz.getDay()
}

/**
 * true, wenn diese Datum/Uhrzeit-Kombination durch die Sommerzeit-Umstellung
 * in Europe/Vienna übersprungen wird (letzter Sonntag im März, 02:00-02:59
 * Uhr existiert an diesem Tag nicht - die Wanduhr springt direkt von 02:00
 * auf 03:00). Rein kalendarisch berechnet (wie lib/austrianHolidays.ts),
 * unabhängig von der Zeitzone des ausführenden Rechners/Browsers - client-
 * seitige Vorabprüfung zum serverseitigen Rundreise-Test in
 * ueberstunden_vienna_diff_hours (Migration Runde 14), die eine solche
 * Meldung ohnehin ablehnen würde, aber erst nach einem Speicherversuch.
 */
export function istUebersprungeneSommerzeitStunde(datum: string, zeit: string): boolean {
  const [jahr, monat, tag] = datum.split('-').map(Number)
  const [stunde] = zeit.split(':').map(Number)
  if ([jahr, monat, tag, stunde].some(n => Number.isNaN(n))) return false
  if (monat !== 3 || tag !== letzterMaerzSonntag(jahr)) return false
  return stunde === 2
}

/** Liefert den gültigen Zeitraum aus dem Formular, oder null solange er unvollständig/ungültig ist (bis muss nach von liegen). */
export function meldungZeitraum(form: Pick<MeldungFormState, 'vonDatum' | 'vonZeit' | 'bisDatum' | 'bisZeit'>): { von: Date; bis: Date } | null {
  const von = parseZeitpunkt(form.vonDatum, form.vonZeit)
  const bis = parseZeitpunkt(form.bisDatum, form.bisZeit)
  if (!von || !bis || !(bis > von)) return null
  return { von, bis }
}

/** "14.09.2026, 20:00 – 23:00 Uhr" bzw. bei mehrtägigem Zeitraum "14.09.2026, 20:00 Uhr – 15.09.2026, 02:00 Uhr". */
export function formatZeitraum(item: Pick<UeberstundenMeldung, 'von_datum' | 'von_zeit' | 'bis_datum' | 'bis_zeit'>): string {
  const vonDatum = new Date(`${item.von_datum}T00:00`).toLocaleDateString('de-AT')
  const vonZeit = item.von_zeit.slice(0, 5)
  const bisZeit = item.bis_zeit.slice(0, 5)
  if (item.von_datum === item.bis_datum) return `${vonDatum}, ${vonZeit} – ${bisZeit} Uhr`
  const bisDatum = new Date(`${item.bis_datum}T00:00`).toLocaleDateString('de-AT')
  return `${vonDatum}, ${vonZeit} Uhr – ${bisDatum}, ${bisZeit} Uhr`
}

export function meldungToForm(item: UeberstundenMeldung): MeldungFormState {
  return { vonDatum: item.von_datum, vonZeit: item.von_zeit.slice(0, 5), bisDatum: item.bis_datum, bisZeit: item.bis_zeit.slice(0, 5), grund: item.grund, verguetung: item.verguetung }
}

export function formToPayload(form: MeldungFormState) {
  const zeitraum = meldungZeitraum(form)
  const aufschluesselung = zeitraum ? berechneAufschluesselung(zeitraum.von, zeitraum.bis) : LEERE_AUFSCHLUESSELUNG
  return {
    von_datum: form.vonDatum, von_zeit: form.vonZeit, bis_datum: form.bisDatum, bis_zeit: form.bisZeit,
    grund: form.grund.trim(), verguetung: form.verguetung, ...aufschluesselung,
  }
}

export interface MonatsZeile {
  beamterId: string
  beamterName: string
  dienstnummer: string | null
  verguetung: UeberstundenVerguetung
  stunden: Record<UeberstundenKategorieKey, number>
  gesamt: number
}

/** Zeile aus dem RPC ueberstunden_monatsanteile (siehe Migration Runde 16) -
 * exakter, serverseitig aus der tageweisen Aufschlüsselung berechneter Anteil
 * einer genehmigten Meldung an einem bestimmten Monat. Wird für monatsgrenzen-
 * übergreifende Meldungen benötigt: eine rein client-seitige Rekonstruktion
 * aus den gespeicherten Gesamtsummen der Meldung kann die 100%/200%-Sonn-/
 * Feiertags-Aufteilung nicht exakt zurückrechnen, sobald an einem der
 * betroffenen Tage AUCH andere Meldungen desselben Beamten zum 8-Std.-Topf
 * beigetragen haben - nur die Datenbank kennt (über dieselbe Prioritäts-
 * logik wie beim ursprünglichen Speichern) die tatsächliche Tages-Aufteilung. */
export interface MonatsAnteilRow extends Record<UeberstundenKategorieKey, number> {
  meldung_id: string
  beamter_id: string
  verguetung: UeberstundenVerguetung
}

/** Baut aus den RPC-Zeilen eine Nachschlage-Map meldung_id -> Aufschlüsselung für monatsUebersicht(). */
export function monatsAnteileMap(rows: readonly MonatsAnteilRow[]): Map<string, Record<UeberstundenKategorieKey, number>> {
  const map = new Map<string, Record<UeberstundenKategorieKey, number>>()
  for (const row of rows) {
    map.set(row.meldung_id, { std_werktag_50: row.std_werktag_50, std_sonn_100: row.std_sonn_100, std_19_22: row.std_19_22, std_22_06: row.std_22_06, std_sonn_200: row.std_sonn_200 })
  }
  return map
}

/**
 * Genehmiger-Übersicht: alle genehmigten Meldungen eines Monats, je
 * Beamten/-in UND Vergütungsart zu einer Zeile aufsummiert - Grundlage für
 * die Sammelansicht zur Weiterleitung an die Lohnberechnung. Eigene Zeile je
 * Vergütungsart, damit Auszahlung und Stundenersatz nicht vermischt werden
 * (die Lohnberechnung muss unterscheiden können, welche Stunden ausbezahlt
 * und welche als Zeitausgleich zu verbuchen sind). anteile liefert je Meldung
 * den bereits exakt auf den gewählten Monat geclippten Anteil (RPC
 * ueberstunden_monatsanteile, siehe monatsAnteileMap) - eine Meldung ohne
 * Eintrag in anteile berührt den gewählten Monat nicht und wird ignoriert.
 */
export function monatsUebersicht(meldungen: readonly UeberstundenMeldung[], anteile: ReadonlyMap<string, Record<UeberstundenKategorieKey, number>>): MonatsZeile[] {
  const zeilenByKey = new Map<string, MonatsZeile>()
  for (const item of meldungen) {
    if (item.status !== 'genehmigt') continue
    const anteil = anteile.get(item.id)
    if (!anteil) continue
    const key = `${item.beamter_id}:${item.verguetung}`
    let zeile = zeilenByKey.get(key)
    if (!zeile) {
      zeile = { beamterId: item.beamter_id, beamterName: item.beamter?.name ?? '–', dienstnummer: item.beamter?.dienstnummer ?? null, verguetung: item.verguetung, stunden: { ...LEERE_AUFSCHLUESSELUNG }, gesamt: 0 }
      zeilenByKey.set(key, zeile)
    }
    for (const kat of KATEGORIEN) zeile.stunden[kat.key] += anteil[kat.key]
    zeile.gesamt += totalStunden(anteil)
  }
  return Array.from(zeilenByKey.values()).sort((a, b) => a.beamterName.localeCompare(b.beamterName, 'de-AT') || a.verguetung.localeCompare(b.verguetung))
}

export function thisMonthLocal(): string { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` }
