import { describe, expect, it } from 'vitest'
import { centralNextAction, eventNeedsClosureHint } from './centralWorkflow'

const base = {
  status: 'offen' as const,
  disposition: 'zentrale' as const,
  assigned_vehicle_id: null,
  taken_over_at: null,
}

describe('centralNextAction', () => {
  it('prioritizes missing disposition', () => {
    expect(centralNextAction({
      incident: { ...base, disposition: 'offen' },
      openAssistanceCount: 2,
      nextNotification: 'Bürgermeisterin',
    }).kind).toBe('dispatch')
  })

  it('prioritizes assistance before event notification', () => {
    const result = centralNextAction({
      incident: base,
      openAssistanceCount: 2,
      nextNotification: 'Bürgermeisterin',
    })
    expect(result.kind).toBe('assistance')
    expect(result.text).toContain('2 Aufgaben')
  })

  it('uses event notification when no assistance is open', () => {
    expect(centralNextAction({
      incident: base,
      openAssistanceCount: 0,
      nextNotification: 'Notfallkoordinator',
    })).toMatchObject({ kind: 'notification', text: 'Notfallkoordinator' })
  })

  it('shows no open work after completion', () => {
    expect(centralNextAction({
      incident: { ...base, status: 'erledigt' },
      openAssistanceCount: 3,
      nextNotification: 'Bürgermeisterin',
    }).kind).toBe('done')
  })
})

describe('eventNeedsClosureHint', () => {
  it('only hints for active events without open incidents', () => {
    expect(eventNeedsClosureHint({ eventStatus: 'aktiv', openIncidentCount: 0 })).toBe(true)
    expect(eventNeedsClosureHint({ eventStatus: 'aktiv', openIncidentCount: 1 })).toBe(false)
    expect(eventNeedsClosureHint({ eventStatus: 'abgeschlossen', openIncidentCount: 0 })).toBe(false)
  })
})
