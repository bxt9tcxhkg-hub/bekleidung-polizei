import { describe, expect, it } from 'vitest'
import { buildEinsatzUebersichtHtml, type EinsatzUebersichtInput } from './einsatzUebersichtPdf'

function input(partial: Partial<EinsatzUebersichtInput> = {}): EinsatzUebersichtInput {
  return {
    incident: {
      id: 'i1',
      reported_at: '2026-09-18T10:15:00Z',
      location: 'Marktplatz 1',
      summary: 'Ruhestörung gemeldet.',
      disposition: 'jd',
      status: 'offen',
      note: 'STUFE:mittel\nWeitere Notiz',
      caller_name: 'Maria Muster',
      caller_phone: '0664 1234567',
      involved_person: null,
      involved_birth_date: null,
    },
    parteien: [],
    dokumente: [],
    erstelltVon: 'Max Mustermann',
    now: new Date(2026, 8, 18, 12, 0),
    ...partial,
  }
}

describe('buildEinsatzUebersichtHtml', () => {
  it('enthält Sachverhalt, Melder und Briefkopf', () => {
    const html = buildEinsatzUebersichtHtml(input())
    expect(html).toContain('Ruhestörung gemeldet.')
    expect(html).toContain('Maria Muster')
    expect(html).toContain('0664 1234567')
    expect(html).toContain('Marktplatz 1')
    expect(html).toContain('STADT DORNBIRN')
  })

  it('zeigt die Ereignisstufe aus der Notiz und die Notiz ohne STUFE-Präfix', () => {
    const html = buildEinsatzUebersichtHtml(input())
    expect(html).toContain('Mittelereignis')
    expect(html).toContain('Weitere Notiz')
    expect(html).not.toContain('STUFE:mittel')
  })

  it('listet beteiligte Parteien mit Rolle', () => {
    const html = buildEinsatzUebersichtHtml(input({
      parteien: [{
        id: 'p1', incident_id: 'i1', person_id: 'per1', rolle: 'zeuge', note: 'Nachbar',
        created_by: 'u1', created_at: '2026-09-18T10:00:00Z',
        person: { id: 'per1', vorname: 'Hans', nachname: 'Zeuge', birth_date: '1990-01-01' },
      }],
    }))
    expect(html).toContain('Hans Zeuge')
    expect(html).toContain('Zeuge')
    expect(html).toContain('Nachbar')
  })

  it('zeigt einen Hinweis, wenn keine Parteien oder Unterlagen vorliegen', () => {
    const html = buildEinsatzUebersichtHtml(input())
    expect(html).toContain('Keine Parteien erfasst.')
    expect(html).toContain('Keine Unterlagen hinterlegt.')
  })

  it('listet beigefügte Unterlagen mit Art und Dateiname', () => {
    const html = buildEinsatzUebersichtHtml(input({
      dokumente: [{ id: 'd1', incidentId: 'i1', art: 'zmr', title: 'ZMR', fileKey: 'k', fileName: 'auszug.pdf', from: 'streife', at: '2026-09-18T10:00:00Z' }],
    }))
    expect(html).toContain('ZMR-Auszug: auszug.pdf')
  })

  it('escaped HTML-Sonderzeichen im Sachverhalt', () => {
    const html = buildEinsatzUebersichtHtml(input({ incident: { ...input().incident, summary: '<script>alert(1)</script>' } }))
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
