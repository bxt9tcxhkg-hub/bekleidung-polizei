// Gemeinsame Grundbesetzungs-Logik für Dienststellenkalender (reine
// Anzeige) und Planer-Grid (Dienstplan-Planung, Phase 3) - beide müssen
// dieselbe Vorstellung davon haben, wann Z/ID/JD als "besetzt" gelten.
import type { DienstplanKategorieDb } from './dienstplanSupabase'
import { MINDESTBESETZUNG, parseDienstCode, type GrundbesetzungCode } from './dienstplanImport'

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

/**
 * Farbe je Abwesenheits-Kategorie (vom Kommandanten vorgegeben) -
 * "dienst"/"sonstiges" bekommen keine eigene Farbe. Da eine Abwesenheit
 * ganztägig gilt (siehe abschnittFuerAnzeige), aber nur als EINE Rohzeile
 * in der Tag-Zeile gespeichert ist, braucht die Nacht-Zeile eine eigene,
 * etwas kräftigere Nuance derselben Farbe (bgNacht), damit die
 * Farbmarkierung im Planer-Grid durchgehend über Tag+Nacht sichtbar bleibt,
 * der Tag-/Nacht-Unterschied aber trotzdem erkennbar ist.
 */
export function absenzFarbe(kategorie: DienstplanKategorieDb): { bg: string; bgNacht: string; text: string } | null {
  switch (kategorie) {
    case 'urlaub':
    case 'sonderurlaub':
    case 'stundenersatz':
      return { bg: 'bg-yellow-100', bgNacht: 'bg-yellow-200', text: 'text-yellow-900' }
    case 'krank':
      return { bg: 'bg-green-100', bgNacht: 'bg-green-200', text: 'text-green-900' }
    case 'karenz':
      return { bg: 'bg-pink-100', bgNacht: 'bg-pink-200', text: 'text-pink-900' }
    default:
      return null
  }
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
