import { supabase } from './supabase'
import type {
  IncidentAssistanceRequest,
  IncidentAssistanceRequestType,
  IncidentAssistanceResponseChannel,
} from './types'

export const ASSISTANCE_LABEL: Record<IncidentAssistanceRequestType, string> = {
  personenabfrage: 'Personenabfrage',
  zmr: 'ZMR-Abfrage',
  fahrzeugabfrage: 'Fahrzeugabfrage',
  sonstiges: 'Sonstige Anfrage',
}

export async function loadIncidentAssistanceRequests(incidentId: string): Promise<IncidentAssistanceRequest[]> {
  const result = await supabase
    .from('incident_assistance_requests')
    .select('*')
    .eq('incident_id', incidentId)
    .order('requested_at', { ascending: false })
  if (result.error) throw new Error('Unterstützungsanfragen konnten nicht geladen werden.')
  return result.data ?? []
}

export async function loadOpenAssistanceRequests(): Promise<IncidentAssistanceRequest[]> {
  const result = await supabase
    .from('incident_assistance_requests')
    .select('*')
    .in('status', ['offen', 'in_bearbeitung'])
    .order('requested_at', { ascending: true })
  if (result.error) throw new Error('Offene Unterstützungsanfragen konnten nicht geladen werden.')
  return result.data ?? []
}

export async function createAssistanceRequest(input: {
  incidentId: string
  requestType: IncidentAssistanceRequestType
  requestedBy: string
  requestedVehicleId?: string | null
  requestText?: string | null
  subjectData?: Record<string, unknown>
  sourceDocumentId?: string | null
}): Promise<IncidentAssistanceRequest> {
  const result = await supabase
    .from('incident_assistance_requests')
    .insert({
      incident_id: input.incidentId,
      request_type: input.requestType,
      requested_by: input.requestedBy,
      requested_vehicle_id: input.requestedVehicleId ?? null,
      request_text: input.requestText?.trim() || null,
      subject_data: input.subjectData ?? {},
      source_document_id: input.sourceDocumentId ?? null,
    })
    .select('*')
    .single()
  if (result.error) throw new Error('Unterstützungsanfrage konnte nicht erstellt werden.')
  return result.data
}

export async function startAssistanceRequest(id: string, userId: string): Promise<IncidentAssistanceRequest> {
  const now = new Date().toISOString()
  const result = await supabase
    .from('incident_assistance_requests')
    .update({ status: 'in_bearbeitung', handled_by: userId, handled_at: now, updated_at: now })
    .eq('id', id)
    .select('*')
    .single()
  if (result.error) throw new Error('Anfrage konnte nicht übernommen werden.')
  return result.data
}

export async function completeAssistanceRequest(input: {
  id: string
  userId: string
  resultText?: string | null
  resultDocumentId?: string | null
  responseChannel: IncidentAssistanceResponseChannel
}): Promise<IncidentAssistanceRequest> {
  const now = new Date().toISOString()
  const result = await supabase
    .from('incident_assistance_requests')
    .update({
      status: 'erledigt',
      result_text: input.resultText?.trim() || null,
      result_document_id: input.resultDocumentId ?? null,
      response_channel: input.responseChannel,
      completed_by: input.userId,
      completed_at: now,
      handled_by: input.userId,
      handled_at: now,
      updated_at: now,
    })
    .eq('id', input.id)
    .select('*')
    .single()
  if (result.error) throw new Error('Anfrage konnte nicht abgeschlossen werden.')
  return result.data
}
