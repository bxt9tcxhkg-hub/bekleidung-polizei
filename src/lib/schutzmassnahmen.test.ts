import { describe, expect, it } from 'vitest'
import { assessDistance, distanceNote, haversineMeters } from './schutzmassnahmen'

describe('Schutzmaßnahmen-Distanzhilfe', () => {
  it('berechnet eine plausible Luftlinie', () => {
    const meters = haversineMeters({ lat: 47.4125, lng: 9.7417 }, { lat: 47.4134, lng: 9.7417 })
    expect(meters).toBeGreaterThan(95)
    expect(meters).toBeLessThan(105)
  })

  it('gibt bei überlappender GPS-Genauigkeit keine falsche Sicherheit', () => {
    expect(assessDistance(105, 100, 10).code).toBe('unklar')
    expect(assessDistance(80, 100, 5).code).toBe('innerhalb')
    expect(assessDistance(120, 100, 5).code).toBe('ausserhalb')
  })

  it('kennzeichnet den Text ausdrücklich als PAD-Ergänzung', () => {
    expect(distanceNote(96, 8, 'zwischen den Personen')).toContain('PAD-Protokollierung')
  })
})
