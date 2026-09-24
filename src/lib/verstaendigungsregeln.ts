import { supabase } from './supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EreignisVerstaendigungsschritt, Verstaendigungsregel, ZentraleKontakt, KontaktTelefonArt, PortalFunktionskontakt } from './types'

type FunktionskontaktDatabase = {
  public: {
    Tables: {
      portal_funktionskontakte: {
        Row: PortalFunktionskontakt
        Insert: Omit<PortalFunktionskontakt, 'updated_at'> & { updated_at?: string }
        Update: Partial<Omit<PortalFunktionskontakt, 'schluessel' | 'updated_at'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export const funktionskontaktSupabase = supabase as unknown as SupabaseClient<FunktionskontaktDatabase>

export async function ladeVerstaendigungsregeln(): Promise<Verstaendigungsregel[]> {
  const { data, error } = await supabase.from('verstaendigungsregeln').select('*').order('sortierung').order('bezeichnung')
  if (error) throw error
  return data ?? []
}

export async function ladeFunktionskontakte(): Promise<PortalFunktionskontakt[]> {
  const { data, error } = await funktionskontaktSupabase.from('portal_funktionskontakte').select('*').order('sortierung').order('bezeichnung')
  if (error) throw error
  return data ?? []
}

export async function ladeEreignisschritte(ereignisId: string): Promise<EreignisVerstaendigungsschritt[]> {
  const { data, error } = await supabase.from('ereignis_verstaendigungsschritte').select('*').eq('ereignis_id', ereignisId).order('sortierung').order('bezeichnung')
  if (error) throw error
  return data ?? []
}

export function nummerFuerArt(kontakt: ZentraleKontakt, art: KontaktTelefonArt | null): string | null {
  if (!art) return null
  const feld = { buero: 'telefon_buero', diensthandy: 'telefon_diensthandy', privathandy: 'telefon_privathandy', weitere: 'telefon' } as const
  return kontakt[feld[art]]?.trim() || null
}

export const TELEFON_ARTEN = [
  { id: 'buero', label: 'Büro' },
  { id: 'diensthandy', label: 'Diensthandy' },
  { id: 'privathandy', label: 'Privathandy' },
  { id: 'weitere', label: 'Weitere Nummer' },
] as const
