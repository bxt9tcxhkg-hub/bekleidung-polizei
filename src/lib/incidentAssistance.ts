import { supabase } from './supabase'
import type {
  IncidentAssistanceOrganisation,
  IncidentAssistanceRequest,
  IncidentAssistanceRequestType,
} from './types'

export const ASSISTANCE_LABEL: Record<IncidentAssistanceRequestType, string> = {
  personenabfrage: 'Personenabfrage',
  zmr: 'ZMR-Abfrage',
  fahrzeugabfrage: 'Fahrzeugabfrage',
  sonstiges: 'Unterstützung',
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
  incidentId?: string | null
  ereignisId?: string | null
  requestType: IncidentAssistanceRequestType
  requestedBy: string
  requesterOrganisation?: IncidentAssistanceOrganisation
  requestedVehicleId?: string | null
  requestText?: string | null
  subjectData?: Record<string, unknown>
  sourceDocumentId?: string | null
}): Promise<IncidentAssistanceRequest> {
  if (!input.incidentId && !input.ereignisId) throw new Error('Unterstützungsanfrage benötigt einen Einsatz- oder Ereignisbezug.')
  const result = await supabase
    .from('incident_assistance_requests')
    .insert({
      incident_id: input.incidentId ?? null,
      ereignis_id: input.ereignisId ?? null,
      request_type: input.requestType,
      requester_organisation: input.requesterOrganisation ?? 'Stadtpolizei',
      target_organisation: 'Stadtpolizei',
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
  const current = await supabase
    .from('incident_assistance_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (current.error) throw new Error('Abfrage konnte nicht geladen werden.')
  if (current.data.status === 'in_bearbeitung') {
    if (current.data.handled_by === userId) return current.data
    throw new Error('Diese Aufgabe wird bereits von einer anderen Person bearbeitet.')
  }
  if (current.data.status !== 'offen') throw new Error('Diese Aufgabe ist nicht mehr offen.')

  const now = new Date().toISOString()
  const result = await supabase
    .from('incident_assistance_requests')
    .update({ status: 'in_bearbeitung', handled_by: userId, handled_at: now, updated_at: now })
    .eq('id', id)
    .eq('status', 'offen')
    .select('*')
    .maybeSingle()

  if (result.error) throw new Error('Abfrage konnte nicht übernommen werden.')
  if (!result.data) throw new Error('Die Aufgabe wurde zwischenzeitlich von einer anderen Person übernommen.')
  return result.data
}

export async function completeAssistanceRequest(input: {
  id: string
  userId: string
  resultDocumentId?: string | null
  resultEventDocumentId?: string | null
}): Promise<IncidentAssistanceRequest> {
  const now = new Date().toISOString()
  const result = await supabase
    .from('incident_assistance_requests')
    .update({
      status: 'erledigt',
      result_document_id: input.resultDocumentId ?? null,
      result_event_document_id: input.resultEventDocumentId ?? null,
      completed_by: input.userId,
      completed_at: now,
      handled_by: input.userId,
      handled_at: now,
      updated_at: now,
    })
    .eq('id', input.id)
    .eq('handled_by', input.userId)
    .in('status', ['offen', 'in_bearbeitung'])
    .select('*')
    .maybeSingle()
  if (result.error) throw new Error('Abfrage konnte nicht abgeschlossen werden.')
  if (!result.data) throw new Error('Die Aufgabe wurde zwischenzeitlich geändert oder von einer anderen Person übernommen.')
  return result.data
}


export async function extractIdDocumentData(input: {
  incidentId: string
  documentId: string
}): Promise<{ fields: Record<string, string>; text: string }> {
  const { data: sessionData } = await supabase.auth.getSession()
  const response = await fetch('/incident-id-extract', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`,
      'X-Incident-Id': input.incidentId,
      'X-Document-Id': input.documentId,
    },
  })
  const data = await response.json().catch(() => null) as { fields?: Record<string, string>; text?: string; error?: string } | null
  if (!response.ok) throw new Error(data?.error || 'Ausweisdaten konnten nicht automatisch gelesen werden.')
  return { fields: data?.fields ?? {}, text: data?.text ?? '' }
}


export async function loadEventAssistanceRequests(ereignisId: string): Promise<IncidentAssistanceRequest[]> {
  const result = await supabase
    .from('incident_assistance_requests')
    .select('*')
    .eq('ereignis_id', ereignisId)
    .order('requested_at', { ascending: false })
  if (result.error) throw new Error('Unterstützungsanfragen des Ereignisses konnten nicht geladen werden.')
  return result.data ?? []
}
