import { describe, expect, it } from 'vitest'
import { markierungFarbKlassen } from './dienstplanMarkierungen'

describe('markierungFarbKlassen', () => {
  it('liefert je definierter Farbe eine kräftigere Nacht-Nuance derselben Farbe', () => {
    expect(markierungFarbKlassen('blau')).toEqual({ bg: 'bg-blue-100', bgNacht: 'bg-blue-200', text: 'text-blue-900' })
    expect(markierungFarbKlassen('lila').bgNacht).toBe('bg-purple-200')
    expect(markierungFarbKlassen('orange').bgNacht).toBe('bg-orange-200')
    expect(markierungFarbKlassen('tuerkis').bgNacht).toBe('bg-teal-200')
  })
  it('fällt bei unbekannter Farbe auf Grau zurück', () => {
    expect(markierungFarbKlassen('irgendwas')).toEqual({ bg: 'bg-gray-200', bgNacht: 'bg-gray-300', text: 'text-gray-900' })
  })
})
