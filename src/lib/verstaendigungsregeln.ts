import { supabase } from './supabase'
import type { EreignisVerstaendigungsschritt, Verstaendigungsregel, ZentraleKontakt, KontaktTelefonArt } from './types'

export async function ladeVerstaendigungsregeln(): Promise<Verstaendigungsregel[]> {
  const { data, error } = await supabase.from('verstaendigungsregeln').select('*').order('sortierung').order('bezeichnung')
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
