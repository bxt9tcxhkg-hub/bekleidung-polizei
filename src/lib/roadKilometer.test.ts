import { describe, expect, it } from 'vitest'
import {
  composeKilometerLocation,
  formatRoadNumber,
  normalizeKilometer,
  parseKilometerLocation,
} from './roadKilometer'

describe('Straßenkilometrierung', () => {
  it('formatiert Landesstraßennummern verständlich', () => {
    expect(formatRoadNumber('L48')).toBe('L 48')
    expect(formatRoadNumber(' l 48 ')).toBe('L 48')
  })

  it('akzeptiert nur amtliche 100-Meter-Schritte', () => {
    expect(normalizeKilometer('5,7')).toBe('5.7')
    expect(normalizeKilometer('5.7')).toBe('5.7')
    expect(normalizeKilometer('5,75')).toBeNull()
  })

  it('speichert Name, Nummer und Kilometer gemeinsam', () => {
    expect(composeKilometerLocation('Bödelestraße', 'L48', '5.7'))
      .toBe('Bödelestraße (L 48), km 5,7')
  })

  it('erkennt eine gespeicherte Kilometrierung beim Bearbeiten', () => {
    expect(parseKilometerLocation('Bödelestraße (L 48), km 5,7')).toEqual({
      roadName: 'Bödelestraße',
      roadNumber: 'L 48',
      kilometer: '5,7',
    })
    expect(parseKilometerLocation('Marktstraße 10')).toBeNull()
  })
})
