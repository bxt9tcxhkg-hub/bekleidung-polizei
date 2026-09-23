import type { IncidentReport } from './types'

export type CentralNextActionKind = 'done' | 'dispatch' | 'assistance' | 'notification' | 'wait'

export interface CentralNextAction {
  kind: CentralNextActionKind
  title: string
  text: string
}

export function centralNextAction(input: {
  incident: Pick<IncidentReport, 'status' | 'disposition' | 'assigned_vehicle_id' | 'taken_over_at'>
  openAssistanceCount: number
  nextNotification: string | null
}): CentralNextAction {
  const { incident, openAssistanceCount, nextNotification } = input

  if (incident.status !== 'offen') {
    return { kind: 'done', title: 'Einsatz abgeschlossen', text: 'Für diesen Einsatz besteht keine offene Zentralen-Aufgabe.' }
  }

  if (incident.disposition === 'offen' && !incident.assigned_vehicle_id && !incident.taken_over_at) {
    return { kind: 'dispatch', title: 'Bearbeitung festlegen', text: 'Der Einsatz ist noch keiner Bearbeitung zugewiesen.' }
  }

  if (openAssistanceCount > 0) {
    return {
      kind: 'assistance',
      title: 'Offene Abfrage bearbeiten',
      text: `${openAssistanceCount} ${openAssistanceCount === 1 ? 'Aufgabe wartet' : 'Aufgaben warten'} in diesem Einsatz.`,
    }
  }

  if (nextNotification) {
    return { kind: 'notification', title: 'Nächste Verständigung', text: nextNotification }
  }

  return {
    kind: 'wait',
    title: 'Keine offene Zentralen-Aufgabe',
    text: 'Auf neue Anforderungen von Streife, Feuerwehr oder Krisenstab reagieren.',
  }
}

export function eventNeedsClosureHint(input: { eventStatus: 'aktiv' | 'abgeschlossen'; openIncidentCount: number }): boolean {
  return input.eventStatus === 'aktiv' && input.openIncidentCount === 0
}
