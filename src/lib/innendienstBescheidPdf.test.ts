import { describe, expect, it } from 'vitest'
import { buildBescheidPdfHtml, type BescheidKind } from './innendienstBescheidPdf'

function input(kind: BescheidKind) {
  return {
    kind,
    aktenzahl: 'GZ-123',
    bearbeiterName: 'Max Muster',
    personName: 'Erika Beispiel',
    personBirthDate: '1990-04-05',
    zeitVon: '10:00',
    zeitBis: '12:00',
    kostenPositionen: [],
    issuedDate: '2026-09-23',
    now: new Date('2026-09-23T10:00:00Z'),
  }
}

describe('Innendienst-Bescheid', () => {
  it.each([
    ['bescheid_strassenmusik', 'Planbeilage Straßenmusik', 'Luftbild mit markierten Standplätzen', 'Katasterplan mit markierten Standplätzen'],
    ['bescheid_strassenkunst', 'Planbeilage Straßenkunst', 'Katasterplan mit markierten Standplätzen', 'Luftbild mit markierten Standplätzen'],
  ] as const)('setzt Personendaten ein und druckt nur die zugeordnete Planbeilage bei %s', (kind, planTitel, enthalten, ausgeschlossen) => {
    const html = buildBescheidPdfHtml(input(kind))

    expect(html).toContain('<strong>Erika Beispiel</strong>, geboren am 05.04.1990')
    expect(html).not.toContain('Der Partei')
    expect(html).not.toContain('Dem/Der Antragsteller/Antragstellerin')
    expect(html).toContain(planTitel)
    expect(html).toContain(enthalten)
    expect(html).not.toContain(ausgeschlossen)
  })
})
