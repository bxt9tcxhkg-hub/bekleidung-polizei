import type { SupportTicketStatus } from './types'

export type { SupportTicketStatus }

export const SUPPORT_SUBJECT_MAX = 120
export const SUPPORT_BODY_MAX = 4000

export type SupportTicketKind = 'help' | 'improvement' | 'idea'

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

const SUPPORT_KIND_PREFIXES: Record<SupportTicketKind, string> = {
  help: '',
  improvement: '[Verbesserung] ',
  idea: '[Idee] ',
}

export function supportSubjectForStorage(kind: SupportTicketKind, rawSubject: string): SupportFieldResult {
  return validateSupportSubject(`${SUPPORT_KIND_PREFIXES[kind]}${rawSubject.trim()}`)
}

export function parseSupportSubject(storedSubject: string): { kind: SupportTicketKind; subject: string } {
  if (storedSubject.startsWith(SUPPORT_KIND_PREFIXES.improvement)) {
    return { kind: 'improvement', subject: storedSubject.slice(SUPPORT_KIND_PREFIXES.improvement.length) }
  }
  if (storedSubject.startsWith(SUPPORT_KIND_PREFIXES.idea)) {
    return { kind: 'idea', subject: storedSubject.slice(SUPPORT_KIND_PREFIXES.idea.length) }
  }
  return { kind: 'help', subject: storedSubject }
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
