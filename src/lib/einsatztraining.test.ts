import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_STATUS_LABELS,
  EINSATZTRAINING_CADENCE,
  TRAINING_KINDS,
  TRAINING_KIND_LABELS,
  canManageEinsatztraining,
  cadenceLabel,
  cadenceSummary,
  formatCompletedOn,
  isAttendanceStatus,
  isModuleLockDbError,
  isTrainingKind,
  moduleAssignmentBlockReason,
  moduleAssignmentOptions,
  moduleLockUserMessage,
  officerHasCompletedModule,
  validateAttendance,
  validateParticipation,
  validateSession,
  validateTrainingModule,
} from './einsatztraining'

const completions = [
  { officer_id: 'o1', module_id: 'm1', completed_on: '2026-03-15' },
]

describe('Taktung', () => {
  it('liegt nur in der Konstante: intern 1× Halbjahr, extern 4× Jahr', () => {
    expect(EINSATZTRAINING_CADENCE.intern).toEqual({ times: 1, period: 'halbjahr' })
    expect(EINSATZTRAINING_CADENCE.extern).toEqual({ times: 4, period: 'jahr' })
    expect(cadenceLabel('intern')).toBe('1× pro Halbjahr')
    expect(cadenceLabel('extern')).toBe('4× pro Jahr')
    expect(cadenceSummary()).toBe('Internes ET: 1× pro Halbjahr. Externes ET: 4× pro Jahr.')
  })

  it('kennt nur intern und extern, ohne Genehmiger- oder Lehrplan-Katalog', () => {
    expect([...TRAINING_KINDS]).toEqual(['intern', 'extern'])
    expect(isTrainingKind('intern')).toBe(true)
    expect(isTrainingKind('schießen')).toBe(false)
    expect(TRAINING_KIND_LABELS.intern).toBe('Intern')
    expect(isAttendanceStatus('present')).toBe(true)
    expect(isAttendanceStatus('maybe')).toBe(false)
    expect(ATTENDANCE_STATUS_LABELS.absent).toBe('Abwesend')
  })
})

describe('validateTrainingModule', () => {
  it('verlangt Namen und Art, ohne vorgegebene Modulnamen', () => {
    expect(validateTrainingModule({ name: '  ', kind: 'intern', active: true }).ok).toBe(false)
    expect(validateTrainingModule({ name: 'Platzhalter A', kind: 'xyz', active: true }).ok).toBe(false)
    const ok = validateTrainingModule({ name: '  Platzhalter A  ', kind: 'intern', active: false })
    expect(ok).toEqual({
      ok: true,
      payload: { name: 'Platzhalter A', kind: 'intern', active: false },
    })
  })
})

describe('Modul-Sperre', () => {
  it('erkennt abgeschlossene Module je Person', () => {
    expect(officerHasCompletedModule(completions, 'o1', 'm1')).toBe(true)
    expect(officerHasCompletedModule(completions, 'o1', 'm2')).toBe(false)
    expect(officerHasCompletedModule(completions, 'o2', 'm1')).toBe(false)
    expect(officerHasCompletedModule(completions, '', 'm1')).toBe(false)
  })

  it('liefert eine Begründung mit Datum', () => {
    expect(moduleAssignmentBlockReason({
      officerId: 'o1',
      moduleId: 'm1',
      moduleName: 'Platzhalter A',
      completions,
    })).toBe(
      'Modul «Platzhalter A» bereits abgeschlossen – erneute Zuweisung nicht möglich. Abgeschlossen am 15.03.2026.',
    )
    expect(moduleAssignmentBlockReason({
      officerId: 'o1',
      moduleId: 'm2',
      moduleName: 'Platzhalter B',
      completions,
    })).toBeNull()
    expect(moduleLockUserMessage(null)).toBe(
      'Dieses Modul ist bereits abgeschlossen – erneute Zuweisung nicht möglich.',
    )
    expect(formatCompletedOn('2026-09-06')).toBe('06.09.2026')
  })

  it('sperrt intern und extern gleich, listet blockierte Optionen mit Grund', () => {
    const modules = [
      { id: 'm1', name: 'Platzhalter A', kind: 'intern' as const, active: true },
      { id: 'm2', name: 'Platzhalter B', kind: 'intern' as const, active: true },
      { id: 'm3', name: 'Extern X', kind: 'extern' as const, active: true },
      { id: 'm4', name: 'Inaktiv', kind: 'intern' as const, active: false },
    ]
    const intern = moduleAssignmentOptions({
      officerId: 'o1',
      kind: 'intern',
      modules,
      completions,
    })
    expect(intern.map(row => row.module.id)).toEqual(['m1', 'm2'])
    expect(intern[0]?.blocked).toBe(true)
    expect(intern[0]?.reason).toMatch(/bereits abgeschlossen/)
    expect(intern[1]?.blocked).toBe(false)

    const extern = moduleAssignmentOptions({
      officerId: 'o1',
      kind: 'extern',
      modules,
      completions: [{ officer_id: 'o1', module_id: 'm3', completed_on: '2026-01-10' }],
    })
    expect(extern).toHaveLength(1)
    expect(extern[0]?.blocked).toBe(true)
    expect(extern[0]?.reason).toMatch(/Extern X/)
  })

  it('erkennt die Datenbank-Fehlermeldung der Sperre', () => {
    expect(isModuleLockDbError('Modul bereits abgeschlossen')).toBe(true)
    expect(isModuleLockDbError('duplicate key')).toBe(false)
  })
})

describe('validateAttendance / validateParticipation / validateSession', () => {
  it('nimmt Anwesenheit nur mit Person und Status', () => {
    expect(validateAttendance({ sessionKind: 'intern', officerId: '', status: 'present' }).ok).toBe(false)
    expect(validateAttendance({ sessionKind: 'intern', officerId: 'o1', status: 'maybe' }).ok).toBe(false)
    expect(validateAttendance({ sessionKind: 'intern', officerId: 'o1', status: 'absent' })).toEqual({
      ok: true,
      payload: { officer_id: 'o1', status: 'absent' },
    })
  })

  it('weist intern nur Anwesende zu und verlangt Intervall', () => {
    const absent = validateParticipation({
      sessionKind: 'intern',
      officerId: 'o2',
      moduleId: 'm2',
      moduleKind: 'intern',
      intervalLabel: '1',
      attendanceStatus: 'absent',
      completions,
    })
    expect(absent.ok).toBe(false)
    if (!absent.ok) expect(absent.error).toMatch(/anwesend/)

    const noInterval = validateParticipation({
      sessionKind: 'intern',
      officerId: 'o2',
      moduleId: 'm2',
      moduleKind: 'intern',
      intervalLabel: '  ',
      attendanceStatus: 'present',
      completions,
    })
    expect(noInterval.ok).toBe(false)

    const ok = validateParticipation({
      sessionKind: 'intern',
      officerId: 'o2',
      moduleId: 'm2',
      moduleKind: 'intern',
      intervalLabel: '  2  ',
      attendanceStatus: 'present',
      completions,
    })
    expect(ok).toEqual({
      ok: true,
      payload: { officer_id: 'o2', module_id: 'm2', interval_label: '2' },
    })
  })

  it('blockiert erneute Zuweisung desselben Moduls', () => {
    const locked = validateParticipation({
      sessionKind: 'intern',
      officerId: 'o1',
      moduleId: 'm1',
      moduleKind: 'intern',
      intervalLabel: '1',
      attendanceStatus: 'present',
      completions,
      moduleName: 'Platzhalter A',
    })
    expect(locked.ok).toBe(false)
    if (!locked.ok) expect(locked.error).toMatch(/bereits abgeschlossen/)
  })

  it('erlaubt externes ET ohne Intervall, aber nicht mit internem Modul', () => {
    const mismatch = validateParticipation({
      sessionKind: 'extern',
      officerId: 'o2',
      moduleId: 'm2',
      moduleKind: 'intern',
      intervalLabel: '',
      attendanceStatus: null,
      completions,
    })
    expect(mismatch.ok).toBe(false)

    const ok = validateParticipation({
      sessionKind: 'extern',
      officerId: 'o2',
      moduleId: 'm3',
      moduleKind: 'extern',
      intervalLabel: '',
      attendanceStatus: null,
      completions,
    })
    expect(ok).toEqual({
      ok: true,
      payload: { officer_id: 'o2', module_id: 'm3', interval_label: null },
    })
  })

  it('prüft das Session-Datum', () => {
    expect(validateSession({ kind: 'intern', sessionDate: '', note: '' }).ok).toBe(false)
    expect(validateSession({ kind: 'intern', sessionDate: '06.09.2026', note: '' }).ok).toBe(false)
    expect(validateSession({ kind: 'intern', sessionDate: '2026-09-06', note: '  Test  ' })).toEqual({
      ok: true,
      payload: { kind: 'intern', session_date: '2026-09-06', note: 'Test' },
    })
  })
})

describe('canManageEinsatztraining', () => {
  it('erlaubt globalen Admin immer', () => {
    expect(canManageEinsatztraining({ isStrictAdmin: true, rows: [] })).toBe(true)
    expect(canManageEinsatztraining({ isStrictAdmin: true, rows: null })).toBe(true)
  })

  it('erlaubt einsatz_mt Sachbearbeiter und Admin', () => {
    expect(canManageEinsatztraining({
      isStrictAdmin: false,
      rows: [{ area: 'einsatz_mt', roles: ['sachbearbeiter'] }],
    })).toBe(true)
    expect(canManageEinsatztraining({
      isStrictAdmin: false,
      rows: [{ area: 'einsatz_mt', roles: ['admin'] }],
    })).toBe(true)
  })

  it('verbietet reines Leserecht und fehlende Tabelle', () => {
    expect(canManageEinsatztraining({
      isStrictAdmin: false,
      rows: [{ area: 'einsatz_mt', roles: ['user'] }],
    })).toBe(false)
    expect(canManageEinsatztraining({ isStrictAdmin: false, rows: null })).toBe(false)
    expect(canManageEinsatztraining({
      isStrictAdmin: false,
      rows: [{ area: 'bekleidung', roles: ['sachbearbeiter'] }],
    })).toBe(false)
  })
})
