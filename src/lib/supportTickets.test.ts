import { describe, expect, it } from 'vitest'
import {
  SUPPORT_BODY_MAX,
  SUPPORT_STATUS_LABELS,
  SUPPORT_KIND_LABELS,
  SUPPORT_SUBJECT_MAX,
  sortSupportTickets,
  parseSupportSubject,
  supportSubjectForStorage,
  validateSupportBody,
  validateSupportSubject,
} from './supportTickets'
import type { SupportTicketStatus } from './types'

function ticket(id: string, status: SupportTicketStatus, last_message_at: string) {
  return { id, status, last_message_at }
}

describe('SUPPORT_STATUS_LABELS', () => {
  it('verwendet die deutschen Statusbezeichnungen', () => {
    expect(SUPPORT_STATUS_LABELS.open).toBe('Offen')
    expect(SUPPORT_STATUS_LABELS.answered).toBe('Beantwortet')
    expect(SUPPORT_STATUS_LABELS.closed).toBe('Geschlossen')
  })
})

describe('validateSupportSubject', () => {
  it('trimmt und akzeptiert einen kurzen Betreff', () => {
    const result = validateSupportSubject('  Größe fehlt  ')
    expect(result).toEqual({ ok: true, value: 'Größe fehlt' })
  })

  it('lehnt leeren oder nur-Leerzeichen-Betreff ab', () => {
    expect(validateSupportSubject('')).toEqual({ ok: false, error: 'Bitte einen Betreff eingeben.' })
    expect(validateSupportSubject('   ')).toEqual({ ok: false, error: 'Bitte einen Betreff eingeben.' })
  })

  it('lehnt zu lange Betreffe ab', () => {
    const tooLong = 'A'.repeat(SUPPORT_SUBJECT_MAX + 1)
    const result = validateSupportSubject(tooLong)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(String(SUPPORT_SUBJECT_MAX))
    expect(validateSupportSubject('B'.repeat(SUPPORT_SUBJECT_MAX)).ok).toBe(true)
  })
})

describe('Anfragearten', () => {
  it('speichert und erkennt Verbesserungen und Ideen', () => {
    expect(supportSubjectForStorage('improvement', '  Bessere Suche  ')).toEqual({ ok: true, value: '[Verbesserung] Bessere Suche' })
    expect(parseSupportSubject('[Verbesserung] Bessere Suche')).toEqual({ kind: 'improvement', subject: 'Bessere Suche' })
    expect(parseSupportSubject('[Idee] Fahrzeug-QR-Code')).toEqual({ kind: 'idea', subject: 'Fahrzeug-QR-Code' })
  })

  it('behandelt bestehende Anfragen weiterhin als Hilfe', () => {
    expect(parseSupportSubject('Passwort funktioniert nicht')).toEqual({ kind: 'help', subject: 'Passwort funktioniert nicht' })
    expect(SUPPORT_KIND_LABELS.help).toBe('Hilfe / Problem')
  })
})

describe('validateSupportBody', () => {
  it('trimmt und akzeptiert eine Nachricht', () => {
    const result = validateSupportBody('  Bitte prüfen.  ')
    expect(result).toEqual({ ok: true, value: 'Bitte prüfen.' })
  })

  it('lehnt leeren Text ab', () => {
    expect(validateSupportBody('\n\t')).toEqual({ ok: false, error: 'Bitte eine Nachricht eingeben.' })
  })

  it('lehnt zu lange Nachrichten ab', () => {
    const tooLong = 'x'.repeat(SUPPORT_BODY_MAX + 1)
    const result = validateSupportBody(tooLong)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(String(SUPPORT_BODY_MAX))
    expect(validateSupportBody('y'.repeat(SUPPORT_BODY_MAX)).ok).toBe(true)
  })
})

describe('sortSupportTickets', () => {
  it('sortiert Offen zuerst, dann zuletzt geänderte', () => {
    const sorted = sortSupportTickets([
      ticket('c', 'closed', '2026-09-03T12:00:00Z'),
      ticket('a2', 'open', '2026-09-01T08:00:00Z'),
      ticket('b', 'answered', '2026-09-03T18:00:00Z'),
      ticket('a1', 'open', '2026-09-03T10:00:00Z'),
    ])
    expect(sorted.map(t => t.id)).toEqual(['a1', 'a2', 'b', 'c'])
  })

  it('ändert das Ausgangsarray nicht', () => {
    const input = [ticket('z', 'closed', '2026-09-01T00:00:00Z'), ticket('a', 'open', '2026-09-01T00:00:00Z')]
    const copy = [...input]
    sortSupportTickets(input)
    expect(input).toEqual(copy)
  })
})
