export type WorkspaceOrganisation = 'stadtpolizei' | 'feuerwehr' | 'krisenstab'

export interface OrganisationWorkspacePolicy {
  organisation: WorkspaceOrganisation
  documentationSystem: 'pad' | 'portal'
  operationalProtocol: boolean
  personStatusTracking: boolean
  accommodationTracking: boolean
  decisionProtocol: boolean
  operationalChecklists: boolean
}

/**
 * Organisationsspezifische Dokumentationsgrenze.
 *
 * Stadtpolizei:
 * PAD bleibt das führende Einsatz- und Protokollsystem. Im Portal werden
 * Meldungsannahme, Disposition, Unterstützung, Daten und Dokumente geführt,
 * aber keine operativen Feststellungen oder Maßnahmen protokolliert.
 *
 * Feuerwehr / Krisenstab:
 * Diese Profile kapseln die bereits vorhandenen generischen Ereignis- und
 * Protokollbausteine für eine spätere organisationsspezifische Oberfläche.
 * Sie werden aktuell nirgends in der Polizei-Navigation aktiviert.
 */
export const ORGANISATION_WORKSPACE_POLICY: Record<WorkspaceOrganisation, OrganisationWorkspacePolicy> = {
  stadtpolizei: {
    organisation: 'stadtpolizei',
    documentationSystem: 'pad',
    operationalProtocol: false,
    personStatusTracking: false,
    accommodationTracking: false,
    decisionProtocol: false,
    operationalChecklists: false,
  },
  feuerwehr: {
    organisation: 'feuerwehr',
    documentationSystem: 'portal',
    operationalProtocol: true,
    personStatusTracking: true,
    accommodationTracking: true,
    decisionProtocol: true,
    operationalChecklists: true,
  },
  krisenstab: {
    organisation: 'krisenstab',
    documentationSystem: 'portal',
    operationalProtocol: true,
    personStatusTracking: true,
    accommodationTracking: true,
    decisionProtocol: true,
    operationalChecklists: true,
  },
}

export function workspacePolicy(organisation: WorkspaceOrganisation): OrganisationWorkspacePolicy {
  return ORGANISATION_WORKSPACE_POLICY[organisation]
}
