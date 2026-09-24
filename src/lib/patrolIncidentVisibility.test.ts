import { describe, expect, it } from 'vitest'
import { classifyPatrolIncidents } from './patrolIncidentVisibility'

describe('Einsatzsicht der Streifen', () => {
  const incident = (id: string, overrides: Record<string, string | null> = {}) => ({
    id, status: 'offen', disposition: 'jd', assigned_vehicle_id: null,
    taken_over_vehicle_id: null, taken_over_by: null, ...overrides,
  })

  it('zeigt einen Einsatz der anderen Streife weiterhin an, ohne ihn zur Übernahme freizugeben', () => {
    const result = classifyPatrolIncidents([incident('anderer', { assigned_vehicle_id: 'fahrzeug-b' })], 'fahrzeug-a', 'person-a', 'jd', new Set())
    expect(result.other.map(row => row.id)).toEqual(['anderer'])
    expect(result.available).toEqual([])
  })

  it('trennt eigene, unterstützte, freie und zentral geführte Einsätze', () => {
    const rows = [
      incident('eigener', { assigned_vehicle_id: 'fahrzeug-a' }),
      incident('unterstuetzt', { assigned_vehicle_id: 'fahrzeug-b' }),
      incident('frei', { disposition: 'offen' }),
      incident('zentrale', { disposition: 'zentrale' }),
      incident('vd', { disposition: 'vd' }),
    ]
    const result = classifyPatrolIncidents(rows, 'fahrzeug-a', 'person-a', 'jd', new Set(['unterstuetzt']))
    expect(result.own.map(row => row.id)).toEqual(['eigener'])
    expect(result.supported.map(row => row.id)).toEqual(['unterstuetzt'])
    expect(result.available.map(row => row.id)).toEqual(['frei'])
    expect(result.other.map(row => row.id)).toEqual(['zentrale', 'vd'])
  })
})
