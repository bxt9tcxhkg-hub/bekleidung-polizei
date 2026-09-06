import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_STATUS_LABELS,
  EINSATZTRAINING_CADENCE,
  SCHIESSEN_LABEL,
  TRAINING_APPLIES_TO,
  TRAINING_ET_CLASSES,
  TRAINING_KINDS,
  TRAINING_KIND_LABELS,
  TRAINING_MODULE_TYPES,
  appliesToLabel,
  canManageEinsatztraining,
  canSelfRegister,
  cadenceLabel,
  cadenceSummary,
  columnsFromEtClass,
  etClassCadenceLabel,
  etClassFromModule,
  currentHalfYear,
  formatCompletedOn,
  isAttendanceStatus,
  isDateInHalfYear,
  isModuleLockDbError,
  isStadtpolizeiMember,
  isTrainingAppliesTo,
  isTrainingEtClass,
  isTrainingKind,
  isTrainingModuleInUseDbError,
  isTrainingModuleType,
  officerMatchesAppliesTo,
  officerMatchesSearch,
  officersEligibleForModule,
  officersForAusschreibungPicker,
  trainingModuleDeleteConfirm,
  trainingModuleDeleteUserMessage,
  moduleAssignmentBlockReason,
  moduleAssignmentOptions,
  moduleLockUserMessage,
  officerHasCompletedModule,
  officersOpenForModule,
  emptyMunitionVerbrauchInput,
  formatMunitionVerbrauch,
  geschossenFromSession,
  munitionVerbrauchInputFromSession,
  periodLabel,
  planPoolMunitionAdjustments,
  poolMunitionOptionLabel,
  selfRegisterBlockReason,
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
  it('zeigt intern/extern/zusatz mit Owner-Jahressoll, ohne neue Dienstregel', () => {
    expect(EINSATZTRAINING_CADENCE.intern).toEqual({ times: 2, period: 'jahr' })
    expect(EINSATZTRAINING_CADENCE.extern).toEqual({ times: 4, period: 'jahr' })
    expect(cadenceLabel('intern')).toBe('2/Jahr')
    expect(cadenceLabel('extern')).toBe('4/Jahr')
    expect(etClassCadenceLabel('intern')).toBe('2/Jahr')
    expect(etClassCadenceLabel('extern')).toBe('4/Jahr')
    expect(etClassCadenceLabel('zusatz')).toBe('Zusatz')
    expect(cadenceSummary()).toBe('Intern 2/Jahr · Extern 4/Jahr · Zusatz')
    expect([...TRAINING_MODULE_TYPES]).toEqual(['pflicht_halbjahr', 'zusatz'])
    expect([...TRAINING_ET_CLASSES]).toEqual(['intern', 'extern', 'zusatz'])
    expect(isTrainingModuleType('pflicht_halbjahr')).toBe(true)
    expect(isTrainingModuleType('intern')).toBe(false)
    expect(isTrainingEtClass('intern')).toBe(true)
    expect(isTrainingEtClass('pflicht_halbjahr')).toBe(false)
    expect(etClassFromModule({ module_type: 'pflicht_halbjahr', kind: 'intern' })).toBe('intern')
    expect(etClassFromModule({ module_type: 'zusatz', kind: 'extern' })).toBe('extern')
    expect(etClassFromModule({ module_type: 'zusatz', kind: 'intern' })).toBe('zusatz')
    expect(columnsFromEtClass('intern')).toEqual({ kind: 'intern', module_type: 'pflicht_halbjahr' })
    expect(columnsFromEtClass('extern')).toEqual({ kind: 'extern', module_type: 'zusatz' })
    expect(columnsFromEtClass('zusatz')).toEqual({ kind: 'intern', module_type: 'zusatz' })
    expect(SCHIESSEN_LABEL).toBe('Mit Schießen')
    expect(SCHIESSEN_LABEL).not.toMatch(/Schießt/)
  })

  it('kennt intern/extern weiter als Spalte, ohne Genehmiger-Katalog', () => {
    expect([...TRAINING_KINDS]).toEqual(['intern', 'extern'])
    expect(isTrainingKind('intern')).toBe(true)
    expect(isTrainingKind('schießen')).toBe(false)
    expect(TRAINING_KIND_LABELS.intern).toBe('Intern')
    expect(isAttendanceStatus('present')).toBe(true)
    expect(isAttendanceStatus('maybe')).toBe(false)
    expect(ATTENDANCE_STATUS_LABELS.absent).toBe('Abwesend')
    expect([...TRAINING_APPLIES_TO]).toEqual(['polizei', 'parkaufsicht', 'alle'])
    expect(isTrainingAppliesTo('polizei')).toBe(true)
    expect(isTrainingAppliesTo('stadtpolizei')).toBe(false)
    expect(appliesToLabel('alle')).toBe('Alle')
  })
})

describe('validateTrainingModule', () => {
  it('verlangt Namen, Art und bei intern das Halbjahr; schreibt applies_to', () => {
    expect(validateTrainingModule({
      name: '  ', kind: 'intern', active: true, moduleType: 'zusatz', schiesst: false, periodYear: null, periodHalf: null,
    }).ok).toBe(false)
    expect(validateTrainingModule({
      name: 'Internes ET', etClass: 'intern', active: true, schiesst: true, periodYear: '', periodHalf: 1,
    }).ok).toBe(false)
    const intern = validateTrainingModule({
      name: '  Internes ET  ', etClass: 'intern', active: true, schiesst: true, periodYear: 2026, periodHalf: 2,
    })
    expect(intern).toEqual({
      ok: true,
      payload: {
        name: 'Internes ET',
        kind: 'intern',
        active: true,
        module_type: 'pflicht_halbjahr',
        schiesst: true,
        applies_to: 'polizei',
        period_year: 2026,
        period_half: 2,
      },
    })
    const extern = validateTrainingModule({
      name: 'Combat', etClass: 'extern', appliesTo: 'alle', active: false, schiesst: false, periodYear: 2026, periodHalf: 1,
    })
    expect(extern).toEqual({
      ok: true,
      payload: {
        name: 'Combat',
        kind: 'extern',
        active: false,
        module_type: 'zusatz',
        schiesst: false,
        applies_to: 'alle',
        period_year: null,
        period_half: null,
      },
    })
    const zusatz = validateTrainingModule({
      name: 'Szenarientraining', kind: 'intern', active: true, moduleType: 'zusatz', schiesst: false, periodYear: null, periodHalf: null,
    })
    expect(zusatz.ok).toBe(true)
    if (zusatz.ok) {
      expect(zusatz.payload.module_type).toBe('zusatz')
      expect(zusatz.payload.kind).toBe('intern')
      expect(zusatz.payload.applies_to).toBe('polizei')
    }
  })
})

describe('Modul löschen', () => {
  it('stellt die Bestätigung mit Modulnamen', () => {
    expect(trainingModuleDeleteConfirm('  Combat  ')).toBe('Modul «Combat» wirklich löschen?')
    expect(trainingModuleDeleteConfirm('')).toBe('Dieses Modul wirklich löschen?')
    expect(trainingModuleDeleteConfirm(null)).toBe('Dieses Modul wirklich löschen?')
  })

  it('erkennt Foreign-Key-Sperren ohne Soft-Delete', () => {
    expect(isTrainingModuleInUseDbError({ code: '23503', message: 'violates foreign key constraint' })).toBe(true)
    expect(isTrainingModuleInUseDbError({
      code: 'PGRST116',
      message: 'update or delete on table "einsatz_training_modules" violates foreign key constraint on einsatz_training_participations',
    })).toBe(true)
    expect(isTrainingModuleInUseDbError({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isTrainingModuleInUseDbError('duplicate key')).toBe(false)
  })

  it('liefert eine klare deutsche Fehlermeldung bei abhängigen Zeilen', () => {
    expect(trainingModuleDeleteUserMessage({ code: '23503' }, 'Combat')).toBe(
      'Modul «Combat» kann nicht gelöscht werden, weil noch Teilnahmen, Abschlüsse oder Trainingstage vorhanden sind.',
    )
    expect(trainingModuleDeleteUserMessage({ message: 'violates foreign key constraint' }, null)).toMatch(
      /Teilnahmen, Abschlüsse oder Trainingstage/,
    )
    expect(trainingModuleDeleteUserMessage({ code: '42501', message: 'permission denied' }, 'Combat')).toBe(
      'permission denied',
    )
    expect(trainingModuleDeleteUserMessage(null, 'Combat')).toBe('Löschen fehlgeschlagen.')
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

  it('weist nur Anwesende zu; Intervall ist optional', () => {
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

    const ok = validateParticipation({
      sessionKind: 'intern',
      officerId: 'o2',
      moduleId: 'm2',
      moduleKind: 'intern',
      intervalLabel: '  ',
      attendanceStatus: 'present',
      completions,
    })
    expect(ok).toEqual({
      ok: true,
      payload: { officer_id: 'o2', module_id: 'm2', interval_label: null },
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

  it('erlaubt Zusatz ohne Intervall und ohne intern/extern-Zwang', () => {
    const ok = validateParticipation({
      sessionKind: 'extern',
      officerId: 'o2',
      moduleId: 'm3',
      moduleKind: 'intern',
      intervalLabel: '',
      attendanceStatus: null,
      completions,
    })
    expect(ok).toEqual({
      ok: true,
      payload: { officer_id: 'o2', module_id: 'm3', interval_label: null },
    })
  })

  it('prüft Session-Datum, Modul und Pflicht-Fenster', () => {
    expect(validateSession({ kind: 'intern', sessionDate: '', note: '', moduleId: 'm1' }).ok).toBe(false)
    expect(validateSession({ kind: 'intern', sessionDate: '2026-09-06', note: '', moduleId: '' }).ok).toBe(false)
    expect(validateSession({
      kind: 'intern',
      sessionDate: '2026-03-01',
      note: '',
      moduleId: 'm1',
      module: { id: 'm1', module_type: 'pflicht_halbjahr', period_year: 2026, period_half: 2 },
    }).ok).toBe(false)
    expect(validateSession({
      kind: 'intern',
      sessionDate: '2026-09-06',
      note: '  Test  ',
      moduleId: 'm1',
      announced: true,
      capacity: '12',
      module: { id: 'm1', module_type: 'pflicht_halbjahr', period_year: 2026, period_half: 2 },
    })).toEqual({
      ok: true,
      payload: {
        kind: 'intern',
        session_date: '2026-09-06',
        note: 'Test',
        module_id: 'm1',
        capacity: 12,
        announced: true,
      },
    })
  })
})

describe('Offene Liste und Selbstanmeldung', () => {
  const pflicht = { id: 'm1', module_type: 'pflicht_halbjahr' as const, period_year: 2026, period_half: 2 as const }
  const officers = [
    { id: 'o1', name: 'Heinz', organisation: 'Stadtpolizei', active: true },
    { id: 'o2', name: 'Anna', organisation: 'Stadtpolizei', active: true },
    { id: 'o3', name: 'Park', organisation: 'Parkaufsicht', active: true },
    { id: 'o4', name: 'Inaktiv', organisation: 'Stadtpolizei', active: false },
  ]

  it('nimmt nur aktive Mitglieder gemäß Geltung ohne Abschluss', () => {
    expect(isStadtpolizeiMember({ organisation: 'Stadtpolizei' })).toBe(true)
    expect(isStadtpolizeiMember({ organisation: 'Parkaufsicht' })).toBe(false)
    expect(officerMatchesAppliesTo({ organisation: 'Stadtpolizei' }, 'polizei')).toBe(true)
    expect(officerMatchesAppliesTo({ organisation: 'Parkaufsicht' }, 'polizei')).toBe(false)
    expect(officerMatchesAppliesTo({ organisation: 'Parkaufsicht' }, 'parkaufsicht')).toBe(true)
    expect(officerMatchesAppliesTo({ organisation: 'Stadtpolizei' }, 'alle')).toBe(true)
    expect(officerMatchesAppliesTo({ organisation: 'Parkaufsicht' }, 'alle')).toBe(true)
    expect(officerMatchesAppliesTo({ organisation: '' }, 'polizei')).toBe(true)
    expect(officerMatchesAppliesTo({ organisation: '' }, 'parkaufsicht')).toBe(false)
    expect(currentHalfYear(new Date(2026, 8, 6))).toEqual({ year: 2026, half: 2 })
    expect(periodLabel(2026, 2)).toBe('2. Halbjahr 2026')
    expect(isDateInHalfYear('2026-09-06', 2026, 2)).toBe(true)
    expect(isDateInHalfYear('2026-03-01', 2026, 2)).toBe(false)

    const h1 = { id: 'm-h1', module_type: 'pflicht_halbjahr' as const, period_year: 2026, period_half: 1 as const }
    const open = officersOpenForModule({
      module: pflicht,
      officers,
      completions: [
        { officer_id: 'o1', module_id: 'm1', completed_on: '2026-09-01' },
        { officer_id: 'o2', module_id: 'm-h1', completed_on: '2026-03-01' },
      ],
    })
    expect(open.map(row => row.id)).toEqual(['o2'])
    expect(officerHasCompletedModule(completions, 'o1', 'm1', pflicht)).toBe(true)
    expect(officersOpenForModule({
      module: h1,
      officers,
      completions: [{ officer_id: 'o2', module_id: 'm-h1', completed_on: '2026-03-01' }],
    }).map(row => row.id)).toEqual(['o1'])
    expect(officersOpenForModule({
      module: { ...pflicht, applies_to: 'parkaufsicht' },
      officers,
      completions: [],
    }).map(row => row.id)).toEqual(['o3'])
    expect(officersOpenForModule({
      module: { ...pflicht, applies_to: 'alle' },
      officers,
      completions: [],
    }).map(row => row.id)).toEqual(['o1', 'o2', 'o3'])
  })

  it('nimmt Sonja Dolliner nicht in Polizei- oder Alle-Offizierslisten', () => {
    const sonja = {
      id: 'sonja',
      name: 'Sonja Dolliner',
      dienstnummer: '24',
      organisation: 'Stadtpolizei',
      active: true,
    }
    const roster = [...officers, sonja]
    expect(officerMatchesAppliesTo(sonja, 'polizei')).toBe(false)
    expect(officerMatchesAppliesTo(sonja, 'parkaufsicht')).toBe(false)
    expect(officerMatchesAppliesTo(sonja, 'alle')).toBe(false)
    expect(officersEligibleForModule({
      module: { applies_to: 'polizei' },
      officers: roster,
    }).map(row => row.id)).toEqual(['o1', 'o2'])
    expect(officersEligibleForModule({
      module: { applies_to: 'alle' },
      officers: roster,
    }).map(row => row.id)).toEqual(['o1', 'o2', 'o3'])
    expect(officersEligibleForModule({
      module: { applies_to: 'parkaufsicht' },
      officers: roster,
    }).map(row => row.id)).toEqual(['o3'])
    expect(selfRegisterBlockReason({
      officerId: 'sonja',
      moduleId: 'm1',
      module: { ...pflicht, applies_to: 'polizei' },
      officerOrganisation: 'Stadtpolizei',
      officerName: 'Sonja Dolliner',
      officerDienstnummer: '24',
      completions: [],
      announced: true,
      alreadyRegistered: false,
      isOwnRegistration: true,
      registrationCount: 0,
    })).toMatch(/Organisation/)
  })

  it('sperrt Selbstanmeldung nach Abschluss, ohne Ausschreibung oder bei voller Kapazität', () => {
    const base = {
      officerId: 'o2',
      moduleId: 'm1',
      moduleName: 'Internes ET',
      module: pflicht,
      completions,
      announced: true,
      capacity: 2,
      registrationCount: 0,
      alreadyRegistered: false,
      isOwnRegistration: true,
    }
    expect(canSelfRegister(base)).toBe(true)
    expect(selfRegisterBlockReason({ ...base, officerId: 'o1' })).toMatch(/abgeschlossen/)
    expect(selfRegisterBlockReason({ ...base, announced: false })).toMatch(/ausgeschrieben/)
    expect(selfRegisterBlockReason({ ...base, capacity: 1, registrationCount: 1 })).toMatch(/Plätze/)
    expect(selfRegisterBlockReason({ ...base, alreadyRegistered: true })).toMatch(/bereits angemeldet/)
    expect(selfRegisterBlockReason({ ...base, isOwnRegistration: false })).toMatch(/eigene Konto/)
    expect(selfRegisterBlockReason({
      ...base,
      officerOrganisation: 'Parkaufsicht',
      module: { ...pflicht, applies_to: 'polizei' },
    })).toMatch(/Organisation/)
    expect(selfRegisterBlockReason({
      ...base,
      officerOrganisation: 'Parkaufsicht',
      module: { ...pflicht, applies_to: 'alle' },
    })).toBeNull()
  })

  it('erlaubt Sachbearbeiter-Anmeldung anderer trotz isOwnRegistration false', () => {
    const manager = {
      officerId: 'o2',
      moduleId: 'm1',
      moduleName: 'Internes ET',
      module: pflicht,
      completions,
      announced: true,
      capacity: 2,
      registrationCount: 0,
      alreadyRegistered: false,
      isOwnRegistration: false,
      isManagerEnrollment: true,
    }
    expect(selfRegisterBlockReason(manager)).toBeNull()
    expect(canSelfRegister(manager)).toBe(true)
    expect(selfRegisterBlockReason({ ...manager, officerId: '' })).toMatch(/Person/)
    expect(selfRegisterBlockReason({ ...manager, officerId: 'o1' })).toMatch(/abgeschlossen/)
    expect(selfRegisterBlockReason({ ...manager, capacity: 1, registrationCount: 1 })).toMatch(/Plätze/)
    expect(selfRegisterBlockReason({ ...manager, alreadyRegistered: true })).toMatch(/bereits angemeldet/)
    expect(selfRegisterBlockReason({
      ...manager,
      officerOrganisation: 'Parkaufsicht',
      module: { ...pflicht, applies_to: 'polizei' },
    })).toMatch(/Organisation/)
    expect(selfRegisterBlockReason({
      ...manager,
      officerOrganisation: 'Parkaufsicht',
      module: { ...pflicht, applies_to: 'alle' },
    })).toBeNull()
  })

  it('filtert die Ausschreibungs-Suche nach Geltung, Aktiv und Name/Dienstnummer', () => {
    const registered = new Set(['o2'])
    expect(officersForAusschreibungPicker({
      module: { applies_to: 'polizei' },
      officers,
      registeredIds: registered,
    }).map(row => row.id)).toEqual(['o1'])
    expect(officersForAusschreibungPicker({
      module: { applies_to: 'alle' },
      officers,
      registeredIds: new Set(),
    }).map(row => row.id)).toEqual(['o1', 'o2', 'o3'])
    expect(officerMatchesSearch({ name: 'Max Muster', dienstnummer: '1234', username: 'max.muster' }, 'mus')).toBe(true)
    expect(officerMatchesSearch({ name: 'Max Muster', dienstnummer: '1234', username: 'max.muster' }, '1234')).toBe(true)
    expect(officerMatchesSearch({ name: 'Max Muster', dienstnummer: '1234', username: 'max.muster' }, 'anna')).toBe(false)
    expect(officerMatchesSearch({ name: 'Max Muster', dienstnummer: '1234', username: 'max.muster' }, '')).toBe(true)
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
