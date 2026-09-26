// Gemeinsame Grundbesetzungs-Logik für Dienststellenkalender (reine
// Anzeige) und Planer-Grid (Dienstplan-Planung, Phase 3) - beide müssen
// dieselbe Vorstellung davon haben, wann Z/ID/JD als "besetzt" gelten.
import type { DienstplanKategorieDb } from './dienstplanSupabase'
import { MINDESTBESETZUNG, parseDienstCode, type GrundbesetzungCode } from './dienstplanImport'
import { istWerktag } from './dienstplanSollstunden'

/** Tagdienst 08-19 Uhr, Nachtdienst 19-08 Uhr (siehe lib/dienstplanAuswertung.ts) - hier zur Einteilung Tagdienste/Nachtdienste in Kalender und Planung. */
export function tagOderNacht(vonZeit: string | null): 'tag' | 'nacht' {
  if (!vonZeit) return 'nacht'
  const stunde = Number(vonZeit.split(':')[0])
  return stunde >= 5 && stunde < 19 ? 'tag' : 'nacht'
}

/** Grundbesetzung wird laut Kommandant fix vorne gereiht, danach VD/ZIV und Bhf, der Rest alphabetisch. Z/ID/JD werden immer angezeigt (auch "nicht besetzt"). */
export const KACHEL_REIHENFOLGE = ['Z', 'ID', 'JD', 'VD/ZIV', 'BHF']
export const KACHEL_IMMER_SICHTBAR = ['Z', 'ID', 'JD']

export function kachelRang(code: string): number {
  const index = KACHEL_REIHENFOLGE.indexOf(code.toUpperCase())
  return index === -1 ? KACHEL_REIHENFOLGE.length : index
}

/** Ganztägige Abwesenheiten (alles außer "dienst") haben keine Uhrzeit und damit auch keinen Tag-/Nachtbezug - sie werden laut Kommandant immer in der Tag-Zeile angezeigt statt (wie ein zeitloser Dienst) fälschlich in der Nacht-Zeile zu landen. */
export function abschnittFuerAnzeige(zeile: { kategorie: DienstplanKategorieDb; von_zeit: string | null }): 'tag' | 'nacht' {
  if (zeile.kategorie !== 'dienst') return 'tag'
  return tagOderNacht(zeile.von_zeit)
}

/** 'YYYY-MM-DD' als lokales Datum (nicht UTC). */
function datumAusIso(datumIso: string): Date {
  const [jahr, monat, tag] = datumIso.split('-').map(Number)
  return new Date(jahr, monat - 1, tag)
}

interface AbsenzZeileMitDatum { beamter_id: string; datum: string; kategorie: DienstplanKategorieDb }

/**
 * Abwesenheiten (Urlaub/Krank/Sonderurlaub/Karenz/Stundenersatz) werden
 * laut Kommandant nur an Werktagen als eigene Rohzeile gespeichert -
 * Wochenenden/Feiertage werden beim Eintragen bewusst übersprungen (siehe
 * wendeKuerzelAufZellenAn in DienstplanPlanung.tsx), weil sie weder
 * Sollstunden noch einen Eintrag brauchen. Wer aber DURCHGEHEND abwesend
 * ist (z. B. Freitag UND der folgende Montag "krank"), soll das
 * dazwischenliegende Wochenende farblich auch als "krank" sehen, statt
 * fälschlich wie ein normales freies Wochenende auszusehen. Diese
 * Funktion füllt daher für jede Person und jeden Tag OHNE echten
 * Abwesenheits-Eintrag, der KEIN Werktag ist, die Kategorie auf, wenn die
 * letzte Abwesenheit davor und die nächste danach (jeweils ohne einen
 * dazwischenliegenden Werktag ohne Abwesenheit) übereinstimmen. Reine
 * Anzeige-Hilfsfunktion - es werden keine echten Diensteinträge erzeugt.
 */
export function effektiveAbwesenheitJeTag(dienste: readonly AbsenzZeileMitDatum[], beamterIds: readonly string[], tage: readonly string[]): Map<string, DienstplanKategorieDb> {
  const absenzByPersonUndTag = new Map<string, DienstplanKategorieDb>()
  for (const zeile of dienste) {
    if (zeile.kategorie === 'dienst') continue
    absenzByPersonUndTag.set(`${zeile.beamter_id}|${zeile.datum}`, zeile.kategorie)
  }

  const ergebnis = new Map<string, DienstplanKategorieDb>()
  for (const beamterId of beamterIds) {
    const vorwaertsProTag: (DienstplanKategorieDb | null)[] = []
    let vorwaerts: DienstplanKategorieDb | null = null
    for (const datum of tage) {
      const echte = absenzByPersonUndTag.get(`${beamterId}|${datum}`)
      if (echte) vorwaerts = echte
      else if (istWerktag(datumAusIso(datum))) vorwaerts = null
      vorwaertsProTag.push(vorwaerts)
    }

    let rueckwaerts: DienstplanKategorieDb | null = null
    for (let index = tage.length - 1; index >= 0; index--) {
      const datum = tage[index]
      const echte = absenzByPersonUndTag.get(`${beamterId}|${datum}`)
      if (echte) rueckwaerts = echte
      else if (istWerktag(datumAusIso(datum))) rueckwaerts = null
      else {
        const vor = vorwaertsProTag[index]
        if (vor && vor === rueckwaerts) ergebnis.set(`${beamterId}|${datum}`, vor)
      }
    }
  }
  return ergebnis
}

interface DienstZeileMitCode { datum: string; rohtext: string; von_zeit: string | null; kategorie: DienstplanKategorieDb }

/**
 * Für jeden übergebenen Tag: welche Grundbesetzungs-Kürzel (Z/ID/JD) weder
 * tagsüber noch nachts ihre Mindestbesetzung (siehe MINDESTBESETZUNG - 1x
 * Zentrale, 1x Innendienst, 2x Journaldienst) erreichen (z. B. "Z (Nacht)"
 * bzw. bei Codes mit Mindestbesetzung > 1 "JD 1/2 (Tag)"). Grundlage für
 * die Live-Warnung im Planer-Grid und die "nicht besetzt"-Kacheln im
 * Dienststellenkalender.
 */
export function fehlendeGrundbesetzung(dienste: readonly DienstZeileMitCode[], tage: readonly string[]): Map<string, string[]> {
  const besetztAnzahl = new Map<string, number>()
  for (const zeile of dienste) {
    if (zeile.kategorie !== 'dienst') continue
    const { code } = parseDienstCode(zeile.rohtext)
    const schluessel = code.toUpperCase()
    if (!KACHEL_IMMER_SICHTBAR.includes(schluessel)) continue
    const key = `${zeile.datum}|${tagOderNacht(zeile.von_zeit)}|${schluessel}`
    besetztAnzahl.set(key, (besetztAnzahl.get(key) ?? 0) + 1)
  }
  const ergebnis = new Map<string, string[]>()
  for (const datum of tage) {
    const fehlend: string[] = []
    for (const abschnitt of ['tag', 'nacht'] as const) {
      for (const code of KACHEL_IMMER_SICHTBAR) {
        const erforderlich = MINDESTBESETZUNG[code as GrundbesetzungCode] ?? 1
        const vorhanden = besetztAnzahl.get(`${datum}|${abschnitt}|${code}`) ?? 0
        if (vorhanden < erforderlich) {
          const mengenHinweis = erforderlich > 1 ? ` ${vorhanden}/${erforderlich}` : ''
          fehlend.push(`${code}${mengenHinweis} (${abschnitt === 'tag' ? 'Tag' : 'Nacht'})`)
        }
      }
    }
    if (fehlend.length > 0) ergebnis.set(datum, fehlend)
  }
  return ergebnis
}
