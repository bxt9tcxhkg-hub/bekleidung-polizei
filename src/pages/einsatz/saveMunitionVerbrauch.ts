import { supabase } from '../../lib/supabase'
import {
  planPoolMunitionAdjustments,
  validateMunitionVerbrauch,
  withMunitionRecordedBy,
  type MunitionVerbrauchInput,
} from '../../lib/einsatztraining'
import type { EinsatzTrainingSession } from '../../lib/types'

export type MunitionSessionRef = Pick<EinsatzTrainingSession, 'munition_anzahl' | 'munition_pool_id'>

export async function saveMunitionVerbrauch(input: {
  sessionId: string
  previous: MunitionSessionRef
  form: MunitionVerbrauchInput
  recordedBy: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const validated = validateMunitionVerbrauch(input.form)
  if (!validated.ok) return validated

  const neededIds = [validated.payload.munition_pool_id, input.previous.munition_pool_id]
    .filter((id): id is string => Boolean(id))
  const stocks: Record<string, number | null> = {}
  if (neededIds.length > 0) {
    const { data, error } = await supabase
      .from('pool_einsatzmittel')
      .select('id,anzahl')
      .in('id', neededIds)
    if (error) return { ok: false, error: error.message || 'Pool-Munition konnte nicht gelesen werden.' }
    for (const row of data ?? []) stocks[row.id] = row.anzahl
  }

  const plan = planPoolMunitionAdjustments({
    previous: { poolId: input.previous.munition_pool_id, anzahl: input.previous.munition_anzahl },
    next: { poolId: validated.payload.munition_pool_id, anzahl: validated.payload.munition_anzahl },
    stocks,
  })
  if (!plan.ok) return plan

  const recorded = withMunitionRecordedBy(validated.payload, input.recordedBy)
  const { error: sessionError } = await supabase
    .from('einsatz_training_sessions')
    .update(recorded)
    .eq('id', input.sessionId)
  if (sessionError) {
    return { ok: false, error: sessionError.message || 'Munition konnte nicht gespeichert werden.' }
  }

  for (const adj of plan.payload.adjustments) {
    const { error } = await supabase
      .from('pool_einsatzmittel')
      .update({ anzahl: adj.nextAnzahl })
      .eq('id', adj.poolId)
    if (error) {
      return { ok: false, error: 'Verbrauch gespeichert, Pool-Bestand konnte nicht angepasst werden.' }
    }
  }
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
