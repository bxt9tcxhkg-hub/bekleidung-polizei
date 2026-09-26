import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Eigener, eng typisierter Client für die Dienstplan-Import-Tabellen statt
// Erweiterung des großen, handgepflegten Database-Typs in lib/types.ts -
// dort führt schon eine kleine Erweiterung (2 weitere Tabellen) zu einer für
// TypeScript zu komplexen Vereinigung (über 90 Tabellen) und lässt reihenweise
// unbeteiligte Dateien plötzlich auf "never" typprüfen. Gleiches Muster wie
// lib/verstaendigungsregeln.ts::funktionskontaktSupabase.
//
// Row-Typen bewusst als `type = {...}` statt `interface` - ein `interface` an
// dieser Stelle (Row eines Tables-Eintrags, der zusammen mit .rpc()-Functions
// im selben Database-Typ verwendet wird) bringt die generische Auflösung von
// SupabaseClient.rpc() zum Stillstand: TypeScript liefert dann für JEDEN
// rpc()-Aufruf (auch für andere Funktionen) einen Args-Typ von `undefined`,
// ohne Fehlermeldung zur eigentlichen Ursache - ein isoliert nachgestelltes
// Minimalbeispiel hat das bestätigt (interface -> Fehler, identisches `type` -> kein Fehler).

export type DienstplanMonatStatus = 'entwurf' | 'veroeffentlicht'
export type DienstplanKategorieDb = 'dienst' | 'krank' | 'urlaub' | 'sonderurlaub' | 'karenz' | 'stundenersatz' | 'sonstiges'
/** Kategorien einer dienstplan_markierungen-Zeile: die fünf Abwesenheitskategorien (siehe DienstplanKategorieDb) plus 'wochenende_feiertag' (Wochenende/Feiertag-Hintergrundfarbe, keine Diensteintrag-Kategorie). */
export type DienstplanMarkierungKategorie = DienstplanKategorieDb | 'wochenende_feiertag'

export type DienstplanSpalteRow = {
  id: string
  spaltenname: string
  beamter_id: string | null
  immer_aktiv: boolean
  notiz: string | null
  updated_by: string | null
  updated_at: string
}

export type DienstplanMonatRow = {
  id: string
  monat: string
  dateiname: string
  status: DienstplanMonatStatus
  hochgeladen_von: string | null
  hochgeladen_at: string
  veroeffentlicht_von: string | null
  veroeffentlicht_at: string | null
  /** Aus einer Textbox der Vorlage extrahiert (siehe lib/dienstplanImport.ts::extrahiereSollstundenEintraege), nicht aus dem Zellenraster - kann fehlen. */
  sollstunden: number | null
}

export type DienstplanDienstRow = {
  id: string
  dienstplan_monat_id: string
  beamter_id: string
  datum: string
  zeile: 1 | 2
  rohtext: string
  von_zeit: string | null
  bis_zeit: string | null
  kategorie: DienstplanKategorieDb
  /** Freie, vom Planer definierte Farbmarkierung (siehe dienstplan_markierungen) - rein visuell, unabhängig von kategorie. */
  markierung_id: string | null
  created_at: string
}

export type DienstplanMarkierungRow = {
  id: string
  name: string
  farbe: string
  /** Bindet diese Markierung als "System"-Eintrag an eine Abwesenheitskategorie oder an Wochenende/Feiertag - Name/Bedeutung bleiben dann fix, nur die Farbe ist änderbar. null = frei definierte Markierung (z. B. "Überstunden"). */
  kategorie: DienstplanMarkierungKategorie | null
  reihenfolge: number
  updated_by: string | null
  updated_at: string
}

export type DienstplanRegelRow = {
  id: number
  stunden_pro_werktag: number
  mindestruhezeit_stunden: number
  wunschfrist_tage: number
  /** Vom Genehmiger freigegebener Monat für das Einreichen von Freiplanungswünschen ('YYYY-MM-01') - null heißt: aktuell kein Monat offen. */
  offener_wunsch_monat: string | null
  /** Standard-Monat, den Dienstplan-Planung/Dienststellenkalender/Meine Dienste beim Öffnen anzeigen - freie Navigation zu anderen Monaten bleibt möglich. */
  aktueller_planungsmonat: string | null
  updated_by: string | null
  updated_at: string
}

export type DienstplanPersonEinstellungenRow = {
  beamter_id: string
  beschaeftigungsgrad: number
  zusatz: Record<string, unknown>
  updated_by: string | null
  updated_at: string
}

export type DienstplanWunschTyp = 'frei_tag' | 'frei_nacht' | 'urlaub' | 'gerichtsverhandlung' | 'schulverkehrserziehung' | 'personalvertretung'

export type DienstplanWunschRow = {
  id: string
  beamter_id: string
  monat: string
  datum: string
  wunsch: DienstplanWunschTyp
  notiz: string | null
  von_zeit: string | null
  bis_zeit: string | null
  erstellt_at: string
}

export type DienstplanTauschStatus = 'offen' | 'genehmigt' | 'abgelehnt' | 'zurueckgezogen'

export type DienstplanTauschantragRow = {
  id: string
  dienstplan_monat_id: string
  ursprung_beamter_id: string
  ursprung_datum: string
  ursprung_zeile: 1 | 2
  ziel_beamter_id: string
  ziel_datum: string
  ziel_zeile: 1 | 2
  status: DienstplanTauschStatus
  notiz: string | null
  beantragt_von: string
  beantragt_at: string
  entschieden_von: string | null
  entschieden_at: string | null
  entscheidung_notiz: string | null
}

type DienstplanDatabase = {
  public: {
    Tables: {
      dienstplan_spalten: {
        Row: DienstplanSpalteRow
        Insert: Pick<DienstplanSpalteRow, 'spaltenname'> & Partial<Omit<DienstplanSpalteRow, 'id' | 'spaltenname' | 'updated_at'>>
        Update: Partial<Omit<DienstplanSpalteRow, 'id' | 'updated_at'>>
        Relationships: []
      }
      dienstplan_monate: {
        Row: DienstplanMonatRow
        Insert: Pick<DienstplanMonatRow, 'monat' | 'dateiname'> & Partial<Omit<DienstplanMonatRow, 'id' | 'monat' | 'dateiname'>>
        Update: Partial<Omit<DienstplanMonatRow, 'id'>>
        Relationships: []
      }
      dienstplan_dienste: {
        Row: DienstplanDienstRow
        Insert: Omit<DienstplanDienstRow, 'id' | 'created_at'>
        Update: Partial<Omit<DienstplanDienstRow, 'id'>>
        Relationships: []
      }
      dienstplan_regeln: {
        Row: DienstplanRegelRow
        Insert: Pick<DienstplanRegelRow, 'id'> & Partial<Omit<DienstplanRegelRow, 'id' | 'updated_at'>>
        Update: Partial<Omit<DienstplanRegelRow, 'id' | 'updated_at'>>
        Relationships: []
      }
      dienstplan_person_einstellungen: {
        Row: DienstplanPersonEinstellungenRow
        Insert: Pick<DienstplanPersonEinstellungenRow, 'beamter_id'> & Partial<Omit<DienstplanPersonEinstellungenRow, 'beamter_id' | 'updated_at'>>
        Update: Partial<Omit<DienstplanPersonEinstellungenRow, 'beamter_id' | 'updated_at'>>
        Relationships: []
      }
      dienstplan_wuensche: {
        Row: DienstplanWunschRow
        Insert: Omit<DienstplanWunschRow, 'id' | 'erstellt_at'>
        Update: Partial<Omit<DienstplanWunschRow, 'id'>>
        Relationships: []
      }
      dienstplan_tauschantraege: {
        Row: DienstplanTauschantragRow
        Insert: Omit<DienstplanTauschantragRow, 'id' | 'beantragt_at'>
        Update: Partial<Omit<DienstplanTauschantragRow, 'id'>>
        Relationships: []
      }
      dienstplan_markierungen: {
        Row: DienstplanMarkierungRow
        Insert: Pick<DienstplanMarkierungRow, 'name' | 'farbe'> & Partial<Omit<DienstplanMarkierungRow, 'id' | 'name' | 'farbe' | 'updated_at'>>
        Update: Partial<Omit<DienstplanMarkierungRow, 'id'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      dienstplan_monat_ersetzen: { Args: { p_monat: string; p_dateiname: string; p_dienste: Record<string, unknown>[] }; Returns: string }
      dienstplan_monat_veroeffentlichen: { Args: { p_monat_id: string }; Returns: undefined }
      dienstplan_monat_anlegen: { Args: { p_monat: string; p_dateiname?: string }; Returns: string }
      dienstplan_dienst_setzen: {
        Args: {
          p_monat_id: string
          p_beamter_id: string
          p_datum: string
          p_zeile: 1 | 2
          p_rohtext: string
          p_von_zeit: string
          p_bis_zeit: string
          p_kategorie: DienstplanKategorieDb
          p_markierung_id?: string | null
        }
        Returns: undefined
      }
      dienstplan_dienst_loeschen: { Args: { p_monat_id: string; p_beamter_id: string; p_datum: string; p_zeile: 1 | 2 }; Returns: undefined }
      dienstplan_wunsch_setzen: { Args: { p_monat: string; p_datum: string; p_wunsch: DienstplanWunschTyp; p_notiz?: string | null; p_von_zeit?: string | null; p_bis_zeit?: string | null }; Returns: undefined }
      dienstplan_wunsch_loeschen: { Args: { p_monat: string; p_datum: string; p_wunsch: DienstplanWunschTyp }; Returns: undefined }
      dienstplan_tauschantrag_erstellen: {
        Args: { p_ursprung_datum: string; p_ursprung_zeile: 1 | 2; p_ziel_beamter_id: string; p_ziel_datum: string; p_ziel_zeile: 1 | 2; p_notiz?: string | null }
        Returns: string
      }
      dienstplan_tauschantrag_zurueckziehen: { Args: { p_id: string }; Returns: undefined }
      dienstplan_tauschantrag_entscheiden: { Args: { p_id: string; p_genehmigt: boolean; p_notiz?: string | null }; Returns: undefined }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export const dienstplanSupabase = supabase as unknown as SupabaseClient<DienstplanDatabase>
