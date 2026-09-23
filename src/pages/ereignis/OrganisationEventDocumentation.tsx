import EinsatzChecklisten from '../zentrale/EinsatzChecklisten'
import EreignisEntscheidungen from '../zentrale/EreignisEntscheidungen'
import { workspacePolicy, type WorkspaceOrganisation } from '../../lib/organisationWorkspace'
import EventAssistanceRequestPanel from './EventAssistanceRequestPanel'
import EventDocumentsPanel from './EventDocumentsPanel'
import type { IncidentAssistanceOrganisation } from '../../lib/types'

export default function OrganisationEventDocumentation({
  organisation,
  incidentId,
  ereignisId,
  canOperate,
  userId,
  onChanged,
}: {
  organisation: WorkspaceOrganisation
  incidentId: string
  ereignisId: string
  canOperate: boolean
  userId: string | null
  onChanged?: () => void
}) {
  const policy = workspacePolicy(organisation)
  const assistanceOrganisation: Exclude<IncidentAssistanceOrganisation, 'Stadtpolizei'> | null =
    organisation === 'feuerwehr' ? 'Feuerwehr' : organisation === 'krisenstab' ? 'Krisenstab' : null

  // Polizei: PAD ist führend. Diese Oberfläche bleibt vollständig unsichtbar.
  if (policy.documentationSystem !== 'portal' || !policy.operationalProtocol) return null

  return <div className="space-y-5">
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Ereignisdokumentation</p>
      <p className="mt-1 text-xs text-gray-600">
        Organisationsspezifischer Protokollbereich im Portal. Dieser Bereich ist nicht Teil der Stadtpolizei-Oberfläche.
      </p>
    </div>

    {assistanceOrganisation ? <EventAssistanceRequestPanel
      ereignisId={ereignisId}
      incidentId={incidentId}
      organisation={assistanceOrganisation}
    /> : null}

    {assistanceOrganisation ? <EventDocumentsPanel
      ereignisId={ereignisId}
      organisation={assistanceOrganisation}
    /> : null}

    {policy.decisionProtocol ? <section className="rounded-xl border border-gray-200 bg-white p-3">
      <EreignisEntscheidungen
        ereignisId={ereignisId}
        canOperate={canOperate}
        userId={userId}
        organisation={organisation}
        onChanged={onChanged}
      />
    </section> : null}

    {policy.operationalChecklists ? <section className="rounded-xl border border-gray-200 bg-white p-3">
      <EinsatzChecklisten
        incidentId={incidentId}
        canOperate={canOperate}
        organisation={organisation}
        onChanged={onChanged}
      />
    </section> : null}
  </div>
}
