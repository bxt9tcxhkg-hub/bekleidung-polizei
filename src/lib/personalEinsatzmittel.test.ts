import { describe, expect, it } from 'vitest'
import {
  PERSONAL_EM_CATEGORIES,
  PERSONAL_EM_CATEGORY_LABELS,
  PERSONAL_EM_FIELDS,
  PERSONAL_EM_ORG_FILTERS,
  PERSONAL_EM_ORG_FILTER_LABELS,
  aggregatePersonalLagerbestand,
  canManagePersonalEinsatzmittel,
  emptyPersonalEmFormValues,
  filterActiveOfficersForPersonalEmMatrix,
  formValuesFromRecord,
  formatIsoDate,
  isPersonalEmCategory,
  isPersonalEmInLager,
  normalizeAblaufMmYyyy,
  officerDisplayName,
  officerMatchesPersonalEmOrgFilter,
  ownPersonalEinsatzmittel,
  personalEmDetailText,
  personalEmFieldLabel,
  personalEmItemsForMatrixCell,
  personalEmKeyDetail,
  personalEmLocationLabel,
  personalEmMatrixCellStatus,
  personalEmOfficerLabel,
  personalItemsInLager,
  toPersonalLagerAssignment,
  unassignedActivePersonalEm,
  validatePersonalEm,
  type PersonalEmMatrixRecord,
} from './personalEinsatzmittel'

const empty = emptyPersonalEmFormValues()

describe('Kategorien', () => {
  it('enthält genau die neun persönlichen Typen, ohne Pool', () => {
    expect([...PERSONAL_EM_CATEGORIES]).toEqual([
      'schutzweste',
      'glock_17',
      'munition',
      'pfefferspray',
      'schlagstock',
      'handfesseln',
      'taschenlampe_kelle',
      'leatherman',
      'warnweste',
    ])
    expect(isPersonalEmCategory('schutzweste')).toBe(true)
    expect(isPersonalEmCategory('stg77')).toBe(false)
    expect(PERSONAL_EM_CATEGORY_LABELS.taschenlampe_kelle).toBe('Taschenlampe + rote Kelle')
  })

  it('ordnet jeder Kategorie nur die festgelegten Felder zu', () => {
    expect([...PERSONAL_EM_FIELDS.schutzweste]).toEqual(['groesse', 'ablaufdatum', 'schutzfristen'])
    expect([...PERSONAL_EM_FIELDS.glock_17]).toEqual(['marke', 'waffennummer', 'service', 'magazinanzahl'])
    expect([...PERSONAL_EM_FIELDS.munition]).toEqual(['marke', 'kaliber', 'art', 'patronen'])
    expect([...PERSONAL_EM_FIELDS.pfefferspray]).toEqual(['ablauf_mm_yyyy'])
    expect([...PERSONAL_EM_FIELDS.schlagstock]).toEqual(['marke'])
    expect([...PERSONAL_EM_FIELDS.handfesseln]).toEqual([])
    expect([...PERSONAL_EM_FIELDS.taschenlampe_kelle]).toEqual(['marke'])
    expect([...PERSONAL_EM_FIELDS.leatherman]).toEqual(['marke'])
    expect([...PERSONAL_EM_FIELDS.warnweste]).toEqual(['marke', 'groesse'])
  })

  it('beschriftet Marke je Kategorie', () => {
    expect(personalEmFieldLabel('marke', 'warnweste')).toBe('Marke')
    expect(personalEmFieldLabel('marke', 'taschenlampe_kelle')).toBe('Marke/Type')
    expect(personalEmFieldLabel('marke', 'leatherman')).toBe('Marke/Type')
    expect(personalEmFieldLabel('marke', 'glock_17')).toBe('Modell')
    expect(personalEmFieldLabel('marke', 'schlagstock')).toBe('Kennung (EKA)')
  })
})

describe('normalizeAblaufMmYyyy', () => {
  it('akzeptiert MM/JJJJ und füllt einstellige Monate auf', () => {
    expect(normalizeAblaufMmYyyy('03/2027')).toEqual({ ok: true, value: '03/2027' })
    expect(normalizeAblaufMmYyyy(' 3 / 2027 ')).toEqual({ ok: true, value: '03/2027' })
    expect(normalizeAblaufMmYyyy('')).toEqual({ ok: true, value: null })
  })

  it('lehnt ungültige Monate und Formate ab', () => {
    expect(normalizeAblaufMmYyyy('13/2027').ok).toBe(false)
    expect(normalizeAblaufMmYyyy('2027-03').ok).toBe(false)
    expect(normalizeAblaufMmYyyy('März 2027').ok).toBe(false)
  })
})

describe('validatePersonalEm', () => {
  it('verlangt Kategorie und Polizist oder Verwahrungsort', () => {
    expect(validatePersonalEm({ category: '', officer_id: 'u1', values: empty }).ok).toBe(false)
    expect(validatePersonalEm({ category: 'schutzweste', officer_id: '', values: empty }).ok).toBe(false)
    expect(validatePersonalEm({ category: 'stg77', officer_id: 'u1', values: empty }).ok).toBe(false)
    expect(validatePersonalEm({
      category: 'schutzweste',
      officer_id: '',
      verwahrungsort: 'keller',
      values: empty,
    }).ok).toBe(false)
  })

  it('erlaubt Einlagerung ohne Polizist', () => {
    const result = validatePersonalEm({
      category: 'glock_17',
      officer_id: '',
      verwahrungsort: 'lager',
      values: { ...empty, waffennummer: 'W-1001' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload).toMatchObject({
      category: 'glock_17',
      officer_id: null,
      verwahrungsort: 'lager',
      waffennummer: 'W-1001',
    })
  })

  it('erlaubt Polizist ohne Verwahrungsort und beides zusammen', () => {
    const assigned = validatePersonalEm({ category: 'schlagstock', officer_id: 'u2', values: empty })
    expect(assigned.ok).toBe(true)
    if (assigned.ok) {
      expect(assigned.payload.officer_id).toBe('u2')
      expect(assigned.payload.verwahrungsort).toBeNull()
    }

    const both = validatePersonalEm({
      category: 'warnweste',
      officer_id: 'u3',
      verwahrungsort: 'innendienst',
      values: empty,
    })
    expect(both.ok).toBe(true)
    if (both.ok) {
      expect(both.payload.officer_id).toBe('u3')
      expect(both.payload.verwahrungsort).toBe('innendienst')
    }
  })

  it('akzeptiert die erweiterten Verwahrungsorte aus dem gemeinsamen Lookup', () => {
    const result = validatePersonalEm({
      category: 'schlagstock',
      officer_id: '',
      verwahrungsort: 'spind_2',
      values: empty,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.verwahrungsort).toBe('spind_2')
  })

  it('nimmt Schutzweste-Felder und setzt fremde Spalten auf null', () => {
    const result = validatePersonalEm({
      category: 'schutzweste',
      officer_id: 'u1',
      values: { ...empty, groesse: 'L', ablaufdatum: '2028-04-01', schutzfristen: 'jährlich', waffennummer: 'darf-weg' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload).toMatchObject({
      category: 'schutzweste',
      officer_id: 'u1',
      verwahrungsort: null,
      groesse: 'L',
      ablaufdatum: '2028-04-01',
      schutzfristen: 'jährlich',
      waffennummer: null,
      magazinanzahl: null,
    })
  })

  it('prüft Magazinanzahl und Patronen als nicht-negative Ganzzahlen', () => {
    const bad = validatePersonalEm({
      category: 'glock_17',
      officer_id: 'u1',
      values: { ...empty, magazinanzahl: '-1' },
    })
    expect(bad.ok).toBe(false)

    const ok = validatePersonalEm({
      category: 'munition',
      officer_id: 'u1',
      values: { ...empty, marke: 'Geco', kaliber: '9x19', art: 'Übung', patronen: '50' },
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.payload.patronen).toBe(50)
  })

  it('erlaubt Schlagstock mit Polizist und EKA-Kennung', () => {
    const result = validatePersonalEm({
      category: 'schlagstock',
      officer_id: 'u2',
      values: { ...empty, marke: 'EKA-12' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload.officer_id).toBe('u2')
    expect(result.payload.marke).toBe('EKA-12')
  })
})

describe('Anzeigehelfer', () => {
  it('formatiert ISO-Datum lokal ohne UTC-Versatz', () => {
    expect(formatIsoDate('2028-04-01')).toBe('01.04.2028')
    expect(formatIsoDate(null)).toBe('')
  })

  it('baut den Detailtext nur aus Kategorie-Feldern', () => {
    expect(personalEmDetailText({
      category: 'warnweste',
      groesse: 'XL',
      ablaufdatum: null,
      schutzfristen: null,
      waffennummer: 'x',
      service: null,
      magazinanzahl: null,
      marke: '3M',
      kaliber: null,
      art: null,
      patronen: null,
      ablauf_mm_yyyy: null,
    })).toBe('Marke: 3M · Größe: XL')
  })

  it('zeigt Polizist mit Dienstnummer', () => {
    expect(officerDisplayName({ name: 'Max Muster', dienstnummer: '1234' })).toBe('Max Muster (1234)')
    expect(officerDisplayName(null)).toBe('–')
    expect(personalEmOfficerLabel(null, null)).toBe('nicht zugewiesen')
    expect(personalEmOfficerLabel({ name: 'Eva' }, 'u1')).toBe('Eva')
    expect(personalEmLocationLabel(null)).toBe('Beim Polizisten')
    expect(personalEmLocationLabel('lager')).toBe('Lager')
    expect(personalEmLocationLabel('peter_30')).toBe('Peter 30')
    expect(personalEmLocationLabel('spind_1')).toBe('Spind 1')
    expect(personalEmLocationLabel('waffentresor_zentrale')).toBe('Waffentresor Zentrale')
  })

  it('füllt das Formular aus einem Datensatz', () => {
    expect(formValuesFromRecord({
      groesse: 'M',
      ablaufdatum: '2029-01-15',
      schutzfristen: null,
      waffennummer: null,
      service: null,
      magazinanzahl: 3,
      marke: null,
      kaliber: null,
      art: null,
      patronen: null,
      ablauf_mm_yyyy: null,
    })).toMatchObject({ groesse: 'M', ablaufdatum: '2029-01-15', magazinanzahl: '3', schutzfristen: '' })
  })
})

describe('Lagerbestand persönliche EM', () => {
  it('zählt eingelagerte Stücke je Kategorie einzeln, auch gleiche Kategorie', () => {
    const rows = aggregatePersonalLagerbestand([
      { category: 'glock_17', verwahrungsort: 'lager' },
      { category: 'glock_17', verwahrungsort: 'lager' },
      { category: 'glock_17', verwahrungsort: 'peter_1' },
      { category: 'warnweste', verwahrungsort: 'lager' },
      { category: 'schutzweste', verwahrungsort: null },
    ])
    expect(rows).toHaveLength(9)
    expect(rows.find(r => r.category === 'glock_17')?.count).toBe(2)
    expect(rows.find(r => r.category === 'warnweste')?.count).toBe(1)
    expect(rows.find(r => r.category === 'schutzweste')?.count).toBe(0)
    expect(rows.find(r => r.category === 'munition')?.count).toBe(0)
  })

  it('zählt ausgebuchte Stücke nicht zum Lagerbestand', () => {
    const rows = aggregatePersonalLagerbestand([
      { category: 'glock_17', verwahrungsort: 'lager' },
      { category: 'glock_17', verwahrungsort: 'lager', removed_at: '2026-09-06T10:00:00.000Z' },
      { category: 'warnweste', verwahrungsort: 'lager', removed_at: '2026-09-06T10:00:00.000Z' },
    ])
    expect(rows.find(r => r.category === 'glock_17')?.count).toBe(1)
    expect(rows.find(r => r.category === 'warnweste')?.count).toBe(0)
    expect(isPersonalEmInLager({ verwahrungsort: 'lager', removed_at: '2026-09-06T10:00:00.000Z' })).toBe(false)
    expect(personalItemsInLager([
      { id: 'a', verwahrungsort: 'lager' },
      { id: 'b', verwahrungsort: 'lager', removed_at: '2026-09-06T10:00:00.000Z' },
    ]).map(i => i.id)).toEqual(['a'])
  })

  it('filtert nur Lager-Zeilen und liefert Einlager-Payload ohne Officer', () => {
    expect(isPersonalEmInLager({ verwahrungsort: 'lager' })).toBe(true)
    expect(isPersonalEmInLager({ verwahrungsort: 'innendienst' })).toBe(false)
    expect(personalItemsInLager([
      { id: 'a', verwahrungsort: 'lager' },
      { id: 'b', verwahrungsort: null },
    ]).map(i => i.id)).toEqual(['a'])
    expect(toPersonalLagerAssignment()).toEqual({ officer_id: null, verwahrungsort: 'lager' })
  })
})

function matrixRecord(partial: Partial<PersonalEmMatrixRecord> & { category?: PersonalEmMatrixRecord['category'] }): PersonalEmMatrixRecord {
  return {
    category: 'warnweste',
    groesse: null,
    ablaufdatum: null,
    schutzfristen: null,
    waffennummer: null,
    service: null,
    magazinanzahl: null,
    marke: null,
    kaliber: null,
    art: null,
    patronen: null,
    ablauf_mm_yyyy: null,
    officer_id: 'u1',
    verwahrungsort: null,
    removed_at: null,
    ...partial,
  }
}

describe('Org-Filter Matrix', () => {
  it('nutzt die bestehenden Geltungs-Labels Polizei / Parkaufsicht / Alle', () => {
    expect([...PERSONAL_EM_ORG_FILTERS]).toEqual(['polizei', 'parkaufsicht', 'alle'])
    expect(PERSONAL_EM_ORG_FILTER_LABELS.polizei).toBe('Polizei')
    expect(PERSONAL_EM_ORG_FILTER_LABELS.parkaufsicht).toBe('Parkaufsicht')
    expect(PERSONAL_EM_ORG_FILTER_LABELS.alle).toBe('Alle')
  })

  it('filtert über isStadtpolizeiMember / isParkaufsichtMember, leere Org zählt als Polizei', () => {
    expect(officerMatchesPersonalEmOrgFilter({ organisation: 'Stadtpolizei' }, 'polizei')).toBe(true)
    expect(officerMatchesPersonalEmOrgFilter({ organisation: 'Parkaufsicht' }, 'polizei')).toBe(false)
    expect(officerMatchesPersonalEmOrgFilter({ organisation: 'Parkaufsicht' }, 'parkaufsicht')).toBe(true)
    expect(officerMatchesPersonalEmOrgFilter({ organisation: 'Stadtpolizei' }, 'parkaufsicht')).toBe(false)
    expect(officerMatchesPersonalEmOrgFilter({ organisation: '' }, 'polizei')).toBe(true)
    expect(officerMatchesPersonalEmOrgFilter({ organisation: '' }, 'parkaufsicht')).toBe(false)
    expect(officerMatchesPersonalEmOrgFilter({ organisation: 'Stadtpolizei' }, 'alle')).toBe(true)
    expect(officerMatchesPersonalEmOrgFilter({ organisation: 'Parkaufsicht' }, 'alle')).toBe(true)
  })

  it('nimmt nur aktive Offiziere und sortiert nach Anzeigename', () => {
    const rows = filterActiveOfficersForPersonalEmMatrix([
      { id: 'p', name: 'Park', organisation: 'Parkaufsicht', active: true },
      { id: 'z', name: 'Zoe', organisation: 'Stadtpolizei', active: true },
      { id: 'a', name: 'Anna', organisation: 'Stadtpolizei', active: true },
      { id: 'x', name: 'Inaktiv', organisation: 'Stadtpolizei', active: false },
    ], 'polizei')
    expect(rows.map(r => r.id)).toEqual(['a', 'z'])
    expect(filterActiveOfficersForPersonalEmMatrix(rows, 'parkaufsicht')).toEqual([])
    expect(filterActiveOfficersForPersonalEmMatrix([
      { id: 'p', name: 'Park', organisation: 'Parkaufsicht', active: true },
      { id: 'a', name: 'Anna', organisation: 'Stadtpolizei', active: true },
    ], 'alle').map(r => r.id)).toEqual(['a', 'p'])
  })
})

describe('Matrixzellen', () => {
  it('nimmt das erste Detailfeld als Kurztext', () => {
    expect(personalEmKeyDetail(matrixRecord({
      category: 'warnweste',
      marke: '3M',
      groesse: 'XL',
    }))).toBe('Marke: 3M')
    expect(personalEmKeyDetail(matrixRecord({
      category: 'glock_17',
      waffennummer: 'W-1001',
    }))).toBe('Waffennummer: W-1001')
    expect(personalEmKeyDetail(matrixRecord({ category: 'handfesseln' }))).toBe('')
  })

  it('zeigt leer als Gedankenstrich, eins als Detail, mehrere als N× plus Hinweis', () => {
    expect(personalEmMatrixCellStatus([])).toEqual({
      count: 0,
      text: '—',
      hint: '',
      inLager: false,
    })
    expect(personalEmMatrixCellStatus([matrixRecord({
      category: 'pfefferspray',
      ablauf_mm_yyyy: '03/2027',
    })])).toEqual({
      count: 1,
      text: 'Ablauf (MM/JJJJ): 03/2027',
      hint: 'Ablauf (MM/JJJJ): 03/2027',
      inLager: false,
    })
    expect(personalEmMatrixCellStatus([
      matrixRecord({ category: 'glock_17', waffennummer: 'W-1' }),
      matrixRecord({ category: 'glock_17', waffennummer: 'W-2' }),
    ])).toEqual({
      count: 2,
      text: '2× Waffennummer: W-1',
      hint: 'Waffennummer: W-1',
      inLager: false,
    })
  })

  it('merkt Lager an der Zuweisung und fällt ohne Felder auf zugewiesen zurück', () => {
    expect(personalEmMatrixCellStatus([matrixRecord({
      category: 'handfesseln',
    })]).text).toBe('zugewiesen')
    expect(personalEmMatrixCellStatus([matrixRecord({
      category: 'handfesseln',
      verwahrungsort: 'lager',
    })])).toMatchObject({
      text: 'zugewiesen · Lager',
      inLager: true,
    })
    expect(personalEmMatrixCellStatus([
      matrixRecord({ category: 'warnweste', marke: '3M', verwahrungsort: 'lager' }),
      matrixRecord({ category: 'warnweste', marke: 'UV' }),
    ]).text).toBe('2× Marke: 3M · Lager')
  })

  it('ordnet aktive Zuweisungen nach Polizist und Kategorie, ignoriert Ausbuchungen', () => {
    const items = [
      matrixRecord({ officer_id: 'u1', category: 'schutzweste', groesse: 'L' }),
      matrixRecord({ officer_id: 'u1', category: 'schutzweste', groesse: 'XL', removed_at: '2026-09-01' }),
      matrixRecord({ officer_id: 'u2', category: 'schutzweste', groesse: 'M' }),
      matrixRecord({ officer_id: 'u1', category: 'warnweste', marke: '3M' }),
      matrixRecord({ officer_id: null, category: 'leatherman', marke: 'Wave', verwahrungsort: 'lager' }),
    ]
    expect(personalEmItemsForMatrixCell(items, 'u1', 'schutzweste').map(i => i.groesse)).toEqual(['L'])
    expect(unassignedActivePersonalEm(items)).toHaveLength(1)
    expect(unassignedActivePersonalEm(items)[0].category).toBe('leatherman')
  })
})

describe('canManagePersonalEinsatzmittel', () => {
  it('erlaubt globalen Admin immer', () => {
    expect(canManagePersonalEinsatzmittel({ isStrictAdmin: true, rows: [] })).toBe(true)
    expect(canManagePersonalEinsatzmittel({ isStrictAdmin: true, rows: null })).toBe(true)
  })

  it('erlaubt einsatz_mt Sachbearbeiter und Admin', () => {
    expect(canManagePersonalEinsatzmittel({
      isStrictAdmin: false,
      rows: [{ area: 'einsatz_mt', roles: ['sachbearbeiter'] }],
    })).toBe(true)
    expect(canManagePersonalEinsatzmittel({
      isStrictAdmin: false,
      rows: [{ area: 'einsatz_mt', roles: ['admin'] }],
    })).toBe(true)
  })

  it('verbietet reines Leserecht und fehlende Tabelle', () => {
    expect(canManagePersonalEinsatzmittel({
      isStrictAdmin: false,
      rows: [{ area: 'einsatz_mt', roles: ['user'] }],
    })).toBe(false)
    expect(canManagePersonalEinsatzmittel({ isStrictAdmin: false, rows: null })).toBe(false)
    expect(canManagePersonalEinsatzmittel({
      isStrictAdmin: false,
      rows: [{ area: 'bekleidung', roles: ['sachbearbeiter'] }],
    })).toBe(false)
  })
})

describe('ownPersonalEinsatzmittel', () => {
  it('liefert nur Zeilen des angemeldeten Offiziers', () => {
    const items = [
      { id: 'a', officer_id: 'me' },
      { id: 'b', officer_id: 'other' },
      { id: 'c', officer_id: null },
      { id: 'd', officer_id: 'me' },
    ]
    expect(ownPersonalEinsatzmittel(items, 'me').map(i => i.id)).toEqual(['a', 'd'])
  })

  it('ist leer ohne eigene ID und filtert keine fremden Lagerstücke', () => {
    expect(ownPersonalEinsatzmittel([{ officer_id: 'x' }], null)).toEqual([])
    expect(ownPersonalEinsatzmittel([{ officer_id: 'x' }], '')).toEqual([])
    expect(ownPersonalEinsatzmittel([{ officer_id: null, verwahrungsort: 'lager' }], 'me')).toEqual([])
  })
})
