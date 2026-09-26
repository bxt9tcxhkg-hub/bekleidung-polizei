import { describe, expect, it } from 'vitest'
import { besondererTagFarbe, besondererTagFarbKlassen, kategorieFarbenMap, kategorieFarbKlassen, markierungFarbKlassen } from './dienstplanMarkierungen'

describe('markierungFarbKlassen', () => {
  it('liefert je definierter Farbe eine kräftigere Nacht-Nuance derselben Farbe', () => {
    expect(markierungFarbKlassen('blau')).toEqual({ bg: 'bg-blue-100', bgNacht: 'bg-blue-200', text: 'text-blue-900' })
    expect(markierungFarbKlassen('lila').bgNacht).toBe('bg-purple-200')
    expect(markierungFarbKlassen('orange').bgNacht).toBe('bg-orange-200')
    expect(markierungFarbKlassen('tuerkis').bgNacht).toBe('bg-teal-200')
    expect(markierungFarbKlassen('gelb').bgNacht).toBe('bg-yellow-200')
    expect(markierungFarbKlassen('gruen').bgNacht).toBe('bg-green-200')
    expect(markierungFarbKlassen('rosa').bgNacht).toBe('bg-pink-200')
  })
  it('fällt bei unbekannter Farbe auf Grau zurück', () => {
    expect(markierungFarbKlassen('irgendwas')).toEqual({ bg: 'bg-gray-200', bgNacht: 'bg-gray-300', text: 'text-gray-900' })
  })
})

describe('kategorieFarbenMap', () => {
  it('übernimmt nur Zeilen mit gesetzter kategorie', () => {
    const map = kategorieFarbenMap([
      { kategorie: 'krank', farbe: 'blau' },
      { kategorie: null, farbe: 'lila' },
    ])
    expect(map.get('krank')).toBe('blau')
    expect(map.size).toBe(1)
  })
})

describe('kategorieFarbKlassen', () => {
  it('nutzt die vom Planer eingestellte Farbe, wenn vorhanden', () => {
    const map = kategorieFarbenMap([{ kategorie: 'krank', farbe: 'blau' }])
    expect(kategorieFarbKlassen('krank', map)?.bg).toBe('bg-blue-100')
  })
  it('fällt ohne eingestellte Farbe auf die ursprünglichen Standardfarben zurück (Urlaub/Sonderurlaub/Stundenersatz gelb, Krank grün, Karenz rosa)', () => {
    const leer = kategorieFarbenMap([])
    expect(kategorieFarbKlassen('urlaub', leer)?.bg).toBe('bg-yellow-100')
    expect(kategorieFarbKlassen('sonderurlaub', leer)?.bg).toBe('bg-yellow-100')
    expect(kategorieFarbKlassen('stundenersatz', leer)?.bg).toBe('bg-yellow-100')
    expect(kategorieFarbKlassen('krank', leer)?.bg).toBe('bg-green-100')
    expect(kategorieFarbKlassen('karenz', leer)?.bg).toBe('bg-pink-100')
  })
  it('gibt für Dienst und Sonstiges keine Farbe zurück', () => {
    const leer = kategorieFarbenMap([])
    expect(kategorieFarbKlassen('dienst', leer)).toBeNull()
    expect(kategorieFarbKlassen('sonstiges', leer)).toBeNull()
  })
})

describe('besondererTagFarbe', () => {
  it('nutzt die vom Planer eingestellte Farbe der System-Markierung "wochenende_feiertag"', () => {
    expect(besondererTagFarbe([{ kategorie: 'wochenende_feiertag', farbe: 'blau' }])).toBe('blau')
  })
  it('fällt ohne eingestellte Zeile auf Orange zurück (ursprünglich hart codiertes Amber)', () => {
    expect(besondererTagFarbe([])).toBe('orange')
    expect(besondererTagFarbe([{ kategorie: 'krank', farbe: 'gruen' }])).toBe('orange')
  })
})

describe('besondererTagFarbKlassen', () => {
  it('liefert eine hellere Tönung als markierungFarbKlassen (eigene Klassen, über die ganze Zeile gelegt)', () => {
    expect(besondererTagFarbKlassen('orange')).toEqual({ bg: 'bg-orange-50', bgNacht: 'bg-orange-100', textTag: 'text-orange-800', textAbschnitt: 'text-orange-700' })
  })
  it('fällt bei unbekannter Farbe auf Grau zurück', () => {
    expect(besondererTagFarbKlassen('irgendwas').bg).toBe('bg-gray-50')
  })
})
