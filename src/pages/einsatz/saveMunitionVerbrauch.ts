import { supabase } from '../../lib/supabase'
import {
  validateGeschossenMunition,
  type GeschossenAnswer,
  type MunitionVerbrauchInput,
} from '../../lib/einsatztraining'
import type { EinsatzTrainingSession } from '../../lib/types'

export type MunitionSessionRef = Pick<EinsatzTrainingSession, 'munition_anzahl' | 'munition_pool_id'>

export async function saveMunitionVerbrauch(input: {
  sessionId: string
  previous: MunitionSessionRef
  form: MunitionVerbrauchInput
  geschossen: GeschossenAnswer
  recordedBy: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const validated = validateGeschossenMunition({ geschossen: input.geschossen, form: input.form })
  if (!validated.ok) return validated

  const { error } = await supabase.rpc('save_training_munition', {
    p_session_id: input.sessionId,
    p_previous_pool_id: input.previous.munition_pool_id,
    p_previous_quantity: input.previous.munition_anzahl,
    p_pool_id: validated.payload.munition_pool_id,
    p_quantity: validated.payload.munition_anzahl,
    p_marke: validated.payload.munition_marke,
    p_kaliber: validated.payload.munition_kaliber,
    p_art: validated.payload.munition_art,
  })
  if (error) return { ok: false, error: error.message || 'Verbrauch konnte nicht gespeichert werden.' }
  return { ok: true }
}

export async function loadPoolMunitionChoices(): Promise<{
  ok: true
  items: {
    id: string
    marke: string | null
    typ: string | null
    art: string | null
    anzahl: number | null
    verwahrungsort: string
    lager_notiz: string | null
    removed_at: string | null
  }[]
} | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('pool_einsatzmittel')
    .select('id,marke,typ,art,anzahl,verwahrungsort,lager_notiz,removed_at')
    .eq('category', 'munition')
    .order('created_at', { ascending: false })
  if (error) return { ok: false, error: error.message || 'Pool-Munition konnte nicht geladen werden.' }
  return { ok: true, items: data ?? [] }
}
