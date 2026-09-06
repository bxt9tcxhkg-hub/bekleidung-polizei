import { describe, expect, it } from 'vitest'
import {
  matchZuteilungOfficer,
  parseQuarterAblauf,
  parseZuteilungOrt,
  parseZuteilungText,
  planZuteilungImport,
} from './zuteilungImport'

const officers = [
  { id: 'f7', name: 'Fenkart Matthias', dienstnummer: '7' },
  { id: 'p18', name: 'Heinz Petternel', dienstnummer: '18' },
]

describe('Zuteilung-Import', () => {
  it('parst Quartalsablauf und Verwahrungsorte', () => {
    expect(parseQuarterAblauf('Q4/2024')).toEqual({ ok: true, value: '12/2024' })
    expect(parseQuarterAblauf('2. Quartal 2025')).toEqual({ ok: true, value: '06/2025' })
    expect(parseQuarterAblauf('03/2027')).toEqual({ ok: true, value: '03/2027' })
    expect(parseZuteilungOrt('Peter 1')).toBe('peter_1')
    expect(parseZuteilungOrt('Innendienst')).toBe('innendienst')
  })

  it('ordnet Offiziere nach Dienstnummer, sonst eindeutigem Namen', () => {
    expect(matchZuteilungOfficer({ dienstnummer: '07' }, officers)).toEqual({
      ok: true,
      officer: officers[0],
    })
    expect(matchZuteilungOfficer({ name: 'Heinz Petternel' }, officers).ok).toBe(true)
    expect(matchZuteilungOfficer({ name: 'Unbekannt', dienstnummer: '999' }, officers).ok).toBe(false)
  })

  it('legt Waffen, Spray und Schlagstock an und überspringt unbekannte Offiziere', () => {
    const parsed = parseZuteilungText(`name;dienstnummer;verwahrungsort;glock_17;glock_26;steyer_m9;pfefferspray_ablauf;schlagstock_eka
Fenkart Matthias;7;;G-100;;;Q4/2024;EKA-7
Unbekannt;999;;G-200;;;;
;;peter_1;;;;Q1/2025;
`)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const plan = planZuteilungImport({
      rows: parsed.file.rows,
      officers,
      existing: [],
    })
    expect(plan.inserts.map(i => i.label)).toEqual([
      'Glock 17 G-100',
      'Pfefferspray 12/2024',
      'Schlagstock EKA-7',
      'Pfefferspray 03/2025',
    ])
    expect(plan.inserts[0].payload.officer_id).toBe('f7')
    expect(plan.inserts[0].payload.marke).toBe('Glock 17')
    expect(plan.inserts[3].payload.officer_id).toBeNull()
    expect(plan.inserts[3].payload.verwahrungsort).toBe('peter_1')
    expect(plan.skipped.some(s => s.reason.includes('999'))).toBe(true)
  })

  it('überspringt bereits erfasste und ausgebuchte Stücke', () => {
    const plan = planZuteilungImport({
      rows: [{ name: 'Fenkart Matthias', dienstnummer: '7', glock_17: 'G-100' }],
      officers,
      existing: [{
        category: 'glock_17',
        officer_id: 'f7',
        verwahrungsort: null,
        waffennummer: 'G-100',
        marke: 'Glock 17',
        removed_at: '2026-01-01T00:00:00.000Z',
      }],
    })
    expect(plan.inserts).toHaveLength(0)
    expect(plan.skipped[0]?.reason).toMatch(/ausgebucht/)
  })
})
