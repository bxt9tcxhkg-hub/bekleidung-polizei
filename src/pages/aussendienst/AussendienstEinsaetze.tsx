import { useOutletContext } from 'react-router-dom'
import type { AussendienstContext } from './AussendienstShell'
import { EntryOrIncidentList } from './aussendienstShared'

export default function AussendienstEinsaetze() {
  const ctx = useOutletContext<AussendienstContext>()
  return <EntryOrIncidentList kind="incidents" incidents={ctx.incidents} baustellen={ctx.baustellen} takeOverIncident={ctx.takeOverIncident} releaseIncidentTakeover={ctx.releaseIncidentTakeover} />
}
