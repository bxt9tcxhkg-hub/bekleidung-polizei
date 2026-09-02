import { describe, expect, it } from 'vitest'
import {
  APP_ERROR_MESSAGE_MAX,
  APP_ERROR_STACK_MAX,
  buildAppErrorInsert,
  redactSecrets,
  sanitizeErrorText,
  truncateText,
} from './appErrors'

describe('truncateText', () => {
  it('lässt kurze Texte unverändert und schneidet lange ab', () => {
    expect(truncateText('kurz', 10)).toBe('kurz')
    expect(truncateText('abcdefghij', 10)).toBe('abcdefghij')
    expect(truncateText('abcdefghijk', 10)).toBe('abcdefghij')
    expect(truncateText('abc', 0)).toBe('')
  })
})

describe('redactSecrets', () => {
  it('entfernt JWT, Bearer-Token und Passwort- bzw. Token-Werte', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dGVzdA'
    expect(redactSecrets(`Authorization: Bearer ${jwt}`)).toBe('Authorization: Bearer [REDACTED]')
    expect(redactSecrets(`token=${jwt}`)).toContain('[REDACTED]')
    expect(redactSecrets('password=geheim123')).toBe('password=[REDACTED]')
    expect(redactSecrets('access_token: abcdef')).toBe('access_token: [REDACTED]')
    expect(redactSecrets('https://x.example/cb?access_token=secret&x=1')).toBe(
      'https://x.example/cb?access_token=[REDACTED]&x=1',
    )
  })

  it('lässt normale Fehlermeldungen ohne Geheimnisse stehen', () => {
    expect(redactSecrets('Ein Fehler ist aufgetreten')).toBe('Ein Fehler ist aufgetreten')
    expect(redactSecrets('Ungültiges Passwort')).toBe('Ungültiges Passwort')
  })
})

describe('sanitizeErrorText', () => {
  it('redaktiert und kürzt auf die Maximallänge', () => {
    const long = `password=supergeheim ${'x'.repeat(APP_ERROR_MESSAGE_MAX)}`
    const out = sanitizeErrorText(long, APP_ERROR_MESSAGE_MAX)
    expect(out.length).toBeLessThanOrEqual(APP_ERROR_MESSAGE_MAX)
    expect(out).toContain('[REDACTED]')
    expect(out).not.toContain('supergeheim')
  })
})

describe('buildAppErrorInsert', () => {
  it('baut eine gekürzte Zeile ohne Passwort oder Token', () => {
    const row = buildAppErrorInsert({
      message: `Boom password=hunter2 ${'m'.repeat(600)}`,
      stack: `Bearer tokensecret\n${'s'.repeat(APP_ERROR_STACK_MAX + 50)}`,
      source: 'boundary',
      path: '/bestellungen',
      userAgent: 'Mozilla/5.0',
      userId: '11111111-1111-1111-1111-111111111111',
      roleSnapshot: ['admin', 'sachbearbeiter'],
    })

    expect(row.source).toBe('boundary')
    expect(row.path).toBe('/bestellungen')
    expect(row.user_id).toBe('11111111-1111-1111-1111-111111111111')
    expect(row.role_snapshot).toEqual(['admin', 'sachbearbeiter'])
    expect(row.user_agent).toBe('Mozilla/5.0')
    expect(row.message.length).toBeLessThanOrEqual(APP_ERROR_MESSAGE_MAX)
    expect(row.stack?.length ?? 0).toBeLessThanOrEqual(APP_ERROR_STACK_MAX)
    expect(row.message).not.toContain('hunter2')
    expect(row.stack).not.toContain('tokensecret')
    expect(row.message).toContain('[REDACTED]')
  })

  it('setzt sichere Fallbacks für leere Felder', () => {
    const row = buildAppErrorInsert({
      message: '',
      source: 'window',
      path: '',
    })
    expect(row.message).toBe('Unbekannter Fehler')
    expect(row.path).toBe('/')
    expect(row.stack).toBeNull()
    expect(row.user_id).toBeNull()
    expect(row.role_snapshot).toEqual([])
  })
})
