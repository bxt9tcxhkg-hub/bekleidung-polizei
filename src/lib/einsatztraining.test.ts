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
  emptyMunitionVerbrauchInput,
  formatMunitionVerbrauch,
  geschossenFromSession,
  munitionVerbrauchInputFromSession,
  planPoolMunitionAdjustments,
  poolMunitionOptionLabel,
  validateAttendance,
  validateGeschossenMunition,
  validateMunitionVerbrauch,
  validateParticipation,
  validateSession,
  validateTrainingModule,
  withMunitionRecordedBy,
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

describe('Munitionsverbrauch', () => {
  it('erlaubt leeren Verbrauch ohne Katalogfelder', () => {
    expect(validateMunitionVerbrauch(emptyMunitionVerbrauchInput())).toEqual({
      ok: true,
      payload: {
        munition_anzahl: null,
        munition_marke: null,
        munition_kaliber: null,
        munition_art: null,
        munition_pool_id: null,
      },
    })
  })

  it('verlangt Anzahl, wenn Marke/Kaliber/Art oder Pool gesetzt sind', () => {
    const missing = validateMunitionVerbrauch({
      ...emptyMunitionVerbrauchInput(),
      marke: 'Geco',
    })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error).toMatch(/Anzahl/)
  })

  it('nimmt Anzahl und optionale Felder der bestehenden Munitions-Spalten', () => {
    const ok = validateMunitionVerbrauch({
      anzahl: ' 50 ',
      marke: ' Geco ',
      kaliber: '9x19',
      art: 'Übung',
      poolItemId: 'pool-1',
    })
    expect(ok).toEqual({
      ok: true,
      payload: {
        munition_anzahl: 50,
        munition_marke: 'Geco',
        munition_kaliber: '9x19',
        munition_art: 'Übung',
        munition_pool_id: 'pool-1',
      },
    })
    expect(validateMunitionVerbrauch({
      ...emptyMunitionVerbrauchInput(),
      anzahl: '-1',
    }).ok).toBe(false)
    expect(validateMunitionVerbrauch({
      ...emptyMunitionVerbrauchInput(),
      anzahl: '1.5',
    }).ok).toBe(false)
  })

  it('setzt recorded-Felder nur bei vorhandenem Verbrauch', () => {
    const filled = withMunitionRecordedBy({
      munition_anzahl: 10,
      munition_marke: null,
      munition_kaliber: null,
      munition_art: null,
      munition_pool_id: null,
    }, 'u1', '2026-09-06T12:00:00.000Z')
    expect(filled.munition_recorded_by).toBe('u1')
    expect(filled.munition_recorded_at).toBe('2026-09-06T12:00:00.000Z')

    const cleared = withMunitionRecordedBy({
      munition_anzahl: null,
      munition_marke: null,
      munition_kaliber: null,
      munition_art: null,
      munition_pool_id: null,
    }, 'u1', '2026-09-06T12:00:00.000Z')
    expect(cleared.munition_recorded_at).toBeNull()
    expect(cleared.munition_recorded_by).toBeNull()
  })

  it('formatiert den Verbrauch und liest das Formular aus der Session', () => {
    expect(formatMunitionVerbrauch({ munition_anzahl: null })).toBe('')
    expect(formatMunitionVerbrauch({ munition_anzahl: 0 })).toBe('nicht geschossen')
    expect(formatMunitionVerbrauch({
      munition_anzahl: 40,
      munition_marke: 'Geco',
      munition_kaliber: '9x19',
      munition_art: 'Übung',
    })).toBe('40 · Geco · 9x19 · Übung')
    expect(munitionVerbrauchInputFromSession({
      munition_anzahl: 12,
      munition_marke: 'Geco',
      munition_kaliber: null,
      munition_art: null,
      munition_pool_id: 'p1',
    })).toEqual({
      anzahl: '12',
      marke: 'Geco',
      kaliber: '',
      art: '',
      poolItemId: 'p1',
    })
    expect(poolMunitionOptionLabel({
      marke: 'Geco',
      typ: '9mm',
      art: 'Übung',
      anzahl: 200,
      locationLabel: 'Lager',
    })).toBe('Geco · 9mm · Übung · Menge 200 · Lager')
  })

  it('verringert Pool-Bestand nur bei gewählter Zeile und verhindert Unterbestand', () => {
    const first = planPoolMunitionAdjustments({
      previous: { poolId: null, anzahl: null },
      next: { poolId: 'p1', anzahl: 30 },
      stocks: { p1: 200 },
    })
    expect(first).toEqual({ ok: true, payload: { adjustments: [{ poolId: 'p1', nextAnzahl: 170 }] } })

    const update = planPoolMunitionAdjustments({
      previous: { poolId: 'p1', anzahl: 30 },
      next: { poolId: 'p1', anzahl: 50 },
      stocks: { p1: 170 },
    })
    expect(update).toEqual({ ok: true, payload: { adjustments: [{ poolId: 'p1', nextAnzahl: 150 }] } })

    const tooMuch = planPoolMunitionAdjustments({
      previous: { poolId: null, anzahl: null },
      next: { poolId: 'p1', anzahl: 80 },
      stocks: { p1: 50 },
    })
    expect(tooMuch.ok).toBe(false)

    const noMenge = planPoolMunitionAdjustments({
      previous: { poolId: null, anzahl: null },
      next: { poolId: 'p1', anzahl: 10 },
      stocks: { p1: null },
    })
    expect(noMenge.ok).toBe(false)

    const recordOnly = planPoolMunitionAdjustments({
      previous: { poolId: null, anzahl: null },
      next: { poolId: null, anzahl: 40 },
      stocks: { p1: 200 },
    })
    expect(recordOnly).toEqual({ ok: true, payload: { adjustments: [] } })
  })

  it('stellt den Bestand zurück, wenn Verbrauch oder Pool-Zeile wechselt', () => {
    const cleared = planPoolMunitionAdjustments({
      previous: { poolId: 'p1', anzahl: 20 },
      next: { poolId: null, anzahl: null },
      stocks: { p1: 180 },
    })
    expect(cleared).toEqual({ ok: true, payload: { adjustments: [{ poolId: 'p1', nextAnzahl: 200 }] } })

    const switched = planPoolMunitionAdjustments({
      previous: { poolId: 'p1', anzahl: 20 },
      next: { poolId: 'p2', anzahl: 10 },
      stocks: { p1: 180, p2: 40 },
    })
    expect(switched.ok).toBe(true)
    if (switched.ok) {
      expect(switched.payload.adjustments).toEqual(expect.arrayContaining([
        { poolId: 'p1', nextAnzahl: 200 },
        { poolId: 'p2', nextAnzahl: 30 },
      ]))
    }
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

describe('Geschossen-Nachfrage', () => {
  it('leitet den Stand aus der Session ab', () => {
    expect(geschossenFromSession({})).toBe('')
    expect(geschossenFromSession({ munition_anzahl: 0, munition_pool_id: null })).toBe('no')
    expect(geschossenFromSession({ munition_anzahl: 12, munition_pool_id: 'p1' })).toBe('yes')
  })

  it('verlangt eine Antwort und bei Ja eingebuchte Munition plus Menge', () => {
    const empty = emptyMunitionVerbrauchInput()
    expect(validateGeschossenMunition({ geschossen: '', form: empty }).ok).toBe(false)
    expect(validateGeschossenMunition({ geschossen: 'no', form: empty })).toEqual({
      ok: true,
      payload: {
        munition_anzahl: 0,
        munition_marke: null,
        munition_kaliber: null,
        munition_art: null,
        munition_pool_id: null,
      },
    })
    expect(validateGeschossenMunition({
      geschossen: 'yes',
      form: { ...empty, anzahl: '20' },
    }).ok).toBe(false)
    const ok = validateGeschossenMunition({
      geschossen: 'yes',
      form: { ...empty, anzahl: '20', poolItemId: 'p1', marke: 'Geco' },
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.payload.munition_anzahl).toBe(20)
      expect(ok.payload.munition_pool_id).toBe('p1')
    }
  })
})
