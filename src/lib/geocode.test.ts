import { afterEach, describe, expect, it, vi } from 'vitest'
import { geocodeLocation } from './geocode'

afterEach(() => { vi.unstubAllGlobals() })

describe('geocodeLocation', () => {
  it('gibt null bei leerer Eingabe zurück, ohne einen Request zu senden', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await geocodeLocation('   ')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hängt Dornbirn/Österreich an die Anfrage an und liefert das erste Ergebnis', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '47.4125', lon: '9.7417', display_name: 'Rathausplatz, Dornbirn, Österreich' }],
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await geocodeLocation('Rathausplatz 2')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestedUrl = String(fetchMock.mock.calls[0][0])
    expect(requestedUrl).toContain(encodeURIComponent('Rathausplatz 2, Dornbirn, Österreich'))
    expect(result).toEqual({ lat: 47.4125, lng: 9.7417, displayName: 'Rathausplatz, Dornbirn, Österreich' })
  })

  it('gibt null zurück, wenn nichts gefunden wurde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    expect(await geocodeLocation('Unbekannter Ort')).toBeNull()
  })

  it('gibt null bei einer fehlgeschlagenen Anfrage zurück, statt zu werfen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await geocodeLocation('Irgendwo')).toBeNull()
  })

  it('gibt null zurück, wenn fetch selbst fehlschlägt (z. B. Netzwerkfehler)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    expect(await geocodeLocation('Irgendwo')).toBeNull()
  })
})
