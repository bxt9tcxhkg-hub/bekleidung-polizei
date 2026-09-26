// Mindestruhezeit-Prüfung für die Dienstplan-Planung (Phase 3): wird für
// jede Person separat über alle Diensteinträge (kategorie "dienst") eines
// Monats geprüft - der Abstand zwischen Dienstende und dem Beginn des
// nächsten Dienstes muss mindestens dienstplan_regeln.mindestruhezeit_stunden
// betragen. Reine, clientseitige Live-Warnung im Planer-Grid; keine
// serverseitige Durchsetzung (der Planer kann bewusst abweichen, z. B. bei
// Personalnot).
import { dienstZeitraumMitNachtdienstDefault } from './dienstplanAuswertung'
import type { DienstplanKategorieDb } from './dienstplanSupabase'

export interface DienstFuerRuhezeitpruefung {
  beamterId: string
  datum: string
  vonZeit: string | null
  bisZeit: string | null
  kategorie: DienstplanKategorieDb
}

/** Schlüssel `beamterId|datum` jener Diensteinträge, die die Mindestruhezeit zum unmittelbar vorangegangenen Dienst derselben Person unterschreiten. */
export function ruhezeitVerletzungen(dienste: readonly DienstFuerRuhezeitpruefung[], mindestruhezeitStunden: number): Set<string> {
  const proPerson = new Map<string, DienstFuerRuhezeitpruefung[]>()
  for (const eintrag of dienste) {
    if (eintrag.kategorie !== 'dienst') continue
    const liste = proPerson.get(eintrag.beamterId) ?? []
    liste.push(eintrag)
    proPerson.set(eintrag.beamterId, liste)
  }

  const verletzungen = new Set<string>()
  for (const liste of proPerson.values()) {
    const zeitraeume = liste
      .map(eintrag => ({ eintrag, zeitraum: dienstZeitraumMitNachtdienstDefault({ datum: eintrag.datum, von_zeit: eintrag.vonZeit, bis_zeit: eintrag.bisZeit }) }))
      .filter((wert): wert is { eintrag: DienstFuerRuhezeitpruefung; zeitraum: { von: Date; bis: Date } } => wert.zeitraum !== null)
      .sort((a, b) => a.zeitraum.von.getTime() - b.zeitraum.von.getTime())

    for (let index = 1; index < zeitraeume.length; index++) {
      // Zwei Zeilen desselben Tages (z. B. Z 08-19 gefolgt von einem direkt
      // anschließenden Zusatzdienst) sind ein durchgehender Arbeitsblock,
      // keine getrennten Dienste mit Ruhezeit dazwischen - nur der Abstand
      // zwischen unterschiedlichen Tagen wird geprüft.
      if (zeitraeume[index].eintrag.datum === zeitraeume[index - 1].eintrag.datum) continue
      const ruheStunden = (zeitraeume[index].zeitraum.von.getTime() - zeitraeume[index - 1].zeitraum.bis.getTime()) / 3_600_000
      if (ruheStunden < mindestruhezeitStunden) verletzungen.add(`${zeitraeume[index].eintrag.beamterId}|${zeitraeume[index].eintrag.datum}`)
    }
  }
  return verletzungen
}
