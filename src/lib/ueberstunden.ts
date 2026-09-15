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

/** [Beginn, Ende) als Date für einen "YYYY-MM"-String. */
function monatsGrenzen(monat: string): { beginn: Date; ende: Date } {
  const [jahr, monatNr] = monat.split('-').map(Number)
  return { beginn: new Date(jahr, monatNr - 1, 1), ende: new Date(jahr, monatNr, 1) }
}

/**
 * Wie berechneAufschluesselung, aber ohne 100%/200%-Aufteilung an Sonn-/
 * Feiertagen (reine Zeitfenster-Zerlegung, unabhängig vom Feiertags-Topf) -
 * Sonn-/Feiertagsstunden werden hier je Kalendertag geführt (Map: Tagesbeginn
 * in ms -> Stunden), nicht als eine einzige Gesamtsumme, damit die 8-Std.-
 * Schwelle für die monatsweise Aufteilung (siehe anteilFuerMonat) pro Tag
 * statt über mehrere Sonn-/Feiertage hinweg verrechnet werden kann - sonst
 * würde ein Zeitraum, der zwei unabhängige Sonn-/Feiertage überspannt (z. B.
 * Sonntag-Abend bis Feiertag-Nacht am Monatsersten), die beiden getrennten
 * 8-Std.-Schwellen zu einer gemeinsamen vermischen.
 */
function rohStundenOhneFeiertagssplit(von: Date, bis: Date): { std_werktag_50: number; std_19_22: number; std_22_06: number; sonnProTag: Map<number, number> } {
  const result = { std_werktag_50: 0, std_19_22: 0, std_22_06: 0, sonnProTag: new Map<number, number>() }
  if (!(bis > von)) return result
  let cursor = new Date(von)
  while (cursor < bis) {
    const tagesbeginn = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
    const naechsterTag = new Date(tagesbeginn.getFullYear(), tagesbeginn.getMonth(), tagesbeginn.getDate() + 1)
    const abschnittsende = bis < naechsterTag ? bis : naechsterTag
    const dauerStunden = (abschnittsende.getTime() - cursor.getTime()) / 3_600_000
    if (isSonnOderFeiertag(tagesbeginn)) {
      const key = tagesbeginn.getTime()
      result.sonnProTag.set(key, (result.sonnProTag.get(key) ?? 0) + dauerStunden)
    } else {
      const fenster: [number, number, 'std_werktag_50' | 'std_19_22' | 'std_22_06'][] = [
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
  return result
}

/**
 * Naive 100%/200%-Aufteilung je Sonn-/Feiertag, ausschließlich aus den
 * eigenen Stunden DIESER Meldung an diesem Tag (ohne Berücksichtigung
 * anderweitig an diesem Tag bereits verwendeter Stunden). Dient nur als
 * GEWICHT für die monatsweise Aufteilung der tatsächlich gespeicherten
 * std_sonn_100/std_sonn_200 (siehe anteilFuerMonat) - für einen Tag, an dem
 * ausschließlich diese Meldung zum Topf beiträgt, ist das Ergebnis exakt;
 * tragen mehrere Meldungen desselben Beamten zum selben Tag bei, bleibt es
 * eine Näherung (die ursprüngliche Reihenfolge ist nachträglich nicht mehr
 * rekonstruierbar), aber unverändert korrekt in der Summe über alle Monate.
 */
function naiveSonnSplit(sonnProTag: ReadonlyMap<number, number>): { naiv100: number; naiv200: number } {
  let naiv100 = 0
  let naiv200 = 0
  for (const stunden of sonnProTag.values()) {
    naiv100 += Math.min(8, stunden)
    naiv200 += Math.max(0, stunden - 8)
  }
  return { naiv100, naiv200 }
}

/**
 * Anteil der gespeicherten Aufschlüsselung einer Meldung, der auf den
 * angegebenen Monat entfällt - null, wenn die Meldung diesen Monat gar nicht
 * berührt. Der Regelfall (Zeitraum ganz in einem Monat) liefert unverändert
 * die volle gespeicherte Aufschlüsselung. Reicht der Zeitraum über eine
 * Monatsgrenze (z. B. 30.09. 23:00 - 01.10. 02:00), wird an der Grenze
 * geteilt: std_werktag_50/std_19_22/std_22_06 lassen sich rein aus der
 * Uhrzeit exakt aufteilen (Monatsgrenzen fallen immer auf Tagesgrenzen, ein
 * einzelner Kalendertag wird also nie durch die Monatsgrenze selbst
 * zerschnitten). Für die Sonn-/Feiertags-100%/200%-Schwelle ist die
 * ursprüngliche Aufteilung nachträglich nicht mehr exakt rekonstruierbar,
 * wenn an einem der betroffenen Tage AUCH andere Meldungen desselben Beamten
 * zum Topf beitrugen (siehe ueberstunden_berechne_aufschluesselung) - die
 * gespeicherten std_sonn_100/std_sonn_200 werden deshalb je Kategorie
 * getrennt im Verhältnis der naiven Tages-Aufteilung (siehe naiveSonnSplit)
 * auf die betroffenen Monate verteilt, statt beide Kategorien mit einem
 * gemeinsamen Stundenverhältnis zu vermischen - das wäre falsch, sobald zwei
 * an der Monatsgrenze benachbarte Sonn-/Feiertage (z. B. Sonntag/Feiertag am
 * Monatsersten) je eine EIGENE 8-Std.-Schwelle haben.
 */
function anteilFuerMonat(item: UeberstundenMeldung, monat: string): Record<UeberstundenKategorieKey, number> | null {
  if (item.von_datum.slice(0, 7) === item.bis_datum.slice(0, 7)) {
    if (item.von_datum.slice(0, 7) !== monat) return null
    return { std_werktag_50: item.std_werktag_50, std_19_22: item.std_19_22, std_22_06: item.std_22_06, std_sonn_100: item.std_sonn_100, std_sonn_200: item.std_sonn_200 }
  }
  const von = parseZeitpunkt(item.von_datum, item.von_zeit.slice(0, 5))
  const bis = parseZeitpunkt(item.bis_datum, item.bis_zeit.slice(0, 5))
  if (!von || !bis) return null
  const { beginn: monatsBeginn, ende: monatsEnde } = monatsGrenzen(monat)
  const clipVon = von > monatsBeginn ? von : monatsBeginn
  const clipBis = bis < monatsEnde ? bis : monatsEnde
  if (!(clipBis > clipVon)) return null
  const anteil = rohStundenOhneFeiertagssplit(clipVon, clipBis)
  const gesamt = rohStundenOhneFeiertagssplit(von, bis)
  const naivAnteil = naiveSonnSplit(anteil.sonnProTag)
  const naivGesamt = naiveSonnSplit(gesamt.sonnProTag)
  const anteil100 = naivGesamt.naiv100 > 0 ? naivAnteil.naiv100 / naivGesamt.naiv100 : 0
  const anteil200 = naivGesamt.naiv200 > 0 ? naivAnteil.naiv200 / naivGesamt.naiv200 : 0
  return {
    std_werktag_50: anteil.std_werktag_50,
    std_19_22: anteil.std_19_22,
    std_22_06: anteil.std_22_06,
    std_sonn_100: item.std_sonn_100 * anteil100,
    std_sonn_200: item.std_sonn_200 * anteil200,
  }
}

/**
 * Genehmiger-Übersicht: alle genehmigten Meldungen eines Monats, je
 * Beamten/-in UND Vergütungsart zu einer Zeile aufsummiert - Grundlage für
 * die Sammelansicht zur Weiterleitung an die Lohnberechnung. Eigene Zeile je
 * Vergütungsart, damit Auszahlung und Stundenersatz nicht vermischt werden
 * (die Lohnberechnung muss unterscheiden können, welche Stunden ausbezahlt
 * und welche als Zeitausgleich zu verbuchen sind). Eine über eine
 * Monatsgrenze reichende Meldung wird an der Grenze aufgeteilt (siehe
 * anteilFuerMonat) statt komplett dem Monat ihres von_datum zugerechnet zu
 * werden - der Aufrufer muss dafür auch Meldungen liefern, deren bis_datum
 * (nicht nur von_datum) in den gewählten Monat fällt.
 */
export function monatsUebersicht(meldungen: readonly UeberstundenMeldung[], monat: string): MonatsZeile[] {
  const zeilenByKey = new Map<string, MonatsZeile>()
  for (const item of meldungen) {
    if (item.status !== 'genehmigt') continue
    const anteil = anteilFuerMonat(item, monat)
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
