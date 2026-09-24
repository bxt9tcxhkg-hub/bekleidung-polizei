type PatrolIncident = {
  id: string
  status: string
  disposition: string
  assigned_vehicle_id: string | null
  taken_over_vehicle_id: string | null
  taken_over_by: string | null
}

/** Alle offenen Einsätze bleiben sichtbar; die Kategorie steuert nur ihre Aktionen und Priorität. */
export function classifyPatrolIncidents<T extends PatrolIncident>(
  incidents: readonly T[], ownVehicleId: string | null, ownUserId: string | null,
  ownFunction: string | null, supportedIds: ReadonlySet<string>,
) {
  const own: T[] = []
  const supported: T[] = []
  const available: T[] = []
  const other: T[] = []

  for (const incident of incidents) {
    if (incident.status !== 'offen') continue
    const primaryVehicleId = incident.taken_over_vehicle_id || incident.assigned_vehicle_id
    if ((ownVehicleId && primaryVehicleId === ownVehicleId) || (ownUserId && incident.taken_over_by === ownUserId)) own.push(incident)
    else if (supportedIds.has(incident.id)) supported.push(incident)
    else if (!primaryVehicleId && !incident.taken_over_by && incident.disposition !== 'zentrale'
      && (incident.disposition === 'offen' || incident.disposition === ownFunction)) available.push(incident)
    else other.push(incident)
  }
  return { own, supported, available, other }
}
