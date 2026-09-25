// Dienstwünsche der Beamten (siehe dienstplan_wuensche): pro Tag höchstens
// ein Wunsch, nur bis zur konfigurierten Wunschfrist (dienstplan_regeln.
// wunschfrist_tage) vor Monatsbeginn änderbar. Die Deadline-Logik ist hier
// als reine Funktion nachgebildet (für die UI-Anzeige/Sperrung) - die
// eigentliche, maßgebliche Prüfung erfolgt serverseitig in den RPCs
// dienstplan_wunsch_setzen/dienstplan_wunsch_loeschen (siehe Migration
// 20260925161058_dienstplan_wuensche.sql).
import type { DienstplanWunschTyp } from './dienstplanSupabase'

export const WUNSCH_LABEL: Record<DienstplanWunschTyp, string> = {
  frei: 'Frei wünschen',
  tagdienst_bevorzugt: 'Tagdienst bevorzugt',
  nachtdienst_bevorzugt: 'Nachtdienst bevorzugt',
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
