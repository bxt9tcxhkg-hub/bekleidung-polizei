import { describe, expect, it } from 'vitest'
import {
  canManageSchulungen,
  canSelfRegisterSchulung,
  officersCompletedForModule,
  officersForSchulungPicker,
  officersOpenForModule,
  selfRegisterBlockReasonSchulung,
  validateSchulungModuleName,
  validateSchulungSession,
} from './schulungen'

describe('canManageSchulungen', () => {
  it('erlaubt globalen Admin und Genehmiger immer', () => {
    expect(canManageSchulungen({ isStrictAdmin: true, rows: null })).toBe(true)
    expect(canManageSchulungen({ isStrictAdmin: false, isGenehmiger: true, rows: null })).toBe(true)
  })
  it('erlaubt schulungen-Sachbearbeiter/Admin', () => {
    expect(canManageSchulungen({ isStrictAdmin: false, rows: [{ area: 'schulungen', roles: ['sachbearbeiter'] }] })).toBe(true)
    expect(canManageSchulungen({ isStrictAdmin: false, rows: [{ area: 'schulungen', roles: ['admin'] }] })).toBe(true)
  })
  it('verbietet reines Leserecht, fehlende Tabelle und andere Bereiche', () => {
    expect(canManageSchulungen({ isStrictAdmin: false, rows: [{ area: 'schulungen', roles: ['user'] }] })).toBe(false)
    expect(canManageSchulungen({ isStrictAdmin: false, rows: null })).toBe(false)
    expect(canManageSchulungen({ isStrictAdmin: false, rows: [{ area: 'einsatz_mt', roles: ['sachbearbeiter'] }] })).toBe(false)
  })
})

const officers = [
  { id: 'a', name: 'Anna', active: true },
  { id: 'b', name: 'Bert', active: true },
  { id: 'c', name: 'Clara', active: false },
]

describe('officersOpenForModule / officersCompletedForModule', () => {
  const completions = [{ officer_id: 'a', module_id: 'mod1' }]
  it('trennt offen von abgeschlossen', () => {
    expect(officersOpenForModule({ moduleId: 'mod1', officers, completions }).map(o => o.id)).toEqual(['b'])
    expect(officersCompletedForModule({ moduleId: 'mod1', officers, completions }).map(o => o.id)).toEqual(['a'])
  })
  it('ignoriert inaktive Personen', () => {
    expect(officersOpenForModule({ moduleId: 'mod1', officers, completions }).some(o => o.id === 'c')).toBe(false)
  })
})

describe('officersForSchulungPicker', () => {
  it('filtert bereits registrierte Personen heraus', () => {
    const result = officersForSchulungPicker({ officers, registeredIds: new Set(['a']) })
    expect(result.map(o => o.id)).toEqual(['b'])
  })
})

describe('selfRegisterBlockReasonSchulung / canSelfRegisterSchulung', () => {
  const base = {
    officerId: 'a',
    moduleId: 'mod1',
    completions: [] as { officer_id: string; module_id: string }[],
    announced: true,
    capacity: null as number | null,
    registrationCount: 0,
    alreadyRegistered: false,
    isOwnRegistration: true,
  }

  it('erlaubt eine gültige Selbstanmeldung', () => {
    expect(selfRegisterBlockReasonSchulung(base)).toBeNull()
    expect(canSelfRegisterSchulung(base)).toBe(true)
  })
  it('blockiert bei bereits erfolgter Anmeldung', () => {
    expect(selfRegisterBlockReasonSchulung({ ...base, alreadyRegistered: true })).toBeTruthy()
  })
  it('blockiert bei nicht ausgeschriebenem Termin', () => {
    expect(selfRegisterBlockReasonSchulung({ ...base, announced: false })).toBeTruthy()
  })
  it('blockiert bei bereits abgeschlossenem Modul', () => {
    expect(selfRegisterBlockReasonSchulung({ ...base, completions: [{ officer_id: 'a', module_id: 'mod1' }] })).toBeTruthy()
  })
  it('blockiert bei voller Kapazität', () => {
    expect(selfRegisterBlockReasonSchulung({ ...base, capacity: 1, registrationCount: 1 })).toBeTruthy()
  })
  it('blockiert Fremdanmeldung ohne Manager-Rechte', () => {
    expect(selfRegisterBlockReasonSchulung({ ...base, isOwnRegistration: false })).toBeTruthy()
  })
  it('erlaubt Fremdanmeldung durch den Sachbearbeiter', () => {
    expect(selfRegisterBlockReasonSchulung({ ...base, isOwnRegistration: false, isManagerEnrollment: true })).toBeNull()
  })
})

describe('validateSchulungModuleName', () => {
  it('verlangt einen nicht-leeren Namen', () => {
    expect(validateSchulungModuleName('')).toBeTruthy()
    expect(validateSchulungModuleName('   ')).toBeTruthy()
  })
  it('erlaubt einen normalen Namen', () => {
    expect(validateSchulungModuleName('Erste Hilfe')).toBeNull()
  })
  it('verbietet zu lange Namen', () => {
    expect(validateSchulungModuleName('a'.repeat(161))).toBeTruthy()
    expect(validateSchulungModuleName('a'.repeat(160))).toBeNull()
  })
})

describe('validateSchulungSession', () => {
  const base = { moduleId: 'mod1', sessionDate: '2026-05-01', note: '', capacity: '', announced: true }
  it('akzeptiert eine gültige Eingabe', () => {
    const result = validateSchulungSession(base)
    expect(result.ok).toBe(true)
  })
  it('verlangt Modul und Datum', () => {
    expect(validateSchulungSession({ ...base, moduleId: '' }).ok).toBe(false)
    expect(validateSchulungSession({ ...base, sessionDate: '' }).ok).toBe(false)
  })
  it('verlangt eine positive ganzzahlige Kapazität, falls angegeben', () => {
    expect(validateSchulungSession({ ...base, capacity: '0' }).ok).toBe(false)
    expect(validateSchulungSession({ ...base, capacity: '-1' }).ok).toBe(false)
    expect(validateSchulungSession({ ...base, capacity: 'abc' }).ok).toBe(false)
    expect(validateSchulungSession({ ...base, capacity: '5' }).ok).toBe(true)
  })
})
