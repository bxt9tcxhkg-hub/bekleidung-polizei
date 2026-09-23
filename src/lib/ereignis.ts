import { supabase } from './supabase'
import type { Ereignis, EreignisDimension, EreignisEntscheidung, EreignisVerstaendigung, IncidentStatus } from './types'

export async function loadIncidentEreignis(incidentId: string): Promise<Ereignis | null> {
  const link = await supabase
    .from('ereignis_einsaetze')
    .select('ereignis_id')
    .eq('incident_id', incidentId)
    .maybeSingle()

  if (link.error) throw link.error
  if (!link.data) return null

  const result = await supabase.from('ereignisse').select('*').eq('id', link.data.ereignis_id).single()
  if (result.error) throw result.error
  return result.data
}

export async function setIncidentEreignisDimension(incidentId: string, dimension: EreignisDimension): Promise<Ereignis | null> {
  const result = await supabase.rpc('set_incident_event_dimension', {
    p_incident_id: incidentId,
    p_dimension: dimension,
  })
  if (result.error) throw result.error
  if (!result.data) return null

  const eventResult = await supabase.from('ereignisse').select('*').eq('id', result.data).single()
  if (eventResult.error) throw eventResult.error
  return eventResult.data
}

export async function loadEreignisDimensionen(incidentIds: string[]): Promise<Record<string, EreignisDimension>> {
  if (incidentIds.length === 0) return {}

  const links = await supabase
    .from('ereignis_einsaetze')
    .select('incident_id,ereignis_id')
    .in('incident_id', incidentIds)

  if (links.error) throw links.error
  if (!links.data?.length) return {}

  const eventIds = [...new Set(links.data.map(row => row.ereignis_id))]
  const events = await supabase.from('ereignisse').select('id,dimension').in('id', eventIds)
  if (events.error) throw events.error

  const byId = new Map((events.data ?? []).map(row => [row.id, row.dimension]))
  return Object.fromEntries(
    links.data.flatMap(row => {
      const dimension = byId.get(row.ereignis_id)
      return dimension ? [[row.incident_id, dimension]] : []
    }),
  )
}

export interface IncidentEreignisContext {
  id: string
  titel: string
  dimension: EreignisDimension
  incident_count: number
}

export async function loadEreignisContexts(incidentIds: string[]): Promise<Record<string, IncidentEreignisContext>> {
  if (incidentIds.length === 0) return {}

  const links = await supabase
    .from('ereignis_einsaetze')
    .select('incident_id,ereignis_id')
    .in('incident_id', incidentIds)

  if (links.error) throw links.error
  if (!links.data?.length) return {}

  const eventIds = [...new Set(links.data.map(row => row.ereignis_id))]
  const [events, allLinks] = await Promise.all([
    supabase.from('ereignisse').select('id,titel,dimension').in('id', eventIds),
    supabase.from('ereignis_einsaetze').select('ereignis_id,incident_id').in('ereignis_id', eventIds),
  ])

  if (events.error) throw events.error
  if (allLinks.error) throw allLinks.error

  const counts = new Map<string, number>()
  for (const row of allLinks.data ?? []) counts.set(row.ereignis_id, (counts.get(row.ereignis_id) ?? 0) + 1)
  const byEvent = new Map((events.data ?? []).map(row => [row.id, {
    id: row.id,
    titel: row.titel,
    dimension: row.dimension,
    incident_count: counts.get(row.id) ?? 0,
  }]))

  return Object.fromEntries(
    links.data.flatMap(row => {
      const event = byEvent.get(row.ereignis_id)
      return event ? [[row.incident_id, event]] : []
    }),
  )
}

export interface ActiveEreignisSummary {
  id: string
  titel: string
  dimension: EreignisDimension
  started_at: string
  incident_count: number
}

export async function loadActiveEreignisse(): Promise<ActiveEreignisSummary[]> {
  const events = await supabase
    .from('ereignisse')
    .select('id,titel,dimension,started_at')
    .eq('status', 'aktiv')
    .order('started_at', { ascending: false })

  if (events.error) throw events.error
  if (!events.data?.length) return []

  const ids = events.data.map(row => row.id)
  const links = await supabase
    .from('ereignis_einsaetze')
    .select('ereignis_id,incident_id')
    .in('ereignis_id', ids)

  if (links.error) throw links.error

  const counts = new Map<string, number>()
  for (const row of links.data ?? []) counts.set(row.ereignis_id, (counts.get(row.ereignis_id) ?? 0) + 1)

  return events.data.map(row => ({
    ...row,
    incident_count: counts.get(row.id) ?? 0,
  }))
}

export async function linkIncidentToEreignis(input: {
  incidentId: string
  ereignisId: string
  userId: string
}): Promise<Ereignis> {
  const result = await supabase.rpc('link_incident_to_event', {
    p_incident_id: input.incidentId,
    p_event_id: input.ereignisId,
  })
  if (result.error) throw result.error

  const eventResult = await supabase
    .from('ereignisse')
    .select('*')
    .eq('id', result.data)
    .single()

  if (eventResult.error) throw eventResult.error
  return eventResult.data
}

export async function unlinkIncidentFromEreignis(incidentId: string): Promise<string> {
  const result = await supabase.rpc('unlink_incident_from_event', {
    p_incident_id: incidentId,
  })
  if (result.error) throw result.error
  return result.data
}

export async function setEreignisStatus(ereignisId: string, status: Ereignis['status']): Promise<Ereignis> {
  const result = await supabase.rpc('set_event_status', {
    p_event_id: ereignisId,
    p_status: status,
  })
  if (result.error) throw result.error
  return result.data
}

export async function loadEreignisIncidentStatus(ereignisId: string): Promise<Record<string, IncidentStatus>> {
  const links = await supabase
    .from('ereignis_einsaetze')
    .select('incident_id')
    .eq('ereignis_id', ereignisId)

  if (links.error) throw links.error
  const ids = (links.data ?? []).map(row => row.incident_id)
  if (ids.length === 0) return {}

  const incidents = await supabase
    .from('incident_reports')
    .select('id,status')
    .in('id', ids)

  if (incidents.error) throw incidents.error
  return Object.fromEntries((incidents.data ?? []).map(row => [row.id, row.status as IncidentStatus]))
}

export async function loadEreignisIncidentIds(ereignisId: string): Promise<string[]> {
  const result = await supabase
    .from('ereignis_einsaetze')
    .select('incident_id')
    .eq('ereignis_id', ereignisId)

  if (result.error) throw result.error
  return (result.data ?? []).map(row => row.incident_id)
}

export async function loadEreignisEntscheidungen(ereignisId: string): Promise<EreignisEntscheidung[]> {
  const result = await supabase
    .from('ereignis_entscheidungen')
    .select('*')
    .eq('ereignis_id', ereignisId)
    .order('updated_at')

  if (result.error) throw result.error
  return result.data ?? []
}

export async function setEreignisEntscheidung({
  ereignisId,
  key,
  label,
  status,
  notiz,
  userId,
}: {
  ereignisId: string
  key: string
  label: string
  status: EreignisEntscheidung['status']
  notiz?: string | null
  userId: string
}): Promise<EreignisEntscheidung> {
  const result = await supabase
    .from('ereignis_entscheidungen')
    .upsert({
      ereignis_id: ereignisId,
      punkt_key: key,
      punkt_label: label,
      status,
      notiz: notiz ?? null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'ereignis_id,punkt_key' })
    .select('*')
    .single()

  if (result.error) throw result.error
  return result.data
}

export async function loadVerstaendigungen(ereignisId: string): Promise<EreignisVerstaendigung[]> {
  const result = await supabase
    .from('ereignis_verstaendigungen')
    .select('*')
    .eq('ereignis_id', ereignisId)
    .order('updated_at')

  if (result.error) throw result.error
  return result.data ?? []
}

export async function setVerstaendigungStatus({
  ereignisId,
  key,
  label,
  field,
  current,
  userId,
}: {
  ereignisId: string
  key: string
  label: string
  field: 'versucht' | 'erreicht'
  current?: EreignisVerstaendigung
  userId: string
}): Promise<EreignisVerstaendigung> {
  const now = new Date().toISOString()
  let versuchtAt = current?.versucht_at ?? null
  let erreichtAt = current?.erreicht_at ?? null

  if (field === 'versucht') {
    if (versuchtAt) {
      versuchtAt = null
      erreichtAt = null
    } else {
      versuchtAt = now
    }
  } else if (erreichtAt) {
    erreichtAt = null
  } else {
    erreichtAt = now
    versuchtAt = versuchtAt ?? now
  }

  const result = await supabase
    .from('ereignis_verstaendigungen')
    .upsert({
      ereignis_id: ereignisId,
      empfaenger_key: key,
      empfaenger_label: label,
      versucht_at: versuchtAt,
      erreicht_at: erreichtAt,
      updated_by: userId,
      updated_at: now,
    }, { onConflict: 'ereignis_id,empfaenger_key' })
    .select('*')
    .single()

  if (result.error) throw result.error
  return result.data
}

export async function updateEreignisLage(
  ereignisId: string,
  changes: Partial<Pick<Ereignis,
    'betroffene_anzahl' |
    'opfer_anzahl' |
    'sachschaden' |
    'erforderliche_massnahmen' |
    'ereignisgrund' |
    'oeffentliche_sicherheit_beeintraechtigt' |
    'koordinierung_noetig'
  >>,
  userId: string,
): Promise<Ereignis> {
  const result = await supabase
    .from('ereignisse')
    .update({ ...changes, updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', ereignisId)
    .select('*')
    .single()

  if (result.error) throw result.error
  return result.data
}

export function verstaendigungKey(label: string): string {
  return label
    .toLocaleLowerCase('de-AT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}
