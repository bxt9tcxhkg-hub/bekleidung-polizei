import { describe, expect, it } from 'vitest'
import {
  PERSONAL_EM_CATEGORIES,
  PERSONAL_EM_CATEGORY_LABELS,
  PERSONAL_EM_FIELDS,
  canManagePersonalEinsatzmittel,
  emptyPersonalEmFormValues,
  formValuesFromRecord,
  formatIsoDate,
  isPersonalEmCategory,
  normalizeAblaufMmYyyy,
  officerDisplayName,
  personalEmDetailText,
  personalEmFieldLabel,
  validatePersonalEm,
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
    expect([...PERSONAL_EM_FIELDS.glock_17]).toEqual(['waffennummer', 'service', 'magazinanzahl'])
    expect([...PERSONAL_EM_FIELDS.munition]).toEqual(['marke', 'kaliber', 'art', 'patronen'])
    expect([...PERSONAL_EM_FIELDS.pfefferspray]).toEqual(['ablauf_mm_yyyy'])
    expect([...PERSONAL_EM_FIELDS.schlagstock]).toEqual([])
    expect([...PERSONAL_EM_FIELDS.handfesseln]).toEqual([])
    expect([...PERSONAL_EM_FIELDS.taschenlampe_kelle]).toEqual(['marke'])
    expect([...PERSONAL_EM_FIELDS.leatherman]).toEqual(['marke'])
    expect([...PERSONAL_EM_FIELDS.warnweste]).toEqual(['marke', 'groesse'])
  })

  it('beschriftet Marke bei Taschenlampe und Leatherman als Marke/Type', () => {
    expect(personalEmFieldLabel('marke', 'warnweste')).toBe('Marke')
    expect(personalEmFieldLabel('marke', 'taschenlampe_kelle')).toBe('Marke/Type')
    expect(personalEmFieldLabel('marke', 'leatherman')).toBe('Marke/Type')
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
  it('verlangt Kategorie und Polizist', () => {
    expect(validatePersonalEm({ category: '', officer_id: 'u1', values: empty }).ok).toBe(false)
    expect(validatePersonalEm({ category: 'schutzweste', officer_id: '', values: empty }).ok).toBe(false)
    expect(validatePersonalEm({ category: 'stg77', officer_id: 'u1', values: empty }).ok).toBe(false)
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

  it('erlaubt Schlagstock nur mit Polizist', () => {
    const result = validatePersonalEm({ category: 'schlagstock', officer_id: 'u2', values: empty })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload.officer_id).toBe('u2')
    expect(result.payload.marke).toBeNull()
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
