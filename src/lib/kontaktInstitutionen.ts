import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type KontaktInstitution = {
  name: string
  created_by: string | null
  created_at: string
}

type KontaktInstitutionDatabase = {
  public: {
    Tables: {
      zentrale_kontakt_institutionen: {
        Row: KontaktInstitution
        Insert: Pick<KontaktInstitution, 'name'> & Partial<Pick<KontaktInstitution, 'created_by' | 'created_at'>>
        Update: Partial<Pick<KontaktInstitution, 'name'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export const kontaktInstitutionSupabase = supabase as unknown as SupabaseClient<KontaktInstitutionDatabase>

export async function ladeKontaktInstitutionen(): Promise<KontaktInstitution[]> {
  const { data, error } = await kontaktInstitutionSupabase
    .from('zentrale_kontakt_institutionen')
    .select('*')
    .order('name')
  if (error) throw error
  return data ?? []
}
