import { describe, expect, it } from 'vitest'
import { generiereGrundbesetzungsVorschlag, type VorschlagBestehenderDienst, type VorschlagPerson, type VorschlagWunsch } from './dienstplanVorschlag'

const MITARBEITER: VorschlagPerson[] = [
  { id: 'a', name: 'Anna' },
  { id: 'b', name: 'Bernd' },
  { id: 'c', name: 'Clara' },
]

// Für Tag+Nacht am selben Tag braucht es mehr Personen als nur 3 - Tag
// 08-19 gefolgt von Nacht 19-08 derselben Person hätte 0 Stunden
// Ruhezeit, wird also vom harten Kriterium korrekt verhindert (siehe
// eigener Test weiter unten). Mindestbesetzung ist 1x Z, 1x ID, 2x JD (4
// Personen) je Abschnitt - mit 8 Personen kann für Tag und Nacht je eine
// eigene Vierergruppe einspringen.
const ACHT_MITARBEITER: VorschlagPerson[] = [
  { id: 'a', name: 'Anna' }, { id: 'b', name: 'Bernd' }, { id: 'c', name: 'Clara' }, { id: 'd', name: 'Doris' },
  { id: 'e', name: 'Erik' }, { id: 'f', name: 'Frida' }, { id: 'g', name: 'Gustav' }, { id: 'h', name: 'Hannah' },
]

describe('generiereGrundbesetzungsVorschlag', () => {
  it('besetzt 1x Z, 1x ID, 2x JD für Tag und Nacht an einem einzigen Tag (8 Slots), wenn genug Personen verfügbar sind', () => {
    const ergebnis = generiereGrundbesetzungsVorschlag({ mitarbeiter: ACHT_MITARBEITER, tage: ['2026-10-05'], bestehendeDienste: [], wuensche: [], mindestruhezeitStunden: 11 })
    expect(ergebnis).toHaveLength(8)
    const anzahlProAbschnittUndCode = new Map<string, number>()
    for (const eintrag of ergebnis) {
      const key = `${eintrag.abschnitt}|${eintrag.code}`
      anzahlProAbschnittUndCode.set(key, (anzahlProAbschnittUndCode.get(key) ?? 0) + 1)
    }
    expect(anzahlProAbschnittUndCode).toEqual(new Map([['tag|Z', 1], ['tag|ID', 1], ['tag|JD', 2], ['nacht|Z', 1], ['nacht|ID', 1], ['nacht|JD', 2]]))
  })

  it('lässt einen bereits besetzten Slot unangetastet', () => {
    const bestehendeDienste: VorschlagBestehenderDienst[] = [{ beamterId: 'a', datum: '2026-10-05', vonZeit: '08:00', bisZeit: '19:00', kategorie: 'dienst', code: 'Z' }]
    const ergebnis = generiereGrundbesetzungsVorschlag({ mitarbeiter: ACHT_MITARBEITER, tage: ['2026-10-05'], bestehendeDienste, wuensche: [], mindestruhezeitStunden: 11 })
    expect(ergebnis.some(e => e.abschnitt === 'tag' && e.code === 'Z')).toBe(false)
    expect(ergebnis).toHaveLength(7)
  })

  it('schlägt niemanden vor, der an diesem Tag abwesend (krank/Urlaub) ist', () => {
    const bestehendeDienste: VorschlagBestehenderDienst[] = [
      { beamterId: 'b', datum: '2026-10-05', vonZeit: null, bisZeit: null, kategorie: 'krank', code: 'Krank' },
      { beamterId: 'c', datum: '2026-10-05', vonZeit: null, bisZeit: null, kategorie: 'krank', code: 'Krank' },
    ]
    const ergebnis = generiereGrundbesetzungsVorschlag({ mitarbeiter: MITARBEITER, tage: ['2026-10-05'], bestehendeDienste, wuensche: [], mindestruhezeitStunden: 11 })
    expect(ergebnis.every(e => e.beamterId === 'a')).toBe(true)
  })

  it('bevorzugt bei der Rotation die Person mit den wenigsten bisherigen Grundbesetzungs-Diensten', () => {
    const bestehendeDienste: VorschlagBestehenderDienst[] = [
      { beamterId: 'a', datum: '2026-10-01', vonZeit: '08:00', bisZeit: '19:00', kategorie: 'dienst', code: 'Z' },
      { beamterId: 'a', datum: '2026-10-01', vonZeit: '08:00', bisZeit: '19:00', kategorie: 'dienst', code: 'ID' },
    ]
    // Nur ein Kandidat-Paar (b oder c) konkurriert um einen einzelnen weiteren Slot - a hat schon 2 Diensten, sollte also nicht bevorzugt werden.
    const ergebnis = generiereGrundbesetzungsVorschlag({
      mitarbeiter: MITARBEITER, tage: ['2026-10-05'], bestehendeDienste, wuensche: [], mindestruhezeitStunden: 11,
    })
    const tagZ = ergebnis.find(e => e.datum === '2026-10-05' && e.abschnitt === 'tag' && e.code === 'Z')
    expect(tagZ?.beamterId).not.toBe('a')
  })

  it('respektiert einen Freiplanungswunsch, wenn genug Alternativen für alle vier Tag-Slots (Z, ID, 2x JD) verfügbar sind', () => {
    // 5 Personen für 4 Tag-Slots - auch ohne a bleiben genug Alternativen übrig (b, c, d, e).
    const fuenfPersonen: VorschlagPerson[] = [...MITARBEITER, { id: 'd', name: 'Doris' }, { id: 'e', name: 'Erik' }]
    const wuensche: VorschlagWunsch[] = [{ beamterId: 'a', datum: '2026-10-05', wunsch: 'frei_tag' }]
    const ergebnis = generiereGrundbesetzungsVorschlag({ mitarbeiter: fuenfPersonen, tage: ['2026-10-05'], bestehendeDienste: [], wuensche, mindestruhezeitStunden: 11 })
    const tagEintraege = ergebnis.filter(e => e.abschnitt === 'tag')
    expect(tagEintraege.every(e => e.beamterId !== 'a')).toBe(true)
    // Nachts (kein Wunsch dagegen) darf a weiterhin eingeteilt werden.
    expect(ergebnis.some(e => e.abschnitt === 'nacht' && e.beamterId === 'a')).toBe(true)
  })

  it('eine Gerichtsverhandlung/Schulverkehrserziehung/Personalvertretung erzeugt keinen Widerspruch (Planer bleibt frei, im Gegensatz zu frei_tag)', () => {
    const fuenfPersonen: VorschlagPerson[] = [...MITARBEITER, { id: 'd', name: 'Doris' }, { id: 'e', name: 'Erik' }]
    const wuensche: VorschlagWunsch[] = [{ beamterId: 'a', datum: '2026-10-05', wunsch: 'gerichtsverhandlung' }]
    const ergebnis = generiereGrundbesetzungsVorschlag({ mitarbeiter: fuenfPersonen, tage: ['2026-10-05'], bestehendeDienste: [], wuensche, mindestruhezeitStunden: 11 })
    expect(ergebnis.some(e => e.abschnitt === 'tag' && e.beamterId === 'a')).toBe(true)
  })

  it('weicht vom Wunsch ab, wenn sonst niemand verfügbar ist', () => {
    const einePerson: VorschlagPerson[] = [{ id: 'a', name: 'Anna' }]
    const wuensche: VorschlagWunsch[] = [{ beamterId: 'a', datum: '2026-10-05', wunsch: 'frei_tag' }]
    const ergebnis = generiereGrundbesetzungsVorschlag({ mitarbeiter: einePerson, tage: ['2026-10-05'], bestehendeDienste: [], wuensche, mindestruhezeitStunden: 11 })
    expect(ergebnis.some(e => e.abschnitt === 'tag' && e.beamterId === 'a')).toBe(true)
  })

  it('vergibt keinen Slot, der die Mindestruhezeit verletzen würde, wenn niemand anders verfügbar ist', () => {
    const einePerson: VorschlagPerson[] = [{ id: 'a', name: 'Anna' }]
    // Anna hat bereits einen Tagdienst 08-19 am 05.10. - ein Nachtdienst (19-08) direkt im Anschluss hat 0 Stunden Ruhezeit.
    const bestehendeDienste: VorschlagBestehenderDienst[] = [{ beamterId: 'a', datum: '2026-10-05', vonZeit: '08:00', bisZeit: '19:00', kategorie: 'dienst', code: 'Z' }]
    const ergebnis = generiereGrundbesetzungsVorschlag({ mitarbeiter: einePerson, tage: ['2026-10-05'], bestehendeDienste, wuensche: [], mindestruhezeitStunden: 11 })
    expect(ergebnis.some(e => e.abschnitt === 'nacht')).toBe(false)
  })

  it('vergibt keinen Tagdienst am 1., wenn ein Nachtdienst am letzten Tag des Vormonats (nicht Teil von "tage") die Ruhezeit verletzen würde', () => {
    const einePerson: VorschlagPerson[] = [{ id: 'a', name: 'Anna' }]
    // Nachtdienst 19-08 Uhr am 30.9. (Vormonat, kein Teil von "tage") - bis 08:00 am 1.10., direkt im Anschluss ein Tagdienst 08-19 hätte 0 Stunden Ruhezeit.
    const bestehendeDienste: VorschlagBestehenderDienst[] = [{ beamterId: 'a', datum: '2026-09-30', vonZeit: '19:00', bisZeit: '08:00', kategorie: 'dienst', code: 'JD' }]
    const ergebnis = generiereGrundbesetzungsVorschlag({ mitarbeiter: einePerson, tage: ['2026-10-01'], bestehendeDienste, wuensche: [], mindestruhezeitStunden: 11 })
    expect(ergebnis.some(e => e.abschnitt === 'tag')).toBe(false)
  })

  it('liefert ein leeres Ergebnis ohne Mitarbeiter oder Tage', () => {
    expect(generiereGrundbesetzungsVorschlag({ mitarbeiter: [], tage: ['2026-10-05'], bestehendeDienste: [], wuensche: [], mindestruhezeitStunden: 11 })).toEqual([])
    expect(generiereGrundbesetzungsVorschlag({ mitarbeiter: MITARBEITER, tage: [], bestehendeDienste: [], wuensche: [], mindestruhezeitStunden: 11 })).toEqual([])
  })
})
