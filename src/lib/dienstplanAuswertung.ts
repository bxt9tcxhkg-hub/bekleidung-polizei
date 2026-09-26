/**
 * Persönliche Stunden-Übersicht aus den importierten Dienstplan-Rohdaten
 * (siehe dienstplanSupabase.ts/dienstplanImport.ts) - wertet nur Einträge mit
 * Kategorie "dienst" aus (krank/Urlaub/Sonderurlaub/Karenz haben keine
 * Dauer). Fehlt bei einem Dienst die Uhrzeit, ist das laut Kommandant ein
 * Nachtdienst und zählt mit dem Standardzeitraum 19:00-08:00 Uhr (siehe
 * dienstZeitraumMitNachtdienstDefault).
 *
 * BEWUSST KEINE Lohnart-/Überstunden-Kategorisierung (das 50%/100%/200%-
 * Schema aus lib/ueberstunden.ts ist für die Überstundenmeldung gedacht, wo
 * jede erfasste Stunde per Definition bereits eine gemeldete Überstunde
 * ist) - hier fließt der GESAMTE geplante Dienst aus dem Dienstplan ein,
 * das als "Überstunden an Werktagen" o. Ä. zu labeln wäre irreführend
 * (macht normale Diensstunden fälschlich zu Überstunden). Stattdessen nur
 * eine rein informative Aufschlüsselung: Gesamt, Sonn-/Feiertagsstunden
 * (ganzer Kalendertag zählt, wie bei berechneAufschluesselung) sowie
 * Tag-/Nachtstunden (06-19 Uhr bzw. 19-06 Uhr, unabhängig vom Sonn-Status -
 * eine Sonntags-Tagesstunde zählt also sowohl zu Sonn-/Feiertag als auch zu
 * Tag). Tag-/Nachtdienst dauern laut Kommandant regulär 08-19 bzw. 19-08
 * Uhr - das sind die Grenzen für die Tag-/Nacht-Aufteilung. Echte
 * Überstunden bleiben allein Sache des eigenständigen Melde-/
 * Genehmigungsworkflows in Ueberstunden.tsx.
 */
import { isSonnOderFeiertag } from './austrianHolidays'
import { tagOderNacht } from './dienstplanBesetzung'
import { grundbesetzungCode, parseDienstCode } from './dienstplanImport'
import type { DienstplanKategorieDb } from './dienstplanSupabase'

export interface DienstplanDienstZeile {
  datum: string
  von_zeit: string | null
  bis_zeit: string | null
  kategorie: DienstplanKategorieDb
}

/** Baut aus Datum + Uhrzeiten einen Date-Zeitraum - ein Dienst, dessen Ende vor (oder gleich) dem Beginn liegt, geht über Mitternacht (z. B. 22-06). */
export function dienstZeitraum(zeile: Pick<DienstplanDienstZeile, 'datum' | 'von_zeit' | 'bis_zeit'>): { von: Date; bis: Date } | null {
  if (!zeile.von_zeit || !zeile.bis_zeit) return null
  const [jahr, monat, tag] = zeile.datum.split('-').map(Number)
  const [vonStunde, vonMinute] = zeile.von_zeit.split(':').map(Number)
  const [bisStunde, bisMinute] = zeile.bis_zeit.split(':').map(Number)
  if ([jahr, monat, tag, vonStunde, vonMinute, bisStunde, bisMinute].some(n => Number.isNaN(n))) return null
  const von = new Date(jahr, monat - 1, tag, vonStunde, vonMinute)
  let bis = new Date(jahr, monat - 1, tag, bisStunde, bisMinute)
  if (bis <= von) bis = new Date(jahr, monat - 1, tag + 1, bisStunde, bisMinute)
  return { von, bis }
}

/** Nachtdienste stehen in der Vorlage ohne Uhrzeit in der Zelle - laut Kommandant dauern sie regulär von 19:00 bis 08:00 Uhr des Folgetags. */
export const NACHTDIENST_VON = '19:00'
export const NACHTDIENST_BIS = '08:00'

/** dienstZeitraum() mit dem Nachtdienst-Standardzeitraum, wenn die Zeile keine Uhrzeit hat (nur sinnvoll für kategorie "dienst" - krank/Urlaub/Sonderurlaub/Karenz haben bewusst keine Dauer). */
export function dienstZeitraumMitNachtdienstDefault(zeile: Pick<DienstplanDienstZeile, 'datum' | 'von_zeit' | 'bis_zeit'>): { von: Date; bis: Date } | null {
  if (zeile.von_zeit && zeile.bis_zeit) return dienstZeitraum(zeile)
  return dienstZeitraum({ datum: zeile.datum, von_zeit: NACHTDIENST_VON, bis_zeit: NACHTDIENST_BIS })
}

/** Tagdienst dauert laut Kommandant regulär 08-19 Uhr, Nachtdienst 19-08 Uhr - das sind die Grenzen für die Tag-/Nacht-Aufteilung. */
const TAGDIENST_BEGINN_STUNDE = 8
const TAGDIENST_ENDE_STUNDE = 19

/**
 * Zerlegt [von, bis) tageweise (wie berechneAufschluesselung in
 * lib/ueberstunden.ts) und liefert je Abschnitt die Tagesstunden sowie den
 * Anteil davon, der auf 08:00-19:00 Uhr fällt (Rest = Nachtstunden) und ob
 * der Kalendertag ein Sonn-/Feiertag ist.
 */
function tagesAbschnitte(von: Date, bis: Date): { tagStunden: number; nachtStunden: number; istSonnFeiertag: boolean; dauer: number }[] {
  const ergebnis: { tagStunden: number; nachtStunden: number; istSonnFeiertag: boolean; dauer: number }[] = []
  let cursor = new Date(von)
  while (cursor < bis) {
    const tagesbeginn = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
    const naechsterTag = new Date(tagesbeginn.getFullYear(), tagesbeginn.getMonth(), tagesbeginn.getDate() + 1)
    const abschnittsende = bis < naechsterTag ? bis : naechsterTag
    const dauer = (abschnittsende.getTime() - cursor.getTime()) / 3_600_000

    const tagBeginn = new Date(tagesbeginn.getTime() + TAGDIENST_BEGINN_STUNDE * 3_600_000)
    const tagEnde = new Date(tagesbeginn.getTime() + TAGDIENST_ENDE_STUNDE * 3_600_000)
    const tagUeberlappStart = cursor > tagBeginn ? cursor : tagBeginn
    const tagUeberlappEnde = abschnittsende < tagEnde ? abschnittsende : tagEnde
    const tagStunden = Math.max(0, (tagUeberlappEnde.getTime() - tagUeberlappStart.getTime()) / 3_600_000)

    ergebnis.push({ tagStunden, nachtStunden: dauer - tagStunden, istSonnFeiertag: isSonnOderFeiertag(tagesbeginn), dauer })
    cursor = abschnittsende
  }
  return ergebnis
}

export interface PersoenlicheStundenUebersicht {
  gesamt: number
  sonnFeiertag: number
  tag: number
  nacht: number
}

/** Rundet auf Viertelstunden - wie bei der Lohnverrechnung üblich (siehe lib/ueberstunden.ts). */
function rundeViertelstunde(wert: number): number { return Math.round(wert * 4) / 4 }

export function persoenlicheStundenUebersicht(dienste: readonly DienstplanDienstZeile[]): PersoenlicheStundenUebersicht {
  let gesamt = 0, sonnFeiertag = 0, tag = 0, nacht = 0
  for (const zeile of dienste) {
    if (zeile.kategorie !== 'dienst') continue
    const zeitraum = dienstZeitraumMitNachtdienstDefault(zeile)
    if (!zeitraum) continue
    for (const abschnitt of tagesAbschnitte(zeitraum.von, zeitraum.bis)) {
      gesamt += abschnitt.dauer
      tag += abschnitt.tagStunden
      nacht += abschnitt.nachtStunden
      if (abschnitt.istSonnFeiertag) sonnFeiertag += abschnitt.dauer
    }
  }
  return { gesamt: rundeViertelstunde(gesamt), sonnFeiertag: rundeViertelstunde(sonnFeiertag), tag: rundeViertelstunde(tag), nacht: rundeViertelstunde(nacht) }
}

export interface DienstartenZaehlung { grundTag: number; grundNacht: number; zusatzTag: number; zusatzNacht: number }

/**
 * Zählt Diensteinträge (kategorie "dienst") für die Dienstplan-Auswertung
 * (unterhalb des Planer-Grids) nach zwei Achsen: Grundbesetzung (Z/ID/JD,
 * siehe grundbesetzungCode) vs. Zusatzdienst, sowie Tag- vs. Nachtdienst
 * (nach der Uhrzeit klassifiziert, siehe tagOderNacht - dieselbe
 * Zuordnung wie im Planer-Grid und Dienststellenkalender). Anders als
 * persoenlicheStundenUebersicht() geht es hier NICHT um Stunden, sondern
 * um die Anzahl der Diensteinheiten je Art.
 */
export function zaehleDienstarten(dienste: readonly { rohtext: string; von_zeit: string | null; kategorie: DienstplanKategorieDb }[]): DienstartenZaehlung {
  const ergebnis: DienstartenZaehlung = { grundTag: 0, grundNacht: 0, zusatzTag: 0, zusatzNacht: 0 }
  for (const zeile of dienste) {
    if (zeile.kategorie !== 'dienst') continue
    const { code } = parseDienstCode(zeile.rohtext)
    const istGrunddienst = grundbesetzungCode(code) !== null
    const abschnitt = tagOderNacht(zeile.von_zeit)
    if (istGrunddienst && abschnitt === 'tag') ergebnis.grundTag++
    else if (istGrunddienst) ergebnis.grundNacht++
    else if (abschnitt === 'tag') ergebnis.zusatzTag++
    else ergebnis.zusatzNacht++
  }
  return ergebnis
}
