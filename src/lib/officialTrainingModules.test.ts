import { describe, expect, it } from 'vitest'
import {
  OFFICIAL_TRAINING_MODULES,
  officialModuleKey,
  planOfficialModuleUpserts,
} from './officialTrainingModules'

describe('Offizielle ET-Module', () => {
  it('enthält genau die Namen aus dem Petternel-Verzeichnis', () => {
    expect(OFFICIAL_TRAINING_MODULES.map(m => `${m.name}|${m.kind}`)).toEqual([
      'Combat|extern',
      'Internes ET|intern',
      'Stockschulung TS-Einsatzstock|intern',
      'Erste Hilfe COMBAT|extern',
      'Szenarientraining|intern',
      'Fahrsicherheitstraining|extern',
    ])
  })

  it('plant Inserts und Reaktivierung idempotent nach Name+Art', () => {
    const plan = planOfficialModuleUpserts([
      { id: '1', name: 'Combat', kind: 'extern', active: true },
      { id: '2', name: 'Internes ET', kind: 'intern', active: false },
    ])
    expect(plan.alreadyActive.map(r => r.name)).toEqual(['Combat'])
    expect(plan.reactivations).toEqual([{ id: '2', name: 'Internes ET', kind: 'intern' }])
    expect(plan.inserts.map(m => m.name)).toEqual([
      'Stockschulung TS-Einsatzstock',
      'Erste Hilfe COMBAT',
      'Szenarientraining',
      'Fahrsicherheitstraining',
    ])
    expect(officialModuleKey('  Combat ', 'extern')).toBe('combat|extern')
  })
})
