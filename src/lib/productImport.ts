import type { Product } from './types'

export const PRODUCT_CSV_TEMPLATE = `artikel_nr;name;kategorie;geschlecht;groessen;preis;schneider;organisation;grössentabelle
BP-001;Diensthemd langarm;Hemd;unisex;S|M|L|XL;45.90;nein;Stadtpolizei;
BP-002;Diensthose Damen;Hose;female;34|36|38|40|42|44;89.00;ja;Stadtpolizei;https://beispiel.at/groessen`

export const GENDER_MAP: Record<string, 'male' | 'female' | 'unisex'> = {
  hr: 'male', herren: 'male', male: 'male', m: 'male',
  da: 'female', damen: 'female', female: 'female', f: 'female',
  unisex: 'unisex', u: 'unisex',
}

export function autoArticleNumber(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  const slug = name.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 20)
  return `auto-${slug}-${hash.toString(36)}`
}

export function rowToProduct(row: Record<string, string>): Omit<Product, 'id' | 'created_at'> | null {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const val = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()] ?? ''
      if (val.trim()) return val.trim()
    }
    return ''
  }
  const artikel_nr = get('artikel_nr', 'artikelnr', 'article_number', 'articlenumber', 'artikelnummer')
  const name = get('name', 'bezeichnung', 'produkt')
  if (!name) return null
  const article_number = (artikel_nr && artikel_nr !== '-') ? artikel_nr : autoArticleNumber(name)
  const groessen = get('groessen', 'größen', 'groesse', 'größe', 'sizes')
  const preis = get('preis', 'price', 'betrag')
  const schneider = get('schneider', 'tailoring', 'wappen', 'wappenänderung')
  const geschlecht = get('geschlecht', 'gender', 'targetgender', 'hr/da')
  const genderFromCol = GENDER_MAP[geschlecht.toLowerCase()]
  const genderFromName = /\bHR\b/i.test(name) ? 'male' : /\bDA\b/i.test(name) ? 'female' : null
  const sizeSep = groessen.includes('|') ? '|' : ';'
  return {
    article_number,
    name,
    category: get('kategorie', 'category', 'kategory') || 'Sonstiges',
    sub_category: get('subcategory', 'subCategory', 'sub_category', 'unterkategorie', 'unterkat') || null,
    gender: genderFromCol ?? genderFromName ?? 'unisex',
    sizes: groessen ? groessen.split(sizeSep).map(s => s.trim()).filter(Boolean) : [],
    price: parseFloat(preis.replace(',', '.')) || 0,
    needs_tailoring: ['ja', 'yes', '1', 'true'].includes(schneider.toLowerCase()),
    size_guide: get('grössentabelle', 'groessentabelle', 'size_guide', 'sizeguide', 'größentabelle') || null,
    organisation: (() => { const o = get('organisation', 'org', 'abteilung'); return o.toLowerCase().includes('park') ? 'Parkaufsicht' : 'Stadtpolizei' })(),
    active: true,
    min_quantity: 0,
  }
}

export function parseFileToProducts(rows: Record<string, string>[]): Omit<Product, 'id' | 'created_at'>[] {
  return rows.map(rowToProduct).filter((row): row is Omit<Product, 'id' | 'created_at'> => row !== null)
}

export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else {
        cur += ch
      }
    } else if (ch === '"' && cur.trim() === '') {
      inQuotes = true
      cur = ''
    } else if (ch === sep) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map(s => s.trim())
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = splitCsvLine(lines[0], sep).map(h => h.toLowerCase())
  return lines.slice(1).map(line => {
    const cols = splitCsvLine(line, sep)
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']))
  })
}
