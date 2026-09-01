import { describe, it, expect } from 'vitest'
import { autoArticleNumber, parseCsv, parseFileToProducts, rowToProduct, splitCsvLine } from './productImport'

describe('productImport', () => {
  it('parst CSV-Zeilen mit Semikolon und Anführungszeichen', () => {
    expect(splitCsvLine('a;"b;c";d', ';')).toEqual(['a', 'b;c', 'd'])
    const rows = parseCsv('name;groessen;preis\nHemd;S|M;12,50')
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Hemd')
  })

  it('setzt Schneiderpflicht und Auto-Artikelnummer', () => {
    const p = rowToProduct({ name: 'Jacke HR', schneider: 'ja', groessen: 'M|L' })
    expect(p).not.toBeNull()
    expect(p?.needs_tailoring).toBe(true)
    expect(p?.gender).toBe('male')
    expect(p?.sizes).toEqual(['M', 'L'])
    expect(p?.article_number.startsWith('auto-')).toBe(true)
    expect(autoArticleNumber('Jacke HR')).toBe(p?.article_number)
  })

  it('filtert leere Zeilen beim Datei-Import', () => {
    expect(parseFileToProducts([{}, { name: 'Hose', groessen: '52' }])).toHaveLength(1)
  })
})
