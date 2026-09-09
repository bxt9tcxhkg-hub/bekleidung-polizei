import type { SupportTicket, SupportTicketKind, SupportTicketStatus, SupportTicketTopic } from './types'

export type { SupportTicketKind, SupportTicketStatus, SupportTicketTopic }

export const SUPPORT_SUBJECT_MAX = 120
export const SUPPORT_BODY_MAX = 4000

export const SUPPORT_KIND_LABELS: Record<SupportTicketKind, string> = {
  help: 'Hilfe / Problem',
  improvement: 'Verbesserung',
  idea: 'Neue Idee',
}

export const SUPPORT_KIND_COLORS: Record<SupportTicketKind, string> = {
  help: 'bg-slate-100 text-slate-700',
  improvement: 'bg-emerald-50 text-emerald-700',
  idea: 'bg-violet-50 text-violet-700',
}

export const SUPPORT_TOPIC_LABELS: Record<SupportTicketTopic, string> = {
  general: 'Allgemein / Portal',
  bekleidung: 'Bekleidung',
  einsatz_mt: 'Einsatzmittel & Training',
  zentrale: 'Zentrale',
  innendienst: 'Innendienst',
  aussendienst: 'Außendienststreifen',
  schulungen: 'Schulungen',
  fuhrpark: 'Fuhrpark & Fahrzeuge',
  ueberstunden: 'Überstundenmeldung',
}

const SUPPORT_KIND_PREFIXES: Record<SupportTicketKind, string> = {
  help: '',
  improvement: '[Verbesserung] ',
  idea: '[Idee] ',
}

const SUPPORT_TOPIC_PREFIXES: Record<SupportTicketTopic, string> = {
  general: '',
  bekleidung: '[Bekleidung] ',
  einsatz_mt: '[Einsatzmittel & Training] ',
  zentrale: '[Zentrale] ',
  innendienst: '[Innendienst] ',
  aussendienst: '[Außendienst] ',
  schulungen: '[Schulungen] ',
  fuhrpark: '[Fuhrpark] ',
  ueberstunden: '[Überstunden] ',
}

export function supportSubjectForStorage(kind: SupportTicketKind, topic: SupportTicketTopic, rawSubject: string): SupportFieldResult {
  void kind
  void topic
  return validateSupportSubject(rawSubject)
}

export function supportSubjectInputMax(kind: SupportTicketKind, topic: SupportTicketTopic): number {
  void kind
  void topic
  return SUPPORT_SUBJECT_MAX
}

export function parseSupportSubject(storedSubject: string): { kind: SupportTicketKind; topic: SupportTicketTopic; subject: string } {
  let kind: SupportTicketKind = 'help'
  let subject = storedSubject
  for (const candidate of ['improvement', 'idea'] as const) {
    const prefix = SUPPORT_KIND_PREFIXES[candidate]
    if (subject.startsWith(prefix)) {
      kind = candidate
      subject = subject.slice(prefix.length)
      break
    }
  }
  let topic: SupportTicketTopic = 'general'
  for (const candidate of Object.keys(SUPPORT_TOPIC_PREFIXES) as SupportTicketTopic[]) {
    const prefix = SUPPORT_TOPIC_PREFIXES[candidate]
    if (prefix && subject.startsWith(prefix)) {
      topic = candidate
      subject = subject.slice(prefix.length)
      break
    }
  }
  return { kind, topic, subject }
}

export function supportTicketPresentation(ticket: Pick<SupportTicket, 'subject'> & Partial<Pick<SupportTicket, 'kind' | 'topic'>>) {
  const legacy = parseSupportSubject(ticket.subject)
  return {
    kind: ticket.kind ?? legacy.kind,
    topic: ticket.topic ?? legacy.topic,
    subject: legacy.subject,
  }
}

export function supportManagedTopics(params: {
  isAdmin: boolean
  areaRoles: ReadonlyArray<{ area: string; roles: readonly string[] }> | null
}): SupportTicketTopic[] {
  const allTopics = Object.keys(SUPPORT_TOPIC_LABELS) as SupportTicketTopic[]
  if (params.isAdmin) return allTopics
  if (!params.areaRoles) return []

  const managed = new Set<SupportTicketTopic>()
  for (const row of params.areaRoles) {
    if (!row.roles.some(role => role === 'sachbearbeiter' || role === 'admin')) continue
    if (row.area === 'bekleidung' || row.area === 'einsatz_mt') managed.add(row.area)
  }
  return allTopics.filter(topic => managed.has(topic))
}

export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: 'Offen',
  answered: 'Beantwortet',
  closed: 'Geschlossen',
}

export const SUPPORT_STATUS_COLORS: Record<SupportTicketStatus, string> = {
  open: 'bg-amber-50 text-amber-700',
  answered: 'bg-blue-50 text-blue-700',
  closed: 'bg-slate-100 text-slate-600',
}

const STATUS_SORT: Record<SupportTicketStatus, number> = {
  open: 0,
  answered: 1,
  closed: 2,
}

export type SupportFieldOk = { ok: true; value: string }
export type SupportFieldErr = { ok: false; error: string }
export type SupportFieldResult = SupportFieldOk | SupportFieldErr

export function validateSupportSubject(raw: string): SupportFieldResult {
  const value = raw.trim()
  if (!value) return { ok: false, error: 'Bitte einen Betreff eingeben.' }
  if (value.length > SUPPORT_SUBJECT_MAX) {
    return { ok: false, error: `Der Betreff ist zu lang (max. ${SUPPORT_SUBJECT_MAX} Zeichen).` }
  }
  return { ok: true, value }
}

export function validateSupportBody(raw: string): SupportFieldResult {
  const value = raw.trim()
  if (!value) return { ok: false, error: 'Bitte eine Nachricht eingeben.' }
  if (value.length > SUPPORT_BODY_MAX) {
    return { ok: false, error: `Die Nachricht ist zu lang (max. ${SUPPORT_BODY_MAX} Zeichen).` }
  }
  return { ok: true, value }
}

export function sortSupportTickets<T extends { id: string; status: SupportTicketStatus; last_message_at: string }>(
  tickets: readonly T[],
): T[] {
  return [...tickets].sort((a, b) => {
    const byStatus = STATUS_SORT[a.status] - STATUS_SORT[b.status]
    if (byStatus !== 0) return byStatus
    const byTime = b.last_message_at.localeCompare(a.last_message_at)
    if (byTime !== 0) return byTime
    return a.id.localeCompare(b.id)
  })
}
