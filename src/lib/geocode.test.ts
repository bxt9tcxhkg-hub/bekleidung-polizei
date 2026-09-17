import { afterEach, describe, expect, it, vi } from 'vitest'
import { geocodeLocation, suggestStreets } from './geocode'

afterEach(() => { vi.unstubAllGlobals() })

describe('suggestStreets', () => {
  it('gibt bei zu kurzer Eingabe leeres Array zurück, ohne einen Request zu senden', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await suggestStreets('E')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sucht zuerst strukturiert über VOGIS (Gemeinde Dornbirn) und dedupliziert nach Straße+Hausnummer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          { properties: { strasse: 'Eisengasse', hausnr: '1' }, geometry: { coordinates: [9.75, 47.41] } },
          { properties: { strasse: 'Eisengasse', hausnr: '1' }, geometry: { coordinates: [9.75, 47.41] } },
          { properties: { strasse: 'Eisenbahnstraße', hausnr: '2' }, geometry: { coordinates: [9.77, 47.43] } },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await suggestStreets('Eisen')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestedUrl = String(fetchMock.mock.calls[0][0])
    expect(requestedUrl).toContain('vogis.cnv.at')
    expect(requestedUrl).toContain('CQL_FILTER')
    expect(requestedUrl).toContain('Dornbirn')
    expect(result).toEqual([
      { street: 'Eisengasse', houseNumber: '1', label: 'Eisengasse 1', lat: 47.41, lng: 9.75 },
      { street: 'Eisenbahnstraße', houseNumber: '2', label: 'Eisenbahnstraße 2', lat: 47.43, lng: 9.77 },
    ])
  })

  it('fällt auf Nominatim zurück, wenn VOGIS keine Treffer liefert', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { lat: '47.41', lon: '9.75', address: { road: 'Eisengasse' } },
          { lat: '47.42', lon: '9.76', address: { road: 'Eisengasse' } },
          { lat: '47.44', lon: '9.78', address: {} },
        ],
      })
    vi.stubGlobal('fetch', fetchMock)
    const result = await suggestStreets('Eisen')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const nominatimUrl = String(fetchMock.mock.calls[1][0])
    expect(nominatimUrl).toContain('street=Eisen')
    expect(nominatimUrl).toContain('city=Dornbirn')
    expect(nominatimUrl).toContain('country=Austria')
    expect(result).toEqual([{ street: 'Eisengasse', lat: 47.41, lng: 9.75 }])
  })

  it('gibt leeres Array zurück, wenn nichts gefunden wurde oder die Anfrage fehlschlägt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await suggestStreets('Unbekannt')).toEqual([])
  })

  it('gibt leeres Array zurück, wenn fetch selbst fehlschlägt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    expect(await suggestStreets('Irgendwas')).toEqual([])
  })
})

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
