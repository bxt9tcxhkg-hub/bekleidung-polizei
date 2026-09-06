import { describe, expect, it } from 'vitest'
import {
  POOL_EM_CATEGORIES,
  POOL_EM_CATEGORY_LABELS,
  POOL_EM_FIELDS,
  VERWAHRUNGSORTE,
  VERWAHRUNGSORT_LABELS,
  aggregateLagerbestand,
  canManagePoolEinsatzmittel,
  emptyPoolEmFormValues,
  formValuesFromPoolRecord,
  isPoolEmCategory,
  isVerwahrungsort,
  poolEmDetailText,
  poolEmFieldLabel,
  poolEmStockQuantity,
  validatePoolEm,
} from './poolEinsatzmittel'

const empty = emptyPoolEmFormValues()

describe('Kategorien und Verwahrungsorte', () => {
  it('enthält genau die acht Pool-Typen, ohne persönliche Kategorien', () => {
    expect([...POOL_EM_CATEGORIES]).toEqual([
      'langwaffe_stg77',
      'magazine',
      'munition',
      'pfefferspray_gross',
      'schild',
      'ballistischer_helm',
      'schwere_westen',
      'spuckschutzhaube',
    ])
    expect(isPoolEmCategory('langwaffe_stg77')).toBe(true)
    expect(isPoolEmCategory('schutzweste')).toBe(false)
    expect(isPoolEmCategory('glock_17')).toBe(false)
    expect(POOL_EM_CATEGORY_LABELS.pfefferspray_gross).toBe('großes Pfefferspray')
    expect(POOL_EM_CATEGORY_LABELS.munition).toBe('Munition (Pool)')
  })

  it('kennt nur die festgelegten Verwahrungsorte', () => {
    expect([...VERWAHRUNGSORTE]).toEqual(['lager', 'innendienst', 'peter_1', 'peter_2', 'peter_30'])
    expect(VERWAHRUNGSORT_LABELS).toEqual({
      lager: 'Lager',
      innendienst: 'Innendienst',
      peter_1: 'Peter 1',
      peter_2: 'Peter 2',
      peter_30: 'Peter 30',
    })
    expect(isVerwahrungsort('lager')).toBe(true)
    expect(isVerwahrungsort('peter_3')).toBe(false)
    expect(isVerwahrungsort('fuhrpark')).toBe(false)
  })

  it('ordnet jeder Kategorie nur die festgelegten Felder zu', () => {
    expect([...POOL_EM_FIELDS.langwaffe_stg77]).toEqual(['marke', 'typ', 'waffennummer', 'kaliber'])
    expect([...POOL_EM_FIELDS.magazine]).toEqual(['anzahl'])
    expect([...POOL_EM_FIELDS.munition]).toEqual(['marke', 'typ', 'art', 'anzahl'])
    expect([...POOL_EM_FIELDS.pfefferspray_gross]).toEqual(['marke', 'anzahl', 'ablaufdatum'])
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
    ])
    expect(rows).toHaveLength(8)
    const stg = rows.find(r => r.category === 'langwaffe_stg77')
    expect(stg?.byOrt.peter_1).toBe(2)
    expect(stg?.byOrt.lager).toBe(1)
    expect(stg?.total).toBe(3)
    const mun = rows.find(r => r.category === 'munition')
    expect(mun?.byOrt.lager).toBe(150)
    expect(mun?.byOrt.peter_30).toBe(20)
    expect(mun?.total).toBe(170)
    const mag = rows.find(r => r.category === 'magazine')
    expect(mag?.total).toBe(0)
    const helm = rows.find(r => r.category === 'ballistischer_helm')
    expect(helm?.total).toBe(0)
    expect(helm?.byOrt.lager).toBe(0)
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
})
