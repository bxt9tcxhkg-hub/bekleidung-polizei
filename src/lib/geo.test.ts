import { describe, expect, it } from 'vitest'
import { navigationUrl } from './geo'

describe('navigationUrl', () => {
  it('nimmt Koordinaten, wenn vorhanden', () => {
    expect(navigationUrl({ lat: 47.4125, lng: 9.7417 }, 'Marktstraße 1')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=47.4125,9.7417',
    )
  })

  it('fällt ohne Koordinaten auf die Adresse zurück', () => {
    expect(navigationUrl(null, 'Marktstraße 1, Dornbirn')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Marktstra%C3%9Fe%201%2C%20Dornbirn',
    )
  })

  it('ignoriert leere/fehlende Adresse ohne Koordinaten', () => {
    expect(navigationUrl(null, null)).toBeNull()
    expect(navigationUrl(null, undefined)).toBeNull()
    expect(navigationUrl(null, '   ')).toBeNull()
  })
})
