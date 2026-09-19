import { supabase } from './supabase'
import type { EinsatzChecklisteName, EinsatzChecklistPunkt } from './types'

export async function loadChecklistPunkte(incidentId: string, checkliste: EinsatzChecklisteName): Promise<EinsatzChecklistPunkt[]> {
  const result = await supabase.from('einsatz_checklist_punkte').select('*').eq('incident_id', incidentId).eq('checkliste', checkliste)
  if (result.error) throw new Error('Die Checkliste konnte nicht geladen werden.')
  return (result.data ?? []) as unknown as EinsatzChecklistPunkt[]
}

/** Setzt/entfernt "erledigt" für einen Checklisten-Punkt - legt die Zeile bei
 * Bedarf an (upsert auf den eindeutigen Schlüssel incident_id/checkliste/
 * punkt_key), damit nicht für jeden Einsatz im Voraus alle Punkte-Zeilen
 * existieren müssen. */
export async function setChecklistPunktErledigt(incidentId: string, checkliste: EinsatzChecklisteName, punktKey: string, erledigt: boolean, wer: string, userId: string): Promise<void> {
  const result = await supabase.from('einsatz_checklist_punkte').upsert({
    incident_id: incidentId, checkliste, punkt_key: punktKey,
    erledigt, wer: wer.trim() || null,
    erledigt_at: erledigt ? new Date().toISOString() : null,
    erledigt_von: erledigt ? userId : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'incident_id,checkliste,punkt_key' })
  if (result.error) throw new Error('Der Checklisten-Punkt konnte nicht gespeichert werden.')
}

/** Nur das "Wer"-Feld ändern, ohne den Erledigt-Status zu berühren (z. B.
 * beim Eintippen, bevor abgehakt wird). */
export async function setChecklistPunktWer(incidentId: string, checkliste: EinsatzChecklisteName, punktKey: string, wer: string): Promise<void> {
  const result = await supabase.from('einsatz_checklist_punkte').upsert({
    incident_id: incidentId, checkliste, punkt_key: punktKey, wer: wer.trim() || null, updated_at: new Date().toISOString(),
  }, { onConflict: 'incident_id,checkliste,punkt_key', ignoreDuplicates: false })
  if (result.error) throw new Error('Der Checklisten-Punkt konnte nicht gespeichert werden.')
}
