import { describe, expect, it } from 'vitest'
import {
  PDF_UNASSIGNED_OFFICER,
  buildLagerbestandPdfHtml,
  buildPersonalEmPdfHtml,
  buildPoolEmPdfHtml,
  buildOffenAnmeldungenPdfHtml,
  buildTrainingModulesPdfHtml,
  buildTrainingProtocolPdfHtml,
  compareDe,
  filterPersonalEmForPdf,
  filterPoolEmForPdf,
  reportDateLong,
  sortPersonalEmForPdf,
  sortPoolEmForPdf,
  type PersonalEmPdfRecord,
  type PoolEmPdfRecord,
} from './einsatzPdf'
import { aggregateLagerbestand } from './poolEinsatzmittel'
import { aggregatePersonalLagerbestand } from './personalEinsatzmittel'

const now = new Date(2026, 8, 6)

function personal(partial: Partial<PersonalEmPdfRecord> & Pick<PersonalEmPdfRecord, 'category'>): PersonalEmPdfRecord {
  return {
    officer_id: null,
    verwahrungsort: 'lager',
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
    ...partial,
  }
}

function pool(partial: Partial<PoolEmPdfRecord> & Pick<PoolEmPdfRecord, 'category' | 'verwahrungsort'>): PoolEmPdfRecord {
  return {
    marke: null,
    typ: null,
    waffennummer: null,
    kaliber: null,
    art: null,
    anzahl: null,
    groessen: null,
    ablaufdatum: null,
    ...partial,
  }
}

const items: PersonalEmPdfRecord[] = [
  personal({
    category: 'glock_17',
    officer_id: 'o1',
    verwahrungsort: null,
    waffennummer: 'W-100',
    officer: { name: 'Müller', dienstnummer: '12' },
  }),
  personal({
    category: 'schutzweste',
    officer_id: 'o2',
    verwahrungsort: null,
    groesse: 'L',
    officer: { name: 'Huber', dienstnummer: '34' },
  }),
  personal({
    category: 'munition',
    officer_id: null,
    verwahrungsort: 'lager',
    marke: 'Geco',
  }),
  personal({
    category: 'warnweste',
    officer_id: 'o1',
    verwahrungsort: null,
    marke: 'X',
    officer: { name: 'Müller', dienstnummer: '12' },
    removed_at: '2026-08-01T00:00:00Z',
  }),
]

describe('reportDateLong', () => {
  it('formatiert das Datum auf Deutsch', () => {
    expect(reportDateLong(now)).toBe('06. September 2026')
  })
})

describe('filterPersonalEmForPdf', () => {
  it('nimmt nur aktive Stücke und filtert optional nach Polizist', () => {
    expect(filterPersonalEmForPdf(items).map(i => i.category)).toEqual([
      'glock_17',
      'schutzweste',
      'munition',
    ])
    expect(filterPersonalEmForPdf(items, 'o1').map(i => i.category)).toEqual(['glock_17'])
    expect(filterPersonalEmForPdf(items, PDF_UNASSIGNED_OFFICER).map(i => i.category)).toEqual(['munition'])
  })
})

describe('filterPoolEmForPdf', () => {
  it('nimmt nur aktive Stücke und filtert optional nach Verwahrungsort', () => {
    const poolItems = [
      pool({ category: 'schild', verwahrungsort: 'lager', anzahl: 2 }),
      pool({ category: 'langwaffe_stg77', verwahrungsort: 'spind_1', waffennummer: 'S-1' }),
      pool({ category: 'munition', verwahrungsort: 'lager', anzahl: 10, removed_at: '2026-01-01' }),
    ]
    expect(filterPoolEmForPdf(poolItems)).toHaveLength(2)
    expect(filterPoolEmForPdf(poolItems, 'lager').map(i => i.category)).toEqual(['schild'])
  })
})

describe('Sortierung', () => {
  it('sortiert persönliche EM nach Polizist und Kategorie', () => {
    const sorted = sortPersonalEmForPdf(filterPersonalEmForPdf(items))
    expect(sorted.map(i => `${i.officer_id ?? 'none'}:${i.category}`)).toEqual([
      'o2:schutzweste',
      'o1:glock_17',
      'none:munition',
    ])
  })

  it('sortiert Pool nach Verwahrungsort', () => {
    const sorted = sortPoolEmForPdf([
      pool({ category: 'schild', verwahrungsort: 'spind_2', anzahl: 1 }),
      pool({ category: 'magazine', verwahrungsort: 'lager', anzahl: 4 }),
    ])
    expect(sorted.map(i => i.verwahrungsort)).toEqual(['lager', 'spind_2'])
  })

  it('vergleicht deutsch', () => {
    expect(compareDe('Ärzte', 'Becker')).toBeLessThan(0)
  })
})

describe('buildPersonalEmPdfHtml', () => {
  it('enthält deutsche Spalten, CI-Grün und filtert den Polizisten', () => {
    const html = buildPersonalEmPdfHtml(items, {
      officerId: 'o1',
      officerLabel: 'Müller (12)',
      now,
    })
    expect(html).toContain('Persönliche Einsatzmittel')
    expect(html).toContain('Stadtpolizei Dornbirn')
    expect(html).toContain('Kategorie')
    expect(html).toContain('Polizist')
    expect(html).toContain('Verwahrungsort')
    expect(html).toContain('Waffennummer: W-100')
    expect(html).toContain('Müller (12)')
    expect(html).toContain('#166534')
    expect(html).toContain('06. September 2026')
    expect(html).not.toContain('Schutzweste')
    expect(html).not.toContain('Geco')
    expect(html).not.toContain('<script>')
  })

  it('escaped HTML in Kennungen', () => {
    const html = buildPersonalEmPdfHtml([
      personal({
        category: 'glock_17',
        officer_id: 'o1',
        verwahrungsort: null,
        waffennummer: 'A & B <x>',
        officer: { name: 'Test' },
      }),
    ], { now })
    expect(html).toContain('A &amp; B &lt;x&gt;')
    expect(html).not.toContain('A & B <x>')
  })
})

describe('buildPoolEmPdfHtml', () => {
  it('listet aktive Pool-Stücke mit Verwahrungsort', () => {
    const html = buildPoolEmPdfHtml([
      pool({
        category: 'langwaffe_stg77',
        verwahrungsort: 'waffentresor_zentrale',
        waffennummer: 'STG-9',
        marke: 'Steyr',
      }),
    ], { now })
    expect(html).toContain('Pool-Einsatzmittel')
    expect(html).toContain('Langwaffen Stg77')
    expect(html).toContain('Waffentresor Zentrale')
    expect(html).toContain('Waffennummer: STG-9')
    expect(html).toContain('#166534')
  })
})

describe('buildLagerbestandPdfHtml', () => {
  it('zeigt Pool-Matrix und persönliche Lagerstücke', () => {
    const poolRows = aggregateLagerbestand([
      { category: 'schild', verwahrungsort: 'lager', anzahl: 3 },
    ])
    const personalItems = [
      personal({ category: 'glock_17', verwahrungsort: 'lager', waffennummer: 'L-1' }),
    ]
    const html = buildLagerbestandPdfHtml({
      poolRows,
      personalCounts: aggregatePersonalLagerbestand(personalItems),
      personalItems,
      now,
    })
    expect(html).toContain('Lagerbestand Einsatzmittel')
    expect(html).toContain('A4 landscape')
    expect(html).toContain('Schild')
    expect(html).toContain('Lager')
    expect(html).toContain('L-1')
    expect(html).toContain('Glock 17')
  })
})

describe('buildTrainingProtocolPdfHtml', () => {
  it('druckt internes Protokoll mit Anwesenheit, Intervallen und Munition', () => {
    const html = buildTrainingProtocolPdfHtml({
      session: {
        kind: 'intern',
        session_date: '2026-09-06',
        note: 'Halle A',
        munition_anzahl: 40,
        munition_marke: 'Geco',
        munition_kaliber: '9 mm',
        munition_art: 'Übung',
      },
      attendance: [
        { officer_id: 'o1', status: 'present', officer: { name: 'Müller', dienstnummer: '12' } },
        { officer_id: 'o2', status: 'absent', officer: { name: 'Huber' } },
      ],
      participations: [
        { officer_id: 'o1', interval_label: '1', module: { name: 'Schießen' } },
      ],
      now,
    })
    expect(html).toContain('Trainingstag-Protokoll')
    expect(html).toContain('Intern')
    expect(html).toContain('06.09.2026')
    expect(html).toContain('Halle A')
    expect(html).toContain('Anwesend')
    expect(html).toContain('Abwesend')
    expect(html).toContain('Intervall 1 · Schießen')
    expect(html).toContain('40 · Geco · 9 mm · Übung')
    expect(html).toContain('Müller (12)')
  })

  it('druckt externes Training als Teilnahmeliste ohne Anwesenheit', () => {
    const html = buildTrainingProtocolPdfHtml({
      session: { kind: 'extern', session_date: '2026-04-01', note: null },
      participations: [
        { officer_id: 'o1', interval_label: 'Vormittag', module: { name: 'Erste Hilfe' }, officer: { name: 'Müller' } },
      ],
      now,
    })
    expect(html).toContain('Extern')
    expect(html).toContain('Teilnahmen')
    expect(html).toContain('Erste Hilfe')
    expect(html).toContain('Vormittag')
    expect(html).toContain('Kein Verbrauch erfasst.')
    expect(html).not.toContain('Anwesenheit')
  })
})

describe('buildTrainingModulesPdfHtml', () => {
  it('listet Module und Abschlüsse', () => {
    const html = buildTrainingModulesPdfHtml({
      modules: [
        { name: 'Erste Hilfe', kind: 'extern', active: true, completionCount: 2 },
        { name: 'Platzhalter A', kind: 'intern', active: false, completionCount: 0 },
      ],
      completions: [
        { officerName: 'Müller (12)', moduleName: 'Erste Hilfe', kind: 'extern', completedOn: '2026-03-15' },
      ],
      now,
    })
    expect(html).toContain('Einsatztraining · Module')
    expect(html).toContain('Erste Hilfe')
    expect(html).toContain('Inaktiv')
    expect(html).toContain('Abschlüsse')
    expect(html).toContain('Mit Schießen')
    expect(html).toContain('Geltung')
    expect(html).toContain('15.03.2026')
    expect(html).toContain('Müller (12)')
  })
})

describe('buildOffenAnmeldungenPdfHtml', () => {
  it('listet Offene, Abschlüsse und Anmeldungen auf Deutsch', () => {
    const html = buildOffenAnmeldungenPdfHtml({
      moduleName: 'Internes ET',
      moduleType: 'pflicht_halbjahr',
      etClass: 'intern',
      appliesTo: 'polizei',
      periodLabel: '2. Halbjahr 2026',
      openOfficers: [{ officerName: 'Huber', dienstnummer: '34' }],
      completedOfficers: [{ officerName: 'Müller (12)', completedOn: '2026-09-01' }],
      offerings: [{
        date: '2026-09-20',
        note: 'Halle A',
        capacity: 8,
        registrations: [{ officerName: 'Huber' }],
      }],
      now,
    })
    expect(html).toContain('Offen / Anmeldungen · Internes ET')
    expect(html).toContain('Internes Einsatztraining')
    expect(html).toContain('2/Jahr')
    expect(html).toContain('Polizei')
    expect(html).toContain('2. Halbjahr 2026')
    expect(html).toContain('Offen laut Geltung')
    expect(html).toContain('Huber')
    expect(html).toContain('34')
    expect(html).toContain('Abgeschlossen')
    expect(html).toContain('01.09.2026')
    expect(html).toContain('Anmeldungen 20.09.2026')
    expect(html).toContain('Kapazität 8')
    expect(html).toContain('Halle A')
  })
})
