import { supabase } from './supabase'
import { PERSON_NOTE_LABEL } from './zentraleShared'
import type { OperationalPersonNote, OperationalPersonNoteCategory } from './types'

export const PERSON_NOTE_CATEGORIES = Object.keys(PERSON_NOTE_LABEL) as OperationalPersonNoteCategory[]

/** Aktive Personenhinweise sind unabhängig vom Einsatz - hier für alle übergebenen Personen auf einmal geladen, für die Anzeige als einsatzrelevante Info. */
export async function loadActivePersonNotesByPerson(personIds: string[]): Promise<Map<string, OperationalPersonNote[]>> {
  const map = new Map<string, OperationalPersonNote[]>()
  const ids = [...new Set(personIds)]
  if (ids.length === 0) return map
  const result = await supabase.from('operational_person_notes').select('*, person:operational_persons(id,vorname,nachname,birth_date,phone)').eq('active', true).in('person_id', ids)
  for (const row of (result.data ?? []) as unknown as OperationalPersonNote[]) {
    const list = map.get(row.person_id) ?? []
    list.push(row)
    map.set(row.person_id, list)
  }
  return map
}

export interface PersonNoteInput {
  personId: string
  location: string
  category: OperationalPersonNoteCategory
  description: string
  guidance: string
  source: string
  validUntil: string
  createdBy: string
}

export async function createPersonNote(input: PersonNoteInput): Promise<void> {
  const result = await supabase.from('operational_person_notes').insert({
    person_id: input.personId, location: input.location.trim() || null, category: input.category,
    note: input.description.trim(), action_guidance: input.guidance.trim() || null,
    source_reference: input.source.trim() || null, valid_until: input.validUntil || null, created_by: input.createdBy,
  })
  if (result.error) throw new Error('Der Personenhinweis konnte nicht gespeichert werden.')
}
