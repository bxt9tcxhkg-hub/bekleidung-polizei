import { describe, it, expect } from 'vitest'
import { automatischeSpaltenZuordnung, baueDienstePayload, istSpalteAktiv, kategorisiereRohtext, parseDienstCode, parseDienstplanGrid, type DienstplanProfilOption, type DienstplanSpaltenZuordnung, type DienstplanZelle } from './dienstplanImport'

describe('parseDienstCode', () => {
  it('trennt Code und Uhrzeit bei einem einfachen Dienst', () => {
    expect(parseDienstCode('VD 08-19')).toEqual({ code: 'VD', vonZeit: '08:00', bisZeit: '19:00' })
  })
  it('erkennt Uhrzeiten mit Minuten (Punkt- oder Doppelpunkt-Trennung)', () => {
    expect(parseDienstCode('SVE 08:15-12:30')).toEqual({ code: 'SVE', vonZeit: '08:15', bisZeit: '12:30' })
    expect(parseDienstCode('Sch/VD 07.00-19.00')).toEqual({ code: 'Sch/VD', vonZeit: '07:00', bisZeit: '19:00' })
  })
  it('erkennt einen Nachtdienst über Mitternacht (22-06) ohne Tagesumbruch zu berechnen', () => {
    expect(parseDienstCode('22-06')).toEqual({ code: '22-06', vonZeit: '22:00', bisZeit: '06:00' })
  })
  it('ohne erkennbare Uhrzeit bleibt der volle Text als Code, ohne Zeiten', () => {
    expect(parseDienstCode('krank')).toEqual({ code: 'krank', vonZeit: null, bisZeit: null })
    expect(parseDienstCode('Urlaub')).toEqual({ code: 'Urlaub', vonZeit: null, bisZeit: null })
  })
})

describe('kategorisiereRohtext', () => {
  it('erkennt krank, Urlaub, Sonderurlaub und Karenz unabhängig von Groß-/Kleinschreibung', () => {
    expect(kategorisiereRohtext('krank')).toBe('krank')
    expect(kategorisiereRohtext('Urlaub')).toBe('urlaub')
    expect(kategorisiereRohtext('SoUrl')).toBe('sonderurlaub')
    expect(kategorisiereRohtext('Karenz')).toBe('karenz')
  })
  it('alles andere gilt als regulärer Dienst', () => {
    expect(kategorisiereRohtext('VD 08-19')).toBe('dienst')
    expect(kategorisiereRohtext('JD')).toBe('dienst')
  })
})

// Nachbildung der echten Vorlage in verkleinerter Form: Titel-/ID-Zeilen,
// dann die Namens-Kopfzeile, dann rund 20 (hier: 2) Monatssummen-Zeilen mit
// Zahlen in denselben Spalten, erst danach beginnen die eigentlichen
// Tages-Zeilen (siehe Analyse Februar 2026 - die Kopfzeile liegt NICHT
// direkt über der ersten Datumszeile).
function beispielGrid(): DienstplanZelle[][] {
  return [
    [null, null, null, null, null, null, null, null, null], // 0: Titel
    [null, null, null, null, null, null, null, null, null], // 1
    [null, null, null, null, 3, 2, 0, 1, 'x'], // 2: numerische ID-Zeile mit einer Ausnahme
    [null, null, null, 'Frei', 'Mustermann', 'Beispiel', 'Inaktiv', 'Vierte', 'Immer'], // 3: Kopfzeile (Namen)
    [null, null, null, 'Anzahl X', 5, 3, 0, 2, 0], // 4: Monatssumme
    [null, null, null, 'Std Y', 10, 20, 0, 5, 0], // 5: Monatssumme
    ['Mo', null, new Date(2026, 1, 2), null, 'VD 08-19', 'krank', null, 'Urlaub', null], // 6: Mo 2.2. Zeile 1
    ['Mo', null, new Date(2026, 1, 2), null, null, null, null, null, null], // 7: Mo 2.2. Zeile 2
    ['Di', null, new Date(2026, 1, 3), null, 'Urlaub', 'SoUrl', null, '22-06', null], // 8: Di 3.2. Zeile 1
    ['Di', null, new Date(2026, 1, 3), null, null, 'Karenz', null, null, null], // 9: Di 3.2. Zeile 2
    ['So', null, new Date(2026, 2, 1), null, 'VD 08-19', null, null, null, null], // 10: überläuft in den März - muss rausgefiltert werden
    ['So', null, new Date(2026, 2, 1), null, null, null, null, null, null], // 11
  ]
}

describe('parseDienstplanGrid', () => {
  it('findet Monat, Kopfzeile (trotz Abstand zur ersten Datumszeile) und Personen-Spalten', () => {
    const ergebnis = parseDienstplanGrid(beispielGrid())
    if ('error' in ergebnis) throw new Error(ergebnis.error)
    expect(ergebnis.monat).toBe('2026-02-01')
    expect(ergebnis.spalten.map(s => s.name)).toEqual(['Mustermann', 'Beispiel', 'Inaktiv', 'Vierte', 'Immer'])
  })

  it('überspringt Hilfsspalten wie "Frei" und filtert Zeilen des Folgemonats heraus', () => {
    const ergebnis = parseDienstplanGrid(beispielGrid())
    if ('error' in ergebnis) throw new Error(ergebnis.error)
    expect(ergebnis.spalten.some(s => s.name === 'Frei')).toBe(false)
    expect(ergebnis.eintraege.every(e => e.datum.startsWith('2026-02'))).toBe(true)
    expect(ergebnis.eintraege.some(e => e.datum === '2026-03-01')).toBe(false)
  })

  it('markiert Spalten ohne jeden Eintrag im Monat als nicht aktiv', () => {
    const ergebnis = parseDienstplanGrid(beispielGrid())
    if ('error' in ergebnis) throw new Error(ergebnis.error)
    const inaktiv = ergebnis.spalten.find(s => s.name === 'Inaktiv')
    const immer = ergebnis.spalten.find(s => s.name === 'Immer')
    const mustermann = ergebnis.spalten.find(s => s.name === 'Mustermann')
    expect(inaktiv?.hatEintraege).toBe(false)
    expect(immer?.hatEintraege).toBe(false)
    expect(mustermann?.hatEintraege).toBe(true)
  })

  it('ordnet Rohtext, Uhrzeit und Kategorie je Zelle korrekt zu (inkl. zeile 1/2)', () => {
    const ergebnis = parseDienstplanGrid(beispielGrid())
    if ('error' in ergebnis) throw new Error(ergebnis.error)
    const beispiel = ergebnis.eintraege.filter(e => e.spaltenname === 'Beispiel')
    expect(beispiel).toEqual([
      { spaltenIndex: 5, spaltenname: 'Beispiel', datum: '2026-02-02', zeile: 1, rohtext: 'krank', vonZeit: null, bisZeit: null, kategorie: 'krank' },
      { spaltenIndex: 5, spaltenname: 'Beispiel', datum: '2026-02-03', zeile: 1, rohtext: 'SoUrl', vonZeit: null, bisZeit: null, kategorie: 'sonderurlaub' },
      { spaltenIndex: 5, spaltenname: 'Beispiel', datum: '2026-02-03', zeile: 2, rohtext: 'Karenz', vonZeit: null, bisZeit: null, kategorie: 'karenz' },
    ])
    const vierte = ergebnis.eintraege.filter(e => e.spaltenname === 'Vierte')
    expect(vierte.find(e => e.datum === '2026-02-03')).toMatchObject({ rohtext: '22-06', vonZeit: '22:00', bisZeit: '06:00', kategorie: 'dienst' })
  })

  it('meldet einen Fehler ohne erkennbare Datumsspalte', () => {
    const ergebnis = parseDienstplanGrid([[null, null], [null, null]])
    expect(ergebnis).toEqual({ error: 'Keine Datumsspalte gefunden - ist das die richtige Dienstplan-Vorlage?' })
  })
})

describe('istSpalteAktiv', () => {
  it('ist aktiv bei mindestens einem Eintrag im Monat', () => {
    expect(istSpalteAktiv({ index: 0, name: 'X', hatEintraege: true }, undefined)).toBe(true)
  })
  it('ist auch ohne Eintrag aktiv, wenn die Zuordnung "immer aktiv" gesetzt hat', () => {
    expect(istSpalteAktiv({ index: 0, name: 'X', hatEintraege: false }, { beamterId: 'p1', immerAktiv: true })).toBe(true)
  })
  it('ist ohne Eintrag und ohne "immer aktiv" nicht aktiv', () => {
    expect(istSpalteAktiv({ index: 0, name: 'X', hatEintraege: false }, { beamterId: 'p1', immerAktiv: false })).toBe(false)
    expect(istSpalteAktiv({ index: 0, name: 'X', hatEintraege: false }, undefined)).toBe(false)
  })
})

describe('baueDienstePayload', () => {
  it('übernimmt nur Einträge zugeordneter Spalten und lässt unzugeordnete/ignorierte weg', () => {
    const ergebnis = parseDienstplanGrid(beispielGrid())
    if ('error' in ergebnis) throw new Error(ergebnis.error)
    const zuordnungen = new Map<string, DienstplanSpaltenZuordnung>([
      ['Mustermann', { beamterId: 'profil-1', immerAktiv: false }],
      ['Beispiel', { beamterId: null, immerAktiv: false }], // bewusst ignoriert
    ])
    const payload = baueDienstePayload(ergebnis, zuordnungen)
    expect(payload.every(p => p.beamter_id === 'profil-1')).toBe(true)
    expect(payload.some(p => p.rohtext === 'krank')).toBe(false) // 'Beispiel'-Spalte, ignoriert
    expect(payload.find(p => p.rohtext === 'VD 08-19')).toMatchObject({ von_zeit: '08:00', bis_zeit: '19:00', kategorie: 'dienst', datum: '2026-02-02' })
  })
})

describe('automatischeSpaltenZuordnung', () => {
  const profile: DienstplanProfilOption[] = [
    { id: 'p-hp', name: 'Hans-Peter Schwendinger' },
    { id: 'p-dietmar', name: 'Dietmar Schwendinger' },
    { id: 'p-verona', name: 'Verona Schwendinger' },
    { id: 'p-ludwig', name: 'Ludwig Alge-Faißt' },
    { id: 'p-andreas', name: 'Andreas Bachmann' },
  ]

  it('matcht einen eindeutigen Nachnamen direkt', () => {
    expect(automatischeSpaltenZuordnung('Bachmann', profile)).toBe('p-andreas')
    expect(automatischeSpaltenZuordnung('Alge-Faißt', profile)).toBe('p-ludwig')
  })

  it('nutzt eine Vornamens-Initiale zur Unterscheidung mehrerer gleicher Nachnamen', () => {
    expect(automatischeSpaltenZuordnung('Schwendinger D.', profile)).toBe('p-dietmar')
    expect(automatischeSpaltenZuordnung('Schwendinger V', profile)).toBe('p-verona')
  })

  it('ohne Initiale bleibt ein mehrdeutiger Nachname unzugeordnet', () => {
    expect(automatischeSpaltenZuordnung('Schwendinger', profile)).toBeNull()
  })

  it('ein Kürzel ohne Treffer (z. B. "SchwendHP") bleibt unzugeordnet statt falsch zu raten', () => {
    expect(automatischeSpaltenZuordnung('SchwendHP', profile)).toBeNull()
  })

  it('kein Treffer bei unbekanntem Namen', () => {
    expect(automatischeSpaltenZuordnung('Unbekannt', profile)).toBeNull()
  })
})
