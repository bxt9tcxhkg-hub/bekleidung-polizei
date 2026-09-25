/**
 * Persönliche Stunden-Übersicht aus den importierten Dienstplan-Rohdaten
 * (siehe dienstplanSupabase.ts/dienstplanImport.ts) - wertet nur Einträge mit
 * Kategorie "dienst" und erkennbarer Uhrzeit aus (krank/Urlaub/Sonderurlaub/
 * Karenz haben keine Dauer). Nutzt dieselbe Zeitfenster-Kategorisierung wie
 * die Überstundenmeldung (lib/ueberstunden.ts::berechneAufschluesselung),
 * daher dieselben fünf Kategorien (Werktag/19-22/22-06/Sonn 100%/Sonn 200%) -
 * das ist eine reine "wann fiel die Stunde an"-Auswertung des GEPLANTEN
 * Dienstplans, unabhängig davon, ob einzelne Stunden davon später auch als
 * Überstunde gemeldet/genehmigt werden (das bleibt der eigenständige
 * Melde-/Genehmigungsworkflow in Ueberstunden.tsx).
 */
import { berechneAufschluesselung, KATEGORIEN, type UeberstundenKategorieKey } from './ueberstunden'
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

const LEER: Record<UeberstundenKategorieKey, number> = { std_werktag_50: 0, std_sonn_100: 0, std_19_22: 0, std_22_06: 0, std_sonn_200: 0 }

export interface PersoenlicheStundenUebersicht {
  stunden: Record<UeberstundenKategorieKey, number>
  gesamt: number
}

export function persoenlicheStundenUebersicht(dienste: readonly DienstplanDienstZeile[]): PersoenlicheStundenUebersicht {
  const stunden: Record<UeberstundenKategorieKey, number> = { ...LEER }
  for (const zeile of dienste) {
    if (zeile.kategorie !== 'dienst') continue
    const zeitraum = dienstZeitraum(zeile)
    if (!zeitraum) continue
    const aufschluesselung = berechneAufschluesselung(zeitraum.von, zeitraum.bis)
    for (const kat of KATEGORIEN) stunden[kat.key] += aufschluesselung[kat.key]
  }
  const gesamt = KATEGORIEN.reduce((summe, kat) => summe + stunden[kat.key], 0)
  return { stunden, gesamt }
}
