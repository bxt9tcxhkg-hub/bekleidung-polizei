import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type ProfilTelefonnummern = {
  user_id: string
  diensthandy: string | null
  privathandy: string | null
  updated_at: string
}

// Derselbe angemeldete Client mit kleinem Schema. Eine Erweiterung der großen
// Database-Typdatei überschreitet bei Supabase-Abfragen die TS-Rekursionstiefe.
type ProfilTelefonDatabase = {
  public: {
    Tables: {
      profile_phone_numbers: {
        Row: ProfilTelefonnummern
        Insert: Pick<ProfilTelefonnummern, 'user_id'> & Partial<Pick<ProfilTelefonnummern, 'diensthandy' | 'privathandy'>>
        Update: Partial<Pick<ProfilTelefonnummern, 'diensthandy' | 'privathandy'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export const profilTelefonClient = supabase as unknown as SupabaseClient<ProfilTelefonDatabase>

export function profilTelefonnummern(telefon: ProfilTelefonnummern | null | undefined) {
  return [
    telefon?.diensthandy?.trim() ? { art: 'Diensthandy', nummer: telefon.diensthandy.trim() } : null,
    telefon?.privathandy?.trim() ? { art: 'Privathandy', nummer: telefon.privathandy.trim() } : null,
  ].filter((row): row is { art: string; nummer: string } => row !== null)
}

export function profilNummerFuerArt(telefon: ProfilTelefonnummern | null | undefined, art: 'diensthandy' | 'privathandy' | null) {
  return art ? telefon?.[art]?.trim() || null : null
}
