import { supabase } from './supabase'
import type { EinsatzPartei, EinsatzParteiRolle, MailDelivery } from './types'

export const MAIL_KIND_LABEL: Record<MailDelivery['kind'], string> = { rsa: 'RSa', rsb: 'RSb', vernehmung: 'Vernehmung' }

export const EINSATZ_PARTEI_ROLLEN: EinsatzParteiRolle[] = ['beschuldigter', 'opfer', 'zeuge', 'sonstige']
export const EINSATZ_PARTEI_ROLLE_LABEL: Record<EinsatzParteiRolle, string> = {
  beschuldigter: 'Beschuldigter',
  opfer: 'Opfer',
  zeuge: 'Zeuge',
  sonstige: 'Sonstige',
}

export async function loadEinsatzParteien(incidentId: string): Promise<EinsatzPartei[]> {
  const result = await supabase.from('einsatz_parteien').select('*, person:operational_persons(id,vorname,nachname,birth_date)').eq('incident_id', incidentId).order('created_at')
  if (result.error) throw new Error('Die Parteien konnten nicht geladen werden.')
  return (result.data ?? []) as unknown as EinsatzPartei[]
}

export async function addEinsatzPartei(incidentId: string, personId: string, rolle: EinsatzParteiRolle, note: string, createdBy: string): Promise<EinsatzPartei> {
  const result = await supabase.from('einsatz_parteien').insert({ incident_id: incidentId, person_id: personId, rolle, note: note.trim() || null, created_by: createdBy })
    .select('*, person:operational_persons(id,vorname,nachname,birth_date)').single()
  if (result.error || !result.data) throw new Error('Diese Person ist diesem Einsatz bereits als Partei zugeordnet.')
  return result.data as unknown as EinsatzPartei
}

export async function updateEinsatzParteiRolle(id: string, rolle: EinsatzParteiRolle): Promise<void> {
  const result = await supabase.from('einsatz_parteien').update({ rolle }).eq('id', id)
  if (result.error) throw new Error('Die Rolle konnte nicht geändert werden.')
}

export async function removeEinsatzPartei(id: string): Promise<void> {
  const result = await supabase.from('einsatz_parteien').delete().eq('id', id)
  if (result.error) throw new Error('Die Partei konnte nicht entfernt werden.')
}

/** Offene RSa/RSb-Fälle bzw. Vernehmungen je Person - für den Hinweis beim Erfassen einer Partei. */
export async function openMailDeliveriesByPerson(personIds: string[]): Promise<Map<string, Pick<MailDelivery, 'id' | 'kind' | 'status'>[]>> {
  const map = new Map<string, Pick<MailDelivery, 'id' | 'kind' | 'status'>[]>()
  const ids = [...new Set(personIds)]
  if (ids.length === 0) return map
  const result = await supabase.from('mail_deliveries').select('id,kind,status,person_id').is('closed_at', null).in('status', ['offen', 'spaeter_erneut']).in('person_id', ids)
  for (const row of (result.data ?? []) as { id: string; kind: MailDelivery['kind']; status: MailDelivery['status']; person_id: string }[]) {
    const list = map.get(row.person_id) ?? []
    list.push({ id: row.id, kind: row.kind, status: row.status })
    map.set(row.person_id, list)
  }
  return map
}
