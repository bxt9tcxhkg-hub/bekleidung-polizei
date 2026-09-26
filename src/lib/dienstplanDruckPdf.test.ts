import { describe, expect, it } from 'vitest'
import { buildDienstplanDruckHtml } from './dienstplanDruckPdf'

describe('buildDienstplanDruckHtml', () => {
  it('zeigt jede Person mit Dienstnummer und die Kürzel je Tag', () => {
    const html = buildDienstplanDruckHtml({
      monatLabel: 'Oktober 2026',
      bearbeiterName: 'Max Mustermann',
      personen: [{ id: 'a', name: 'Anna Beispiel', dienstnummer: '12' }],
      tage: ['2026-10-01', '2026-10-02'],
      dienste: [
        { beamter_id: 'a', datum: '2026-10-01', zeile: 1, rohtext: 'Z 08-19', kategorie: 'dienst' },
        { beamter_id: 'a', datum: '2026-10-02', zeile: 1, rohtext: 'U', kategorie: 'urlaub' },
      ],
    })
    expect(html).toContain('Dienstplan Oktober 2026')
    expect(html).toContain('Anna Beispiel')
    expect(html).toContain('(12)')
    expect(html).toContain('>Z<')
    expect(html).toContain('>U<')
  })

  it('zeigt beide Zeilen eines Tages übereinander, wenn eine Person zwei Einträge hat', () => {
    const html = buildDienstplanDruckHtml({
      monatLabel: 'Oktober 2026',
      bearbeiterName: 'Max Mustermann',
      personen: [{ id: 'a', name: 'Anna Beispiel', dienstnummer: null }],
      tage: ['2026-10-01'],
      dienste: [
        { beamter_id: 'a', datum: '2026-10-01', zeile: 1, rohtext: 'Z 08-19', kategorie: 'dienst' },
        { beamter_id: 'a', datum: '2026-10-01', zeile: 2, rohtext: 'VD', kategorie: 'dienst' },
      ],
    })
    expect(html).toContain('Z<br>VD')
  })

  it('meldet fehlende Diensteinträge, wenn keine vorhanden sind', () => {
    const html = buildDienstplanDruckHtml({ monatLabel: 'Oktober 2026', bearbeiterName: 'Max Mustermann', personen: [], tage: ['2026-10-01'], dienste: [] })
    expect(html).toContain('Keine Diensteinträge in diesem Monat.')
  })

  it('markiert Wochenend-Spalten mit der Klasse "we"', () => {
    // 2026-10-03 ist ein Samstag.
    const html = buildDienstplanDruckHtml({ monatLabel: 'Oktober 2026', bearbeiterName: 'Max Mustermann', personen: [], tage: ['2026-10-03'], dienste: [] })
    expect(html).toContain('<th class="we">Sa<br>03</th>')
  })
})
