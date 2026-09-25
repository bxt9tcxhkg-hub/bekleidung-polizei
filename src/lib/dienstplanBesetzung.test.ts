import { describe, expect, it } from 'vitest'
import { fehlendeGrundbesetzung, istUrlaubsKuerzel, kachelRang, tagOderNacht } from './dienstplanBesetzung'

describe('tagOderNacht', () => {
  it('ordnet eine Zeile ohne Uhrzeit der Nacht zu', () => {
    expect(tagOderNacht(null)).toBe('nacht')
  })
  it('ordnet 08:00 dem Tag zu, 22:00 der Nacht', () => {
    expect(tagOderNacht('08:00')).toBe('tag')
    expect(tagOderNacht('22:00')).toBe('nacht')
  })
})

describe('kachelRang', () => {
  it('reiht Z, ID, JD, VD/ZIV, Bhf in dieser Reihenfolge, unabhängig von Groß-/Kleinschreibung', () => {
    expect(kachelRang('Z')).toBeLessThan(kachelRang('ID'))
    expect(kachelRang('id')).toBeLessThan(kachelRang('JD'))
    expect(kachelRang('jd')).toBeLessThan(kachelRang('VD/ZIV'))
    expect(kachelRang('bhf')).toBeGreaterThan(kachelRang('VD/ZIV'))
  })
  it('reiht unbekannte Kürzel ganz hinten ein', () => {
    expect(kachelRang('ET')).toBeGreaterThan(kachelRang('Bhf'))
  })
})

describe('istUrlaubsKuerzel', () => {
  it('erkennt nur das exakte Kürzel U, unabhängig von Groß-/Kleinschreibung', () => {
    expect(istUrlaubsKuerzel('U')).toBe(true)
    expect(istUrlaubsKuerzel('u')).toBe(true)
    expect(istUrlaubsKuerzel('VD')).toBe(false)
  })
})

describe('fehlendeGrundbesetzung', () => {
  it('meldet alle sechs Grundbesetzungs-Slots (Z/ID/JD je Tag+Nacht) als fehlend, wenn kein Dienst eingetragen ist', () => {
    const ergebnis = fehlendeGrundbesetzung([], ['2026-10-05'])
    expect(ergebnis.get('2026-10-05')).toHaveLength(6)
  })

  it('meldet nichts fehlend, wenn Z/ID/JD tags UND nachts jeweils besetzt sind', () => {
    const dienste = ['Z', 'ID', 'JD'].flatMap(code => [
      { datum: '2026-10-05', rohtext: code, von_zeit: '08:00', kategorie: 'dienst' as const },
      { datum: '2026-10-05', rohtext: code, von_zeit: null, kategorie: 'dienst' as const },
    ])
    expect(fehlendeGrundbesetzung(dienste, ['2026-10-05']).has('2026-10-05')).toBe(false)
  })

  it('meldet nur den fehlenden Slot, wenn Z nur tagsüber, aber nicht nachts besetzt ist', () => {
    const dienste = [
      { datum: '2026-10-05', rohtext: 'Z', von_zeit: '08:00', kategorie: 'dienst' as const },
      { datum: '2026-10-05', rohtext: 'ID', von_zeit: '08:00', kategorie: 'dienst' as const },
      { datum: '2026-10-05', rohtext: 'ID', von_zeit: null, kategorie: 'dienst' as const },
      { datum: '2026-10-05', rohtext: 'JD', von_zeit: '08:00', kategorie: 'dienst' as const },
      { datum: '2026-10-05', rohtext: 'JD', von_zeit: null, kategorie: 'dienst' as const },
    ]
    expect(fehlendeGrundbesetzung(dienste, ['2026-10-05']).get('2026-10-05')).toEqual(['Z (Nacht)'])
  })

  it('ignoriert Abwesenheiten (kategorie != dienst) und Zusatzdienste bei der Grundbesetzungs-Prüfung', () => {
    const dienste = [
      { datum: '2026-10-05', rohtext: 'Z', von_zeit: null, kategorie: 'krank' as const },
      { datum: '2026-10-05', rohtext: 'VD', von_zeit: '08:00', kategorie: 'dienst' as const },
    ]
    expect(fehlendeGrundbesetzung(dienste, ['2026-10-05']).get('2026-10-05')).toHaveLength(6)
  })
})
