import { describe, expect, it, vi } from 'vitest'
import { LoadTimeoutError, isLoadTimeoutError, loadErrorMessage, withTimeout } from './loadTimeout'

describe('withTimeout', () => {
  it('löst mit dem Ergebnis der Promise auf, wenn diese vor dem Timeout fertig wird', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
  })

  it('gibt einen Fehler der ursprünglichen Promise weiter', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom')
  })

  it('bricht mit LoadTimeoutError ab, wenn die Promise nie fertig wird', async () => {
    vi.useFakeTimers()
    const hanging = new Promise(() => {})
    const result = withTimeout(hanging, 15000)
    const assertion = expect(result).rejects.toBeInstanceOf(LoadTimeoutError)
    await vi.advanceTimersByTimeAsync(15000)
    await assertion
    vi.useRealTimers()
  })
})

describe('isLoadTimeoutError', () => {
  it('erkennt LoadTimeoutError, aber keine anderen Fehler', () => {
    expect(isLoadTimeoutError(new LoadTimeoutError())).toBe(true)
    expect(isLoadTimeoutError(new Error('other'))).toBe(false)
    expect(isLoadTimeoutError('nope')).toBe(false)
  })
})

describe('loadErrorMessage', () => {
  it('nutzt bei Timeout eine eigene Meldung statt des Fallbacks', () => {
    expect(loadErrorMessage(new LoadTimeoutError(), 'Fallback')).toContain('Zeitüberschreitung')
  })

  it('nutzt sonst den übergebenen Fallback', () => {
    expect(loadErrorMessage(new Error('other'), 'Fallback')).toBe('Fallback')
    expect(loadErrorMessage('nope', 'Fallback')).toBe('Fallback')
  })
})
