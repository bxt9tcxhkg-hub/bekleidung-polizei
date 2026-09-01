import { describe, it, expect } from 'vitest'
import { aggregateMassaLines, buildMassaDraft, sendMassaOrder } from './massaOrder'

const lines = [
  { articleNumber: 'A1', name: 'Hemd', size: 'M', quantity: 2 },
  { articleNumber: 'A1', name: 'Hemd', size: 'M', quantity: 1 },
  { articleNumber: 'B2', name: 'Hose', size: '52', quantity: 4 },
]

describe('Massa Sammelbestellung', () => {
  it('fasst gleiche Artikel+Größe zusammen und baut CSV', () => {
    const draft = buildMassaDraft(lines, { now: new Date('2026-09-02T10:00:00') })
    expect(draft.lineCount).toBe(2)
    expect(draft.csv).toContain('Artikelnummer;Artikel;Größe;Anzahl')
    expect(draft.csv).toContain('A1;Hemd;M;3')
    expect(draft.csv).toContain('B2;Hose;52;4')
    expect(draft.subject).toContain('Sammelbestellung')
  })

  it('simuliert den Versand ohne Mail-Umgebung und sendet nicht nach Wien', () => {
    const draft = buildMassaDraft(aggregateMassaLines(lines), { now: new Date('2026-09-02T10:00:00') })
    const result = sendMassaOrder(draft, null)
    expect(result.mode).toBe('simulated')
    if (result.mode === 'simulated') {
      expect(result.draft.csv).toContain('Hemd')
    }
  })

  it('öffnet nur einen mailto-Entwurf wenn eine Adresse gesetzt ist', () => {
    const draft = buildMassaDraft(lines, { now: new Date('2026-09-02T10:00:00') })
    const result = sendMassaOrder(draft, 'bestellung@example.test')
    expect(result.mode).toBe('mailto')
    if (result.mode === 'mailto') {
      expect(result.href.startsWith('mailto:')).toBe(true)
      expect(result.href).toContain('bestellung%40example.test')
    }
  })
})
