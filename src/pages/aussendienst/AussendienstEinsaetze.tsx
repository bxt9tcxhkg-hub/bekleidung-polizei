import { useOutletContext } from 'react-router-dom'
import type { AussendienstContext } from './AussendienstShell'
import { EntryOrIncidentList } from './aussendienstShared'

export default function AussendienstEinsaetze() {
  const ctx = useOutletContext<AussendienstContext>()
  return <EntryOrIncidentList kind="incidents" incidents={ctx.incidents} baustellen={ctx.baustellen} ownVehicleId={ctx.ownVehicle?.id ?? null} incidentSupports={ctx.incidentSupports} takeOverIncident={ctx.takeOverIncident} releaseIncidentTakeover={ctx.releaseIncidentTakeover} supportIncident={ctx.supportIncident} stopSupportingIncident={ctx.stopSupportingIncident} completeIncident={ctx.completeIncident} reopenIncident={ctx.reopenIncident} incidentContextSummary={ctx.incidentContextSummary} />
}
