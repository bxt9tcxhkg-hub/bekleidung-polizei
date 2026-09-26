// Dienstwünsche der Beamten (siehe dienstplan_wuensche): pro Person/Tag
// können mehrere Wünsche nebeneinander stehen - ein ganzer freier Tag
// braucht laut Kommandant ZWEI Freiplanungswünsche (Tag frei + Nacht
// frei), "Urlaub" blockiert ebenfalls den ganzen Tag, kostet aber nur 1
// Kontingenteinheit. Monatliches Kontingent: 18 Freiplanungswünsche bei
// Vollzeit (Beschäftigungsgrad 111 auf der hausinternen Skala, siehe
// lib/dienstplanSollstunden.ts), linear skaliert. Zusätzliche Regel:
// höchstens 6 Tag/Nacht-Slots am Stück (chronologisch) dürfen als frei
// gewünscht werden. Beides wird bewusst nur clientseitig berechnet (siehe
// unten) - Dienstwünsche binden den Planer ohnehin nicht, nur die
// Einreichfrist wird serverseitig durchgesetzt (siehe die RPCs
// dienstplan_wunsch_setzen/dienstplan_wunsch_loeschen).
import type { DienstplanWunschTyp } from './dienstplanSupabase'
import { VOLLZEIT_BESCHAEFTIGUNGSGRAD } from './dienstplanSollstunden'

export const WUNSCH_LABEL: Record<DienstplanWunschTyp, string> = {
  frei_tag: 'Tag frei',
  frei_nacht: 'Nacht frei',
  urlaub: 'Urlaub (ganzer Tag)',
  gerichtsverhandlung: 'Gerichtsverhandlung',
  schulverkehrserziehung: 'Schulverkehrserziehung-Termin',
  personalvertretung: 'Personalvertretung-Sitzung',
}

/**
 * Gerichtsverhandlung/Schulverkehrserziehung-Termin/Personalvertretung-
 * Sitzung sind dienstliche Termine, keine Freiplanungswünsche - sie zählen
 * laut Kommandant NICHT gegen das monatliche Kontingent und nicht in die
 * "max. 6 am Stück"-Regel (siehe kontingentVerbrauch/laengsteSlotFolge
 * unten), werden dem Planer aber trotzdem am jeweiligen Tag angezeigt
 * (siehe wunschBetrifftAbschnitt in DienstplanPlanung.tsx).
 */
const KONTINGENT_TYPEN: readonly DienstplanWunschTyp[] = ['frei_tag', 'frei_nacht', 'urlaub']

const VOLLZEIT_KONTINGENT = 18

/** Monatliches Freiplanungswunsch-Kontingent, linear nach Beschäftigungsgrad skaliert und gerundet. */
export function monatsKontingent(beschaeftigungsgrad: number): number {
  return Math.round(VOLLZEIT_KONTINGENT * (beschaeftigungsgrad / VOLLZEIT_BESCHAEFTIGUNGSGRAD))
}

export interface WunschEintragKurz { datum: string; wunsch: DienstplanWunschTyp }

/** Summe der verbrauchten Kontingenteinheiten über eine Liste von Wünschen - jeder Wunsch-Typ (frei_tag/frei_nacht/urlaub) kostet 1 Einheit, dienstliche Termine (siehe KONTINGENT_TYPEN) zählen nicht mit. */
export function kontingentVerbrauch(eintraege: readonly WunschEintragKurz[]): number {
  return eintraege.filter(eintrag => KONTINGENT_TYPEN.includes(eintrag.wunsch)).length
}

type Zeitabschnitt = 'tag' | 'nacht'

/** Welche Tag/Nacht-Slots ein Wunsch belegt - Urlaub belegt beide Slots des Tages (ganztägig), kostet aber trotzdem nur 1 Kontingenteinheit (siehe kontingentVerbrauch). */
function belegteSlots(eintrag: WunschEintragKurz): { datum: string; abschnitt: Zeitabschnitt }[] {
  if (eintrag.wunsch === 'frei_tag') return [{ datum: eintrag.datum, abschnitt: 'tag' }]
  if (eintrag.wunsch === 'frei_nacht') return [{ datum: eintrag.datum, abschnitt: 'nacht' }]
  return [{ datum: eintrag.datum, abschnitt: 'tag' }, { datum: eintrag.datum, abschnitt: 'nacht' }]
}

function slotIndex(datum: string, abschnitt: Zeitabschnitt): number {
  const [jahr, monat, tag] = datum.split('-').map(Number)
  const tageSeitEpoch = Math.floor(new Date(jahr, monat - 1, tag).getTime() / 86_400_000)
  return tageSeitEpoch * 2 + (abschnitt === 'nacht' ? 1 : 0)
}

/** Längste Kette lückenlos aufeinanderfolgender belegter Tag/Nacht-Slots (siehe belegteSlots) - Grundlage für die "max. 6 am Stück"-Regel. */
export function laengsteSlotFolge(eintraege: readonly WunschEintragKurz[]): number {
  const indices = new Set<number>()
  for (const eintrag of eintraege) {
    if (!KONTINGENT_TYPEN.includes(eintrag.wunsch)) continue
    for (const slot of belegteSlots(eintrag)) indices.add(slotIndex(slot.datum, slot.abschnitt))
  }
  const sortiert = Array.from(indices).sort((a, b) => a - b)

  let laengste = 0
  let aktuelle = 0
  let vorheriger: number | null = null
  for (const index of sortiert) {
    aktuelle = vorheriger !== null && index === vorheriger + 1 ? aktuelle + 1 : 1
    laengste = Math.max(laengste, aktuelle)
    vorheriger = index
  }
  return laengste
}

/** Letzter Tag, an dem für den angegebenen Monat noch ein Wunsch eingereicht/geändert werden kann. */
export function wunschfristAblaufdatum(monatIso: string, wunschfristTage: number): Date {
  const [jahrText, monatText] = monatIso.split('-')
  const monatsbeginn = new Date(Number(jahrText), Number(monatText) - 1, 1)
  const ablauf = new Date(monatsbeginn)
  ablauf.setDate(ablauf.getDate() - wunschfristTage)
  return ablauf
}

/** Ob die Wunschfrist für den angegebenen Monat bereits verstrichen ist (heute nach dem Ablaufdatum). */
export function wunschfristAbgelaufen(monatIso: string, wunschfristTage: number, heute: Date = new Date()): boolean {
  const ablauf = wunschfristAblaufdatum(monatIso, wunschfristTage)
  const heuteOhneZeit = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate())
  return heuteOhneZeit > ablauf
}
