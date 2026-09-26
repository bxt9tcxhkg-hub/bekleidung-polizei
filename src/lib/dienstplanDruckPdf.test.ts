import { describe, expect, it } from 'vitest'
import { buildDienstplanDruckHtml } from './dienstplanDruckPdf'

const BASIS = { monatLabel: 'Oktober 2026', bearbeiterName: 'Max Mustermann', markierungen: [] }

describe('buildDienstplanDruckHtml', () => {
  it('zeigt Personen als Spaltenköpfe (Kurzname) und die Kürzel in der passenden Tag-/Nachtzeile', () => {
    const html = buildDienstplanDruckHtml({
      ...BASIS,
      personen: [{ id: 'a', name: 'Anna Beispiel', kurzname: 'Beispiel', dienstnummer: '12', gruppe: 'einsatz' }],
      tage: ['2026-10-01'],
      dienste: [{ beamter_id: 'a', datum: '2026-10-01', zeile: 1, rohtext: 'Z 08-19', von_zeit: '08:00', bis_zeit: '19:00', kategorie: 'dienst', markierung_id: null }],
    })
    expect(html).toContain('Dienstplan Oktober 2026')
    expect(html).toContain('>Beispiel<')
    expect(html).toContain('>Z<')
  })

  it('zeigt beide Zeilen desselben Tages/Abschnitts übereinander, wenn eine Person zwei Einträge hat', () => {
    const html = buildDienstplanDruckHtml({
      ...BASIS,
      personen: [{ id: 'a', name: 'Anna Beispiel', kurzname: 'Beispiel', dienstnummer: null, gruppe: 'einsatz' }],
      tage: ['2026-10-01'],
      dienste: [
        { beamter_id: 'a', datum: '2026-10-01', zeile: 1, rohtext: 'Z', von_zeit: '08:00', bis_zeit: '19:00', kategorie: 'dienst', markierung_id: null },
        { beamter_id: 'a', datum: '2026-10-01', zeile: 2, rohtext: 'VD', von_zeit: '08:00', bis_zeit: '19:00', kategorie: 'dienst', markierung_id: null },
      ],
    })
    expect(html).toContain('Z<br>VD')
  })

  it('meldet fehlende Diensteinträge, wenn keine vorhanden sind', () => {
    const html = buildDienstplanDruckHtml({ ...BASIS, personen: [], tage: ['2026-10-01'], dienste: [] })
    expect(html).toContain('Keine Diensteinträge in diesem Monat.')
  })

  it('markiert eine durchgehende Abwesenheit (Freitag+Montag krank) auch am dazwischenliegenden Wochenende mit derselben Farbe', () => {
    const html = buildDienstplanDruckHtml({
      ...BASIS,
      personen: [{ id: 'a', name: 'Anna Beispiel', kurzname: 'Beispiel', dienstnummer: null, gruppe: 'einsatz' }],
      // 2026-10-02 = Freitag, 03/04 = Sa/So, 05 = Montag.
      tage: ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'],
      dienste: [
        { beamter_id: 'a', datum: '2026-10-02', zeile: 1, rohtext: 'Krank', von_zeit: null, bis_zeit: null, kategorie: 'krank', markierung_id: null },
        { beamter_id: 'a', datum: '2026-10-05', zeile: 1, rohtext: 'Krank', von_zeit: null, bis_zeit: null, kategorie: 'krank', markierung_id: null },
      ],
    })
    // grün (krank) taucht mindestens 4x auf: Fr, Sa, So, Mo (Tag-Zeile je Werktag genügt für den Nachweis).
    expect(html.split('#dcfce7').length - 1).toBeGreaterThanOrEqual(4)
  })

  it('markiert die letzte Spalte einer Personen-Gruppe mit einer dicken Trennlinie, nicht aber Spalten innerhalb derselben Gruppe', () => {
    const html = buildDienstplanDruckHtml({
      ...BASIS,
      personen: [
        { id: 'a', name: 'Anna Beispiel', kurzname: 'Beispiel A', dienstnummer: null, gruppe: 'kommando' },
        { id: 'b', name: 'Bernd Beispiel', kurzname: 'Beispiel B', dienstnummer: null, gruppe: 'einsatz' },
        { id: 'c', name: 'Clara Beispiel', kurzname: 'Beispiel C', dienstnummer: null, gruppe: 'einsatz' },
      ],
      tage: ['2026-10-01'],
      dienste: [],
    })
    expect(html).toContain('<th class="person-kopf" style="border-right:1.5pt solid #333;">Beispiel A</th>')
    expect(html).toContain('<th class="person-kopf" style="border-right:0.5pt solid #bbb;">Beispiel B</th>')
    expect(html).toContain('<th class="person-kopf" style="">Beispiel C</th>')
  })

  it('färbt eine zugewiesene Markierung in ihrer definierten Farbe', () => {
    const html = buildDienstplanDruckHtml({
      ...BASIS,
      personen: [{ id: 'a', name: 'Anna Beispiel', kurzname: 'Beispiel', dienstnummer: null, gruppe: 'einsatz' }],
      tage: ['2026-10-01'],
      dienste: [{ beamter_id: 'a', datum: '2026-10-01', zeile: 1, rohtext: 'Z', von_zeit: '08:00', bis_zeit: '19:00', kategorie: 'dienst', markierung_id: 'm1' }],
      markierungen: [{ id: 'm1', name: 'Überstunden', farbe: 'blau', kategorie: null }],
    })
    expect(html).toContain('background:#dbeafe')
  })

  it('färbt eine Markierung auf einer sonst leeren Zelle (kategorie "sonstiges") durchgehend über Tag- UND Nachtzeile, mit kräftigerer Nacht-Nuance', () => {
    const html = buildDienstplanDruckHtml({
      ...BASIS,
      personen: [{ id: 'a', name: 'Anna Beispiel', kurzname: 'Beispiel', dienstnummer: null, gruppe: 'einsatz' }],
      tage: ['2026-10-01'],
      dienste: [{ beamter_id: 'a', datum: '2026-10-01', zeile: 1, rohtext: '', von_zeit: null, bis_zeit: null, kategorie: 'sonstiges', markierung_id: 'm1' }],
      markierungen: [{ id: 'm1', name: 'Überstunden', farbe: 'blau', kategorie: null }],
    })
    expect(html).toContain('background:#dbeafe') // Tag
    expect(html).toContain('background:#bfdbfe') // Nacht (kräftigere Nuance)
  })

  it('nutzt die vom Planer für Krank eingestellte Farbe (System-Markierung) statt der ursprünglichen Standardfarbe', () => {
    const html = buildDienstplanDruckHtml({
      ...BASIS,
      personen: [{ id: 'a', name: 'Anna Beispiel', kurzname: 'Beispiel', dienstnummer: null, gruppe: 'einsatz' }],
      tage: ['2026-10-01'],
      dienste: [{ beamter_id: 'a', datum: '2026-10-01', zeile: 1, rohtext: 'Krank', von_zeit: null, bis_zeit: null, kategorie: 'krank', markierung_id: null }],
      markierungen: [{ id: 'sys-krank', name: 'Krank', farbe: 'lila', kategorie: 'krank' }],
    })
    expect(html).toContain('background:#f3e8ff')
  })

  it('zeigt die Auswertung (Stunden, Grund-/Zusatzdienste) je Person in der Fußzeile', () => {
    const html = buildDienstplanDruckHtml({
      ...BASIS,
      personen: [{ id: 'a', name: 'Anna Beispiel', kurzname: 'Beispiel', dienstnummer: null, gruppe: 'einsatz' }],
      tage: ['2026-10-01'],
      dienste: [{ beamter_id: 'a', datum: '2026-10-01', zeile: 1, rohtext: 'Z', von_zeit: '08:00', bis_zeit: '19:00', kategorie: 'dienst', markierung_id: null }],
    })
    expect(html).toContain('<tfoot>')
    expect(html).toContain('Grund Tag')
    expect(html).toContain('<td colspan="2" class="auswertung-label">Stunden</td><td style="">11</td>')
  })
})
