import { describe, expect, it } from 'vitest'
import {
  POOL_EM_CATEGORIES,
  POOL_EM_CATEGORY_LABELS,
  POOL_EM_FIELDS,
  VERWAHRUNGSORTE,
  VERWAHRUNGSORT_LABELS,
  aggregateLagerbestand,
  canManagePoolEinsatzmittel,
  canPurchasePoolEinsatzmittel,
  filterPoolItemsForViewer,
  emptyOrtCounts,
  emptyPoolEmFormValues,
  formValuesFromPoolRecord,
  isPoolEmCategory,
  isVerwahrungsort,
  poolEmDetailText,
  poolEmFieldLabel,
  poolEmLocationLabel,
  poolEmStockQuantity,
  resolveLagerNotiz,
  sanitizePoolCategoryFilter,
  validatePoolEm,
  visiblePoolEmCategories,
} from './poolEinsatzmittel'

const empty = emptyPoolEmFormValues()

describe('Kategorien und Verwahrungsorte', () => {
  it('enthält genau die neun Pool-Typen, ohne persönliche Kategorien', () => {
    expect([...POOL_EM_CATEGORIES]).toEqual([
      'langwaffe_stg77',
      'magazine',
      'munition',
      'pfefferspray_gross',
      'pfefferspray_klein',
      'schild',
      'ballistischer_helm',
      'schwere_westen',
      'spuckschutzhaube',
    ])
    expect(isPoolEmCategory('langwaffe_stg77')).toBe(true)
    expect(isPoolEmCategory('schutzweste')).toBe(false)
    expect(isPoolEmCategory('glock_17')).toBe(false)
    expect(POOL_EM_CATEGORY_LABELS.pfefferspray_gross).toBe('großes Pfefferspray')
    expect(POOL_EM_CATEGORY_LABELS.pfefferspray_klein).toBe('Pfefferspray Nachfüllkartusche klein')
    expect(POOL_EM_CATEGORY_LABELS.munition).toBe('Munition (Pool)')
  })

  it('kennt die erweiterten Verwahrungsorte inkl. Spind und Waffentresor', () => {
    expect(VERWAHRUNGSORTE).toContain('spind_1')
    expect(VERWAHRUNGSORTE).toContain('spind_2')
    expect(VERWAHRUNGSORTE).toContain('waffentresor_zentrale')
    expect(VERWAHRUNGSORTE).toContain('waffentresor_keller')
    expect(VERWAHRUNGSORT_LABELS.spind_1).toBe('Spind 1')
    expect(VERWAHRUNGSORT_LABELS.waffentresor_keller).toBe('Waffentresor Keller')
    expect(isVerwahrungsort('lager')).toBe(true)
    expect(isVerwahrungsort('waffentresor_zentrale')).toBe(true)
    expect(isVerwahrungsort('peter_3')).toBe(false)
    expect(isVerwahrungsort('fuhrpark')).toBe(false)
  })

  it('ordnet jeder Kategorie nur die festgelegten Felder zu', () => {
    expect([...POOL_EM_FIELDS.langwaffe_stg77]).toEqual(['marke', 'typ', 'waffennummer', 'kaliber'])
    expect([...POOL_EM_FIELDS.magazine]).toEqual(['anzahl'])
    expect([...POOL_EM_FIELDS.munition]).toEqual(['art', 'typ', 'marke', 'anzahl'])
    expect([...POOL_EM_FIELDS.pfefferspray_gross]).toEqual(['marke', 'anzahl', 'ablaufdatum'])
    expect([...POOL_EM_FIELDS.pfefferspray_klein]).toEqual(['marke', 'anzahl', 'ablaufdatum'])
    expect([...POOL_EM_FIELDS.schild]).toEqual(['marke', 'anzahl'])
    expect([...POOL_EM_FIELDS.ballistischer_helm]).toEqual(['ablaufdatum', 'anzahl'])
    expect([...POOL_EM_FIELDS.schwere_westen]).toEqual(['marke', 'anzahl', 'groessen', 'ablaufdatum'])
    expect([...POOL_EM_FIELDS.spuckschutzhaube]).toEqual(['anzahl'])
  })

  it('beschriftet Anzahl bei Pool-Munition als Menge', () => {
    expect(poolEmFieldLabel('anzahl', 'magazine')).toBe('Anzahl')
    expect(poolEmFieldLabel('anzahl', 'munition')).toBe('Menge')
    expect(poolEmFieldLabel('typ', 'langwaffe_stg77')).toBe('Type')
    expect(poolEmFieldLabel('ablaufdatum', 'ballistischer_helm')).toBe('Ablauf')
  })
})

describe('validatePoolEm', () => {
  it('verlangt Kategorie und Verwahrungsort', () => {
    expect(validatePoolEm({ category: '', verwahrungsort: 'lager', values: empty }).ok).toBe(false)
    expect(validatePoolEm({ category: 'magazine', verwahrungsort: '', values: empty }).ok).toBe(false)
    expect(validatePoolEm({ category: 'schutzweste', verwahrungsort: 'lager', values: empty }).ok).toBe(false)
    expect(validatePoolEm({ category: 'magazine', verwahrungsort: 'keller', values: empty }).ok).toBe(false)
  })

  it('nimmt Stg77-Felder und setzt fremde Spalten auf null', () => {
    const result = validatePoolEm({
      category: 'langwaffe_stg77',
      verwahrungsort: 'peter_1',
      values: { ...empty, marke: 'Steyr', typ: 'A1', waffennummer: 'ST-12', kaliber: '5,56', anzahl: '9' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload).toMatchObject({
      category: 'langwaffe_stg77',
      verwahrungsort: 'peter_1',
      lager_notiz: null,
      marke: 'Steyr',
      typ: 'A1',
      waffennummer: 'ST-12',
      kaliber: '5,56',
      anzahl: null,
      art: null,
    })
  })

  it('prüft Anzahl als nicht-negative Ganzzahl und Menge bei Munition', () => {
    const bad = validatePoolEm({
      category: 'magazine',
      verwahrungsort: 'lager',
      values: { ...empty, anzahl: '-2' },
    })
    expect(bad.ok).toBe(false)

    const ok = validatePoolEm({
      category: 'munition',
      verwahrungsort: 'lager',
      values: { ...empty, marke: 'Geco', typ: '9mm', art: 'Übung', anzahl: '200' },
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.payload.anzahl).toBe(200)
      expect(ok.payload.art).toBe('Übung')
    }
  })

  it('nimmt kleine Pfefferspray-Nachfüllkartuschen wie das große Pfefferspray an', () => {
    const result = validatePoolEm({
      category: 'pfefferspray_klein',
      verwahrungsort: 'lager',
      values: { ...empty, marke: 'RSG', anzahl: '12', ablaufdatum: '2028-01-01' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload).toMatchObject({
      category: 'pfefferspray_klein',
      marke: 'RSG',
      anzahl: 12,
      ablaufdatum: '2028-01-01',
      typ: null,
      groessen: null,
    })
  })

  it('erlaubt Spuckschutzhaube nur mit Verwahrungsort', () => {
    const result = validatePoolEm({
      category: 'spuckschutzhaube',
      verwahrungsort: 'innendienst',
      values: empty,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload.verwahrungsort).toBe('innendienst')
    expect(result.payload.anzahl).toBeNull()
    expect(result.payload.marke).toBeNull()
    expect(result.payload.lager_notiz).toBeNull()
  })

  it('nimmt die neuen Orte und speichert Lager-Notiz nur bei Lager', () => {
    const spind = validatePoolEm({
      category: 'magazine',
      verwahrungsort: 'spind_1',
      lagerNotiz: 'Regal A',
      values: { ...empty, anzahl: '4' },
    })
    expect(spind.ok).toBe(true)
    if (spind.ok) {
      expect(spind.payload.verwahrungsort).toBe('spind_1')
      expect(spind.payload.lager_notiz).toBeNull()
    }

    const tresor = validatePoolEm({
      category: 'langwaffe_stg77',
      verwahrungsort: 'waffentresor_keller',
      values: { ...empty, waffennummer: 'ST-9' },
    })
    expect(tresor.ok).toBe(true)
    if (tresor.ok) {
      expect(tresor.payload.verwahrungsort).toBe('waffentresor_keller')
      expect(tresor.payload.lager_notiz).toBeNull()
    }

    const lager = validatePoolEm({
      category: 'schild',
      verwahrungsort: 'lager',
      lagerNotiz: '  Fach 3  ',
      values: { ...empty, anzahl: '2' },
    })
    expect(lager.ok).toBe(true)
    if (lager.ok) {
      expect(lager.payload.lager_notiz).toBe('Fach 3')
    }

    const leer = validatePoolEm({
      category: 'schild',
      verwahrungsort: 'lager',
      lagerNotiz: '   ',
      values: empty,
    })
    expect(leer.ok).toBe(true)
    if (leer.ok) expect(leer.payload.lager_notiz).toBeNull()
  })
})

describe('Anzeige und Lagerbestand', () => {
  it('baut den Detailtext nur aus Kategorie-Feldern', () => {
    expect(poolEmDetailText({
      category: 'schild',
      verwahrungsort: 'lager',
      marke: 'Protoshield',
      typ: 'x',
      waffennummer: null,
      kaliber: null,
      art: null,
      anzahl: 4,
      groessen: null,
      ablaufdatum: null,
    })).toBe('Marke: Protoshield · Anzahl: 4')
  })

  it('füllt das Formular aus einem Datensatz', () => {
    expect(formValuesFromPoolRecord({
      marke: 'Brand',
      typ: null,
      waffennummer: null,
      kaliber: null,
      art: null,
      anzahl: 3,
      groessen: 'L, XL',
      ablaufdatum: '2029-06-01',
    })).toMatchObject({
      marke: 'Brand',
      anzahl: '3',
      groessen: 'L, XL',
      ablaufdatum: '2029-06-01',
      typ: '',
    })
  })

  it('zählt Langwaffen zeilenweise und summiert Anzahl sonst', () => {
    expect(poolEmStockQuantity({ category: 'langwaffe_stg77', anzahl: null })).toBe(1)
    expect(poolEmStockQuantity({ category: 'langwaffe_stg77', anzahl: 5 })).toBe(1)
    expect(poolEmStockQuantity({ category: 'magazine', anzahl: 12 })).toBe(12)
    expect(poolEmStockQuantity({ category: 'magazine', anzahl: null })).toBe(0)
  })

  it('aggregiert Lagerbestand je Kategorie und Ort inkl. leerer Zeilen', () => {
    const rows = aggregateLagerbestand([
      { category: 'langwaffe_stg77', verwahrungsort: 'peter_1', anzahl: null },
      { category: 'langwaffe_stg77', verwahrungsort: 'peter_1', anzahl: null },
      { category: 'langwaffe_stg77', verwahrungsort: 'lager', anzahl: null },
      { category: 'munition', verwahrungsort: 'lager', anzahl: 100 },
      { category: 'munition', verwahrungsort: 'lager', anzahl: 50 },
      { category: 'munition', verwahrungsort: 'peter_30', anzahl: 20 },
      { category: 'magazine', verwahrungsort: 'innendienst', anzahl: null },
      { category: 'pfefferspray_gross', verwahrungsort: 'spind_2', anzahl: 6 },
      { category: 'langwaffe_stg77', verwahrungsort: 'waffentresor_zentrale', anzahl: null },
    ])
    expect(rows).toHaveLength(9)
    const stg = rows.find(r => r.category === 'langwaffe_stg77')
    expect(stg?.byOrt.peter_1).toBe(2)
    expect(stg?.byOrt.lager).toBe(1)
    expect(stg?.byOrt.waffentresor_zentrale).toBe(1)
    expect(stg?.total).toBe(4)
    const mun = rows.find(r => r.category === 'munition')
    expect(mun?.byOrt.lager).toBe(150)
    expect(mun?.byOrt.peter_30).toBe(20)
    expect(mun?.total).toBe(170)
    const mag = rows.find(r => r.category === 'magazine')
    expect(mag?.total).toBe(0)
    const spray = rows.find(r => r.category === 'pfefferspray_gross')
    expect(spray?.byOrt.spind_2).toBe(6)
    expect(spray?.total).toBe(6)
    const helm = rows.find(r => r.category === 'ballistischer_helm')
    expect(helm?.total).toBe(0)
    expect(helm?.byOrt.lager).toBe(0)
    expect(Object.keys(emptyOrtCounts())).toEqual([...VERWAHRUNGSORTE])
    expect(helm?.byOrt.spind_1).toBe(0)
    expect(helm?.byOrt.waffentresor_zentrale).toBe(0)
  })

  it('lässt ausgebuchte Pool-Zeilen im Lagerbestand weg', () => {
    const rows = aggregateLagerbestand([
      { category: 'munition', verwahrungsort: 'lager', anzahl: 100 },
      { category: 'munition', verwahrungsort: 'lager', anzahl: 50, removed_at: '2026-09-06T10:00:00.000Z' },
      { category: 'langwaffe_stg77', verwahrungsort: 'peter_1', anzahl: null, removed_at: '2026-09-06T10:00:00.000Z' },
    ])
    expect(rows.find(r => r.category === 'munition')?.total).toBe(100)
    expect(rows.find(r => r.category === 'langwaffe_stg77')?.total).toBe(0)
  })

  it('hängt die Lager-Notiz nur an das Lager-Label', () => {
    expect(poolEmLocationLabel('lager', null)).toBe('Lager')
    expect(poolEmLocationLabel('lager', ' Fach 2 ')).toBe('Lager · Fach 2')
    expect(poolEmLocationLabel('spind_2', 'soll-weg')).toBe('Spind 2')
    expect(resolveLagerNotiz('lager', '  Kiste  ')).toBe('Kiste')
    expect(resolveLagerNotiz('innendienst', 'Kiste')).toBeNull()
    expect(resolveLagerNotiz('waffentresor_zentrale', 'Kiste')).toBeNull()
  })
})

describe('canManagePoolEinsatzmittel', () => {
  it('erlaubt globalen Admin immer', () => {
    expect(canManagePoolEinsatzmittel({ isStrictAdmin: true, rows: [] })).toBe(true)
    expect(canManagePoolEinsatzmittel({ isStrictAdmin: true, rows: null })).toBe(true)
  })

  it('erlaubt einsatz_mt Sachbearbeiter und Admin', () => {
    expect(canManagePoolEinsatzmittel({
      isStrictAdmin: false,
      rows: [{ area: 'einsatz_mt', roles: ['sachbearbeiter'] }],
    })).toBe(true)
    expect(canManagePoolEinsatzmittel({
      isStrictAdmin: false,
      rows: [{ area: 'einsatz_mt', roles: ['admin'] }],
    })).toBe(true)
  })

  it('verbietet reines Leserecht und fehlende Tabelle', () => {
    expect(canManagePoolEinsatzmittel({
      isStrictAdmin: false,
      rows: [{ area: 'einsatz_mt', roles: ['user'] }],
    })).toBe(false)
    expect(canManagePoolEinsatzmittel({ isStrictAdmin: false, rows: null })).toBe(false)
    expect(canManagePoolEinsatzmittel({
      isStrictAdmin: false,
      rows: [{ area: 'bekleidung', roles: ['sachbearbeiter'] }],
    })).toBe(false)
  })

  it('erlaubt Genehmiger bereichsübergreifend ohne eigene Bereichsrolle', () => {
    expect(canManagePoolEinsatzmittel({ isStrictAdmin: false, isGenehmiger: true, rows: null })).toBe(true)
    expect(canManagePoolEinsatzmittel({ isStrictAdmin: false, isGenehmiger: false, rows: null })).toBe(false)
  })
})

describe('canPurchasePoolEinsatzmittel', () => {
  it('erlaubt nur Admin und Genehmiger', () => {
    expect(canPurchasePoolEinsatzmittel({ isStrictAdmin: true })).toBe(true)
    expect(canPurchasePoolEinsatzmittel({ isStrictAdmin: false, isGenehmiger: true })).toBe(true)
    expect(canPurchasePoolEinsatzmittel({ isStrictAdmin: false, isGenehmiger: false })).toBe(false)
    expect(canPurchasePoolEinsatzmittel({ isStrictAdmin: false })).toBe(false)
  })
})

describe('Pool-Munition für Benutzer', () => {
  const items = [
    { id: '1', category: 'schild' },
    { id: '2', category: 'munition' },
    { id: '3', category: 'magazine' },
    { id: '4', category: 'munition' },
  ]

  it('blendet Munition in Kategorien und Liste für Nicht-Manager aus', () => {
    expect(visiblePoolEmCategories(true)).toEqual(POOL_EM_CATEGORIES)
    expect(visiblePoolEmCategories(false)).not.toContain('munition')
    expect(visiblePoolEmCategories(false)).toContain('magazine')
    expect(filterPoolItemsForViewer(items, true).map(i => i.id)).toEqual(['1', '2', '3', '4'])
    expect(filterPoolItemsForViewer(items, false).map(i => i.id)).toEqual(['1', '3'])
  })

  it('setzt den Munitions-Filter ohne Manage-Recht auf Alle', () => {
    expect(sanitizePoolCategoryFilter('munition', false)).toBe('all')
    expect(sanitizePoolCategoryFilter('munition', true)).toBe('munition')
    expect(sanitizePoolCategoryFilter('magazine', false)).toBe('magazine')
    expect(sanitizePoolCategoryFilter('all', false)).toBe('all')
  })
})
