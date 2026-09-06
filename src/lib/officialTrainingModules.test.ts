import { describe, expect, it } from 'vitest'
import {
  OFFICIAL_TRAINING_MODULES,
  officialModuleKey,
  planOfficialModuleUpserts,
} from './officialTrainingModules'

describe('Offizielle ET-Module', () => {
  it('ordnet Verzeichnis-Namen Pflicht vs Zusatz zu, ohne neue Namen', () => {
    expect(OFFICIAL_TRAINING_MODULES.map(m => `${m.name}|${m.moduleType}|${m.kind}`)).toEqual([
      'Internes ET|pflicht_halbjahr|intern',
      'Combat|zusatz|extern',
      'Stockschulung TS-Einsatzstock|zusatz|intern',
      'Erste Hilfe COMBAT|zusatz|extern',
      'Szenarientraining|zusatz|intern',
      'Fahrsicherheitstraining|zusatz|extern',
    ])
    expect(OFFICIAL_TRAINING_MODULES.every(m => m.schiesst === false)).toBe(true)
  })

  it('plant Inserts und Reaktivierung idempotent nach Name und Typ', () => {
    const now = new Date(2026, 8, 6)
    const plan = planOfficialModuleUpserts([
      { id: '1', name: 'Combat', kind: 'extern', active: true, module_type: 'zusatz' },
      {
        id: '2',
        name: 'Internes ET',
        kind: 'intern',
        active: false,
        module_type: 'pflicht_halbjahr',
        period_year: 2026,
        period_half: 2,
      },
    ], now)
    expect(plan.alreadyActive.map(r => r.name)).toEqual(['Combat'])
    expect(plan.reactivations).toEqual([
      { id: '2', name: 'Internes ET', moduleType: 'pflicht_halbjahr', kind: 'intern' },
    ])
    expect(plan.inserts.map(m => m.name)).toEqual([
      'Stockschulung TS-Einsatzstock',
      'Erste Hilfe COMBAT',
      'Szenarientraining',
      'Fahrsicherheitstraining',
    ])
    expect(officialModuleKey('  Combat ', 'zusatz')).toBe('combat|zusatz')
    expect(officialModuleKey('Internes ET', 'pflicht_halbjahr', { year: 2026, half: 2 }))
      .toBe('internes et|pflicht_halbjahr|2026|2')
  })

  it('legt Pflicht-ET für ein neues Halbjahr zusätzlich an', () => {
    const plan = planOfficialModuleUpserts([
      {
        id: '2',
        name: 'Internes ET',
        kind: 'intern',
        active: true,
        module_type: 'pflicht_halbjahr',
        period_year: 2026,
        period_half: 1,
      },
    ], new Date(2026, 8, 6))
    expect(plan.inserts.some(row => row.name === 'Internes ET' && row.period_year === 2026 && row.period_half === 2)).toBe(true)
  })
})
