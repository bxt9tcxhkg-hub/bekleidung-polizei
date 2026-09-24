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
