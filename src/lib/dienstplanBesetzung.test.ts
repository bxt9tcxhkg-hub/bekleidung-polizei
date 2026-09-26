import { describe, expect, it } from 'vitest'
import { abschnittFuerAnzeige, absenzFarbe, effektiveAbwesenheitJeTag, fehlendeGrundbesetzung, kachelRang, tagOderNacht } from './dienstplanBesetzung'

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

describe('abschnittFuerAnzeige', () => {
  it('ordnet Dienst-Zeilen anhand der Uhrzeit ein, Abwesenheiten immer der Tag-Zeile', () => {
    expect(abschnittFuerAnzeige({ kategorie: 'dienst', von_zeit: '08:00' })).toBe('tag')
    expect(abschnittFuerAnzeige({ kategorie: 'dienst', von_zeit: '22:00' })).toBe('nacht')
    expect(abschnittFuerAnzeige({ kategorie: 'urlaub', von_zeit: null })).toBe('tag')
    expect(abschnittFuerAnzeige({ kategorie: 'krank', von_zeit: null })).toBe('tag')
  })
})

describe('absenzFarbe', () => {
  it('markiert Urlaub/Sonderurlaub/Stundenersatz gelb, Krank grün, Karenz rosa', () => {
    expect(absenzFarbe('urlaub')?.bg).toBe('bg-yellow-100')
    expect(absenzFarbe('sonderurlaub')?.bg).toBe('bg-yellow-100')
    expect(absenzFarbe('stundenersatz')?.bg).toBe('bg-yellow-100')
    expect(absenzFarbe('krank')?.bg).toBe('bg-green-100')
    expect(absenzFarbe('karenz')?.bg).toBe('bg-pink-100')
  })
  it('hat für die Nacht-Zeile eine kräftigere Nuance derselben Farbe (durchgehende Markierung mit Tag/Nacht-Unterschied)', () => {
    expect(absenzFarbe('urlaub')?.bgNacht).toBe('bg-yellow-200')
    expect(absenzFarbe('krank')?.bgNacht).toBe('bg-green-200')
    expect(absenzFarbe('karenz')?.bgNacht).toBe('bg-pink-200')
  })
  it('gibt für Dienst und Sonstiges keine Farbe zurück', () => {
    expect(absenzFarbe('dienst')).toBeNull()
    expect(absenzFarbe('sonstiges')).toBeNull()
  })
})

describe('fehlendeGrundbesetzung', () => {
  it('meldet je Zeitabschnitt einen fehlenden Eintrag pro Kürzel (Z/ID/JD), auch wenn JD zwei Personen braucht', () => {
    const ergebnis = fehlendeGrundbesetzung([], ['2026-10-05'])
    expect(ergebnis.get('2026-10-05')).toEqual(['Z (Tag)', 'ID (Tag)', 'JD 0/2 (Tag)', 'Z (Nacht)', 'ID (Nacht)', 'JD 0/2 (Nacht)'])
  })

  it('meldet nichts fehlend, wenn Z/ID je einmal und JD je zweimal tags UND nachts besetzt sind', () => {
    const dienste = [
      ...['Z', 'ID'].flatMap(code => [
        { datum: '2026-10-05', rohtext: code, von_zeit: '08:00', kategorie: 'dienst' as const },
        { datum: '2026-10-05', rohtext: code, von_zeit: null, kategorie: 'dienst' as const },
      ]),
      { datum: '2026-10-05', rohtext: 'JD', von_zeit: '08:00', kategorie: 'dienst' as const },
      { datum: '2026-10-05', rohtext: 'JD', von_zeit: '08:00', kategorie: 'dienst' as const },
      { datum: '2026-10-05', rohtext: 'JD', von_zeit: null, kategorie: 'dienst' as const },
      { datum: '2026-10-05', rohtext: 'JD', von_zeit: null, kategorie: 'dienst' as const },
    ]
    expect(fehlendeGrundbesetzung(dienste, ['2026-10-05']).has('2026-10-05')).toBe(false)
  })

  it('meldet den fehlenden Slot mit Mengenangabe, wenn JD nachts nur einmal statt zweimal besetzt ist', () => {
    const dienste = [
      { datum: '2026-10-05', rohtext: 'Z', von_zeit: '08:00', kategorie: 'dienst' as const },
      { datum: '2026-10-05', rohtext: 'Z', von_zeit: null, kategorie: 'dienst' as const },
      { datum: '2026-10-05', rohtext: 'ID', von_zeit: '08:00', kategorie: 'dienst' as const },
      { datum: '2026-10-05', rohtext: 'ID', von_zeit: null, kategorie: 'dienst' as const },
      { datum: '2026-10-05', rohtext: 'JD', von_zeit: '08:00', kategorie: 'dienst' as const },
      { datum: '2026-10-05', rohtext: 'JD', von_zeit: '08:00', kategorie: 'dienst' as const },
      { datum: '2026-10-05', rohtext: 'JD', von_zeit: null, kategorie: 'dienst' as const },
    ]
    expect(fehlendeGrundbesetzung(dienste, ['2026-10-05']).get('2026-10-05')).toEqual(['JD 1/2 (Nacht)'])
  })

  it('ignoriert Abwesenheiten (kategorie != dienst) und Zusatzdienste bei der Grundbesetzungs-Prüfung', () => {
    const dienste = [
      { datum: '2026-10-05', rohtext: 'Z', von_zeit: null, kategorie: 'krank' as const },
      { datum: '2026-10-05', rohtext: 'VD', von_zeit: '08:00', kategorie: 'dienst' as const },
    ]
    expect(fehlendeGrundbesetzung(dienste, ['2026-10-05']).get('2026-10-05')).toHaveLength(6)
  })
})

describe('effektiveAbwesenheitJeTag', () => {
  // 2026-10-02 = Freitag, 03/04 = Sa/So, 05 = Montag, 06 = Dienstag.
  const woche = ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']

  it('füllt das Wochenende, wenn Freitag UND der folgende Montag dieselbe Abwesenheit haben', () => {
    const dienste = [
      { beamter_id: 'a', datum: '2026-10-02', kategorie: 'krank' as const },
      { beamter_id: 'a', datum: '2026-10-05', kategorie: 'krank' as const },
    ]
    const ergebnis = effektiveAbwesenheitJeTag(dienste, ['a'], woche)
    expect(ergebnis.get('a|2026-10-03')).toBe('krank')
    expect(ergebnis.get('a|2026-10-04')).toBe('krank')
    expect(ergebnis.has('a|2026-10-02')).toBe(false)
    expect(ergebnis.has('a|2026-10-05')).toBe(false)
  })

  it('füllt das Wochenende NICHT, wenn die Person am Montag wieder im Dienst ist (kein Eintrag am Werktag = Kette unterbrochen)', () => {
    const dienste = [{ beamter_id: 'a', datum: '2026-10-02', kategorie: 'krank' as const }]
    const ergebnis = effektiveAbwesenheitJeTag(dienste, ['a'], woche)
    expect(ergebnis.has('a|2026-10-03')).toBe(false)
    expect(ergebnis.has('a|2026-10-04')).toBe(false)
  })

  it('füllt das Wochenende NICHT, wenn Freitag und Montag unterschiedliche Kategorien haben', () => {
    const dienste = [
      { beamter_id: 'a', datum: '2026-10-02', kategorie: 'krank' as const },
      { beamter_id: 'a', datum: '2026-10-05', kategorie: 'urlaub' as const },
    ]
    const ergebnis = effektiveAbwesenheitJeTag(dienste, ['a'], woche)
    expect(ergebnis.has('a|2026-10-03')).toBe(false)
    expect(ergebnis.has('a|2026-10-04')).toBe(false)
  })
})
