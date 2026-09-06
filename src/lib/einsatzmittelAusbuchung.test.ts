import { describe, expect, it } from 'vitest'
import {
  activeEinsatzmittel,
  ausbuchungPayload,
  formatRemovalReason,
  isEinsatzmittelActive,
  isEinsatzmittelRemoved,
  planCountedAusbuchung,
  poolItemUsesCountedAusbuchung,
  removedEinsatzmittel,
  validateAusbuchung,
} from './einsatzmittelAusbuchung'

describe('Ausbuchung', () => {
  it('erkennt aktive und ausgebuchte Zeilen', () => {
    expect(isEinsatzmittelActive({ removed_at: null })).toBe(true)
    expect(isEinsatzmittelActive({})).toBe(true)
    expect(isEinsatzmittelRemoved({ removed_at: '2026-09-06T10:00:00.000Z' })).toBe(true)
    expect(activeEinsatzmittel([
      { id: 'a', removed_at: null },
      { id: 'b', removed_at: '2026-09-06T10:00:00.000Z' },
    ]).map(row => row.id)).toEqual(['a'])
    expect(removedEinsatzmittel([
      { id: 'a', removed_at: null },
      { id: 'b', removed_at: '2026-09-06T10:00:00.000Z' },
    ]).map(row => row.id)).toEqual(['b'])
  })

  it('nimmt optionalen Grund und lehnt zu lange Texte ab', () => {
    expect(validateAusbuchung({ reason: '  defekt  ' })).toEqual({
      ok: true,
      payload: { removal_reason: 'defekt' },
    })
    expect(validateAusbuchung({ reason: '   ' })).toEqual({
      ok: true,
      payload: { removal_reason: null },
    })
    expect(validateAusbuchung({ reason: 'x'.repeat(501) }).ok).toBe(false)
  })

  it('schreibt Zeitstempel, Person und Grund', () => {
    const result = ausbuchungPayload({
      reason: 'Verlust',
      removedBy: 'u1',
      removedAt: '2026-09-06T12:00:00.000Z',
    })
    expect(result).toEqual({
      ok: true,
      payload: {
        removed_at: '2026-09-06T12:00:00.000Z',
        removed_by: 'u1',
        removal_reason: 'Verlust',
      },
    })
    expect(formatRemovalReason(null)).toBe('ohne Angabe')
    expect(formatRemovalReason('  Bruch  ')).toBe('Bruch')
  })

  it('verringert Pool-Anzahl und lässt den Rest stehen', () => {
    expect(poolItemUsesCountedAusbuchung({ anzahl: 40 })).toBe(true)
    expect(poolItemUsesCountedAusbuchung({ category: 'munition', anzahl: null })).toBe(true)
    expect(poolItemUsesCountedAusbuchung({ category: 'langwaffe_stg77', anzahl: null })).toBe(false)
    expect(planCountedAusbuchung({ currentAnzahl: 40, qtyRaw: '10' })).toEqual({
      ok: true,
      payload: { mode: 'decrement', qty: 10, nextAnzahl: 30 },
    })
    expect(planCountedAusbuchung({ currentAnzahl: 10, qtyRaw: '10' })).toEqual({
      ok: true,
      payload: { mode: 'remove', qty: 10, nextAnzahl: 0 },
    })
    expect(planCountedAusbuchung({ currentAnzahl: 5, qtyRaw: '6' }).ok).toBe(false)
    expect(planCountedAusbuchung({ currentAnzahl: null, qtyRaw: '1' }).ok).toBe(false)
  })
})
