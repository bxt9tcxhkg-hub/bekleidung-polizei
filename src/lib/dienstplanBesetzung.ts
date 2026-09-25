// Gemeinsame Grundbesetzungs-Logik für Dienststellenkalender (reine
// Anzeige) und Planer-Grid (Dienstplan-Planung, Phase 3) - beide müssen
// dieselbe Vorstellung davon haben, wann Z/ID/JD als "besetzt" gelten.
import type { DienstplanKategorieDb } from './dienstplanSupabase'
import { parseDienstCode } from './dienstplanImport'

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

/** Das Kürzel "U" (Urlaub) bekommt laut Kommandant keine eigene Dienst-Kachel, sondern reiht sich wie krank/Urlaub/Sonderurlaub/Karenz in die einfache Auflistung ein. */
export function istUrlaubsKuerzel(code: string): boolean { return code.toUpperCase() === 'U' }

interface DienstZeileMitCode { datum: string; rohtext: string; von_zeit: string | null; kategorie: DienstplanKategorieDb }

/**
 * Für jeden übergebenen Tag: welche Grundbesetzungs-Kürzel (Z/ID/JD) weder
 * tagsüber noch nachts besetzt sind (z. B. "Z (Nacht)"). Grundlage für die
 * Live-Warnung im Planer-Grid und die "nicht besetzt"-Kacheln im
 * Dienststellenkalender.
 */
export function fehlendeGrundbesetzung(dienste: readonly DienstZeileMitCode[], tage: readonly string[]): Map<string, string[]> {
  const besetzt = new Set<string>()
  for (const zeile of dienste) {
    if (zeile.kategorie !== 'dienst') continue
    const { code } = parseDienstCode(zeile.rohtext)
    const schluessel = code.toUpperCase()
    if (!KACHEL_IMMER_SICHTBAR.includes(schluessel)) continue
    besetzt.add(`${zeile.datum}|${tagOderNacht(zeile.von_zeit)}|${schluessel}`)
  }
  const ergebnis = new Map<string, string[]>()
  for (const datum of tage) {
    const fehlend: string[] = []
    for (const abschnitt of ['tag', 'nacht'] as const) {
      for (const code of KACHEL_IMMER_SICHTBAR) {
        if (!besetzt.has(`${datum}|${abschnitt}|${code}`)) fehlend.push(`${code} (${abschnitt === 'tag' ? 'Tag' : 'Nacht'})`)
      }
    }
    if (fehlend.length > 0) ergebnis.set(datum, fehlend)
  }
  return ergebnis
}
