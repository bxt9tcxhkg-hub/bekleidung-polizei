import { describe, it, expect } from 'vitest'
import { corsHeadersForOrigin, isAllowedAppOrigin } from './appOrigins'

describe('isAllowedAppOrigin', () => {
  it('erlaubt lokale Dev-Origins und die Pages-Produktion', () => {
    expect(isAllowedAppOrigin('http://localhost:5173')).toBe(true)
    expect(isAllowedAppOrigin('https://bekleidung-polizei.pages.dev')).toBe(true)
  })

  it('erlaubt Preview-Subdomains der App, nicht beliebige pages.dev', () => {
    expect(isAllowedAppOrigin('https://cursor-production-ready-bekl.bekleidung-polizei.pages.dev')).toBe(true)
    expect(isAllowedAppOrigin('https://evil.pages.dev')).toBe(false)
  })

  it('lehnt Wildcard und fremde Origins ab', () => {
    expect(isAllowedAppOrigin('*')).toBe(false)
    expect(isAllowedAppOrigin('https://example.com')).toBe(false)
    expect(isAllowedAppOrigin('')).toBe(false)
  })

  it('nimmt zusätzliche Origins aus der Umgebung an', () => {
    expect(isAllowedAppOrigin('https://bekleidung.dornbirn.at', ['https://bekleidung.dornbirn.at'])).toBe(true)
  })
})

describe('corsHeadersForOrigin', () => {
  it('setzt Access-Control-Allow-Origin nie auf *', () => {
    const allowed = corsHeadersForOrigin('http://localhost:5173')
    expect(allowed['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
    expect(allowed['Access-Control-Allow-Origin']).not.toBe('*')

    const denied = corsHeadersForOrigin('https://evil.example')
    expect(denied['Access-Control-Allow-Origin']).toBeUndefined()
    expect(Object.values(denied).join(' ')).not.toContain('*')
  })
})
