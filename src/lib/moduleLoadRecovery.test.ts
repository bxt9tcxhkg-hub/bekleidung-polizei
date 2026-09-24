import { describe, expect, it } from 'vitest'
import { isStaleModuleError } from './moduleLoadRecovery'

describe('isStaleModuleError', () => {
  it.each([
    "'text/html' is not a valid JavaScript MIME type for module script",
    'Failed to fetch dynamically imported module',
    'Importing a module script failed',
    'ChunkLoadError: Loading chunk 17 failed',
  ])('erkennt veraltete Moduldateien: %s', message => {
    expect(isStaleModuleError(message)).toBe(true)
  })

  it('verwechselt normale Anwendungsfehler nicht mit einem Deploymentwechsel', () => {
    expect(isStaleModuleError('Speichern fehlgeschlagen')).toBe(false)
  })
})
