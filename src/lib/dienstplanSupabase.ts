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
export type DienstplanKategorieDb = 'dienst' | 'krank' | 'urlaub' | 'sonderurlaub' | 'karenz' | 'sonstiges'

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
  created_at: string
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
    }
    Views: Record<string, never>
    Functions: {
      dienstplan_monat_ersetzen: { Args: { p_monat: string; p_dateiname: string; p_dienste: Record<string, unknown>[] }; Returns: string }
      dienstplan_monat_veroeffentlichen: { Args: { p_monat_id: string }; Returns: undefined }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export const dienstplanSupabase = supabase as unknown as SupabaseClient<DienstplanDatabase>
