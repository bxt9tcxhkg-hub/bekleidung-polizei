// Automatische Vorschläge für die Grundbesetzung (Z/ID/JD) im Planer-Grid
// (Phase 4, siehe /root/.claude/plans/glowing-imagining-badger.md) - ein
// heuristischer Algorithmus, KEIN vollständiger Constraint-Solver. Nach
// dieser Priorität, wie mit dem Kommandanten besprochen:
//   1. Grundbesetzung garantiert abgedeckt - jeder bisher unbesetzte
//      Z/ID/JD-Slot (Tag oder Nacht) bekommt, wenn möglich, eine Person.
//   2. Faire Rotation - unter den verfügbaren Personen wird die mit den
//      bisher wenigsten Grundbesetzungs-Diensten diesen Monat bevorzugt
//      (bereits vorhandene UND in diesem Lauf schon vergebene zählen mit).
//   3. Dienstwünsche berücksichtigen - eine Person mit widersprechendem
//      Freiplanungswunsch (frei_tag/frei_nacht/urlaub) für genau diesen
//      Slot wird nur gewählt, wenn niemand ohne Widerspruch verfügbar ist
//      (weiches Kriterium).
//   4. Mindestruhezeit einhalten - eine Zuteilung, die eine Ruhezeit-
//      Verletzung erzeugen würde (siehe lib/dienstplanRegelpruefung.ts),
//      wird nie vorgenommen (hartes Kriterium).
// Liefert nur VORSCHLÄGE (reine Funktion, keine DB-Schreibzugriffe) - der
// Planer sichtet sie im Grid und übernimmt/verwirft sie bewusst.
import { GRUNDBESETZUNG_CODES, MINDESTBESETZUNG, grundbesetzungCode, type GrundbesetzungCode } from './dienstplanImport'
import { tagOderNacht } from './dienstplanBesetzung'
import { ruhezeitVerletzungen, type DienstFuerRuhezeitpruefung } from './dienstplanRegelpruefung'
import type { DienstplanKategorieDb, DienstplanWunschTyp } from './dienstplanSupabase'

type Zeitabschnitt = 'tag' | 'nacht'

export interface VorschlagPerson { id: string; name: string }
export interface VorschlagBestehenderDienst { beamterId: string; datum: string; vonZeit: string | null; bisZeit: string | null; kategorie: DienstplanKategorieDb; code: string }
export interface VorschlagWunsch { beamterId: string; datum: string; wunsch: DienstplanWunschTyp }
export interface VorschlagEintrag { beamterId: string; datum: string; code: GrundbesetzungCode; abschnitt: Zeitabschnitt; vonZeit: string | null; bisZeit: string | null }

interface VorschlagParameter {
  mitarbeiter: readonly VorschlagPerson[]
  tage: readonly string[]
  bestehendeDienste: readonly VorschlagBestehenderDienst[]
  wuensche: readonly VorschlagWunsch[]
  mindestruhezeitStunden: number
}

function wuerdeRuhezeitVerletzen(bisherigeEintraege: readonly DienstFuerRuhezeitpruefung[], kandidat: DienstFuerRuhezeitpruefung, mindestruhezeitStunden: number): boolean {
  return ruhezeitVerletzungen([...bisherigeEintraege, kandidat], mindestruhezeitStunden).size > 0
}

export function generiereGrundbesetzungsVorschlag(parameter: VorschlagParameter): VorschlagEintrag[] {
  const { mitarbeiter, tage, bestehendeDienste, wuensche, mindestruhezeitStunden } = parameter

  const besetzterSlot = new Set<string>() // `${beamterId}|${datum}|${abschnitt}` - hat schon irgendeinen Dienst
  const abwesenderTag = new Set<string>() // `${beamterId}|${datum}` - krank/Urlaub/... an diesem Tag
  const grundbesetztAnzahl = new Map<string, number>() // `${datum}|${abschnitt}|${code}` - wie oft die Grundbesetzung schon vergeben ist (siehe MINDESTBESETZUNG, z. B. 2x JD)
  const personEintraege = new Map<string, DienstFuerRuhezeitpruefung[]>()
  const grundZaehler = new Map<string, number>()

  for (const zeile of bestehendeDienste) {
    if (zeile.kategorie !== 'dienst') { abwesenderTag.add(`${zeile.beamterId}|${zeile.datum}`); continue }
    const abschnitt = tagOderNacht(zeile.vonZeit)
    besetzterSlot.add(`${zeile.beamterId}|${zeile.datum}|${abschnitt}`)
    const liste = personEintraege.get(zeile.beamterId) ?? []
    liste.push({ beamterId: zeile.beamterId, datum: zeile.datum, vonZeit: zeile.vonZeit, bisZeit: zeile.bisZeit, kategorie: zeile.kategorie })
    personEintraege.set(zeile.beamterId, liste)
    const grund = grundbesetzungCode(zeile.code)
    if (grund) {
      const key = `${zeile.datum}|${abschnitt}|${grund}`
      grundbesetztAnzahl.set(key, (grundbesetztAnzahl.get(key) ?? 0) + 1)
      grundZaehler.set(zeile.beamterId, (grundZaehler.get(zeile.beamterId) ?? 0) + 1)
    }
  }

  const widerspruchsWunsch = new Set<string>() // `${beamterId}|${datum}|${abschnitt}`
  for (const wunsch of wuensche) {
    if (wunsch.wunsch === 'urlaub') { widerspruchsWunsch.add(`${wunsch.beamterId}|${wunsch.datum}|tag`); widerspruchsWunsch.add(`${wunsch.beamterId}|${wunsch.datum}|nacht`); continue }
    widerspruchsWunsch.add(`${wunsch.beamterId}|${wunsch.datum}|${wunsch.wunsch === 'frei_tag' ? 'tag' : 'nacht'}`)
  }

  const ergebnis: VorschlagEintrag[] = []

  for (const datum of tage) {
    for (const abschnitt of ['tag', 'nacht'] as const) {
      const vonZeit = abschnitt === 'tag' ? '08:00' : null
      const bisZeit = abschnitt === 'tag' ? '19:00' : null

      for (const code of GRUNDBESETZUNG_CODES) {
        const key = `${datum}|${abschnitt}|${code}`
        const erforderlich = MINDESTBESETZUNG[code]

        while ((grundbesetztAnzahl.get(key) ?? 0) < erforderlich) {
          const verfuegbar = (ohneWunschkonflikt: boolean) => mitarbeiter.filter(person => {
            if (besetzterSlot.has(`${person.id}|${datum}|${abschnitt}`)) return false
            if (abwesenderTag.has(`${person.id}|${datum}`)) return false
            if (ohneWunschkonflikt && widerspruchsWunsch.has(`${person.id}|${datum}|${abschnitt}`)) return false
            const kandidat: DienstFuerRuhezeitpruefung = { beamterId: person.id, datum, vonZeit, bisZeit, kategorie: 'dienst' }
            return !wuerdeRuhezeitVerletzen(personEintraege.get(person.id) ?? [], kandidat, mindestruhezeitStunden)
          })

          const kandidaten = verfuegbar(true).length > 0 ? verfuegbar(true) : verfuegbar(false)
          if (kandidaten.length === 0) break

          kandidaten.sort((a, b) => (grundZaehler.get(a.id) ?? 0) - (grundZaehler.get(b.id) ?? 0) || a.name.localeCompare(b.name, 'de-AT'))
          const gewaehlt = kandidaten[0]

          ergebnis.push({ beamterId: gewaehlt.id, datum, code, abschnitt, vonZeit, bisZeit })

          besetzterSlot.add(`${gewaehlt.id}|${datum}|${abschnitt}`)
          grundbesetztAnzahl.set(key, (grundbesetztAnzahl.get(key) ?? 0) + 1)
          grundZaehler.set(gewaehlt.id, (grundZaehler.get(gewaehlt.id) ?? 0) + 1)
          const liste = personEintraege.get(gewaehlt.id) ?? []
          liste.push({ beamterId: gewaehlt.id, datum, vonZeit, bisZeit, kategorie: 'dienst' })
          personEintraege.set(gewaehlt.id, liste)
        }
      }
    }
  }

  return ergebnis
}
