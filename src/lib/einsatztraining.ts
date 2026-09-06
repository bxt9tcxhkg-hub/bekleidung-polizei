/**
 * Einsatztraining: Owner-Fachlogik 2026-09-06 (Muhammet).
 *
 * UI-Art intern / extern / zusatz, abgeleitet aus den bestehenden Spalten
 * `module_type` (pflicht_halbjahr | zusatz) und `kind` (intern | extern).
 * Taktung: Internes ET 2 Module/Jahr, Externes ET 4 Module/Jahr, Zusatz ohne Soll.
 * Geltung (`applies_to`): Polizei | Parkaufsicht | Alle — setzt der Sachbearbeiter.
 * Schießen-Flag bleibt `schiesst`; UI-Text immer «Mit Schießen».
 * Abschluss sperrt erneute Zuweisung und Anmeldung.
 */

import { parseEinsatzMtRole, rolesForArea } from './portalEntitlements'
import { ET_ROSTER_ORGANISATION, PARKAUFSICHT_ORGANISATION } from './usersSeed'

export const TRAINING_KINDS = ['intern', 'extern'] as const
export type TrainingKind = (typeof TRAINING_KINDS)[number]

export const TRAINING_KIND_LABELS: Record<TrainingKind, string> = {
  intern: 'Intern',
  extern: 'Extern',
}

export const TRAINING_MODULE_TYPES = ['pflicht_halbjahr', 'zusatz'] as const
export type TrainingModuleType = (typeof TRAINING_MODULE_TYPES)[number]

export const TRAINING_MODULE_TYPE_LABELS: Record<TrainingModuleType, string> = {
  pflicht_halbjahr: 'Internes Einsatztraining',
  zusatz: 'Zusatzmodul',
}

export const TRAINING_ET_CLASSES = ['intern', 'extern', 'zusatz'] as const
export type TrainingEtClass = (typeof TRAINING_ET_CLASSES)[number]

export const TRAINING_ET_CLASS_LABELS: Record<TrainingEtClass, string> = {
  intern: 'Internes Einsatztraining',
  extern: 'Externes Einsatztraining',
  zusatz: 'Zusatzmodul',
}

export const TRAINING_APPLIES_TO = ['polizei', 'parkaufsicht', 'alle'] as const
export type TrainingAppliesTo = (typeof TRAINING_APPLIES_TO)[number]

export const TRAINING_APPLIES_TO_LABELS: Record<TrainingAppliesTo, string> = {
  polizei: 'Polizei',
  parkaufsicht: 'Parkaufsicht',
  alle: 'Alle',
}

export const SCHIESSEN_LABEL = 'Mit Schießen'

export const TRAINING_PERIOD_HALVES = [1, 2] as const
export type TrainingPeriodHalf = (typeof TRAINING_PERIOD_HALVES)[number]

export const ATTENDANCE_STATUSES = ['present', 'absent'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Anwesend',
  absent: 'Abwesend',
}

/** Owner: intern 2 Module/Jahr, extern 4 Module/Jahr. Keine neue Dienstregel. */
export const EINSATZTRAINING_CADENCE = {
  intern: { times: 2, period: 'jahr' },
  extern: { times: 4, period: 'jahr' },
} as const

export type CadencePeriod = (typeof EINSATZTRAINING_CADENCE)[TrainingKind]['period']

export function isTrainingKind(value: string): value is TrainingKind {
  return (TRAINING_KINDS as readonly string[]).includes(value)
}

export function isTrainingModuleType(value: string): value is TrainingModuleType {
  return (TRAINING_MODULE_TYPES as readonly string[]).includes(value)
}

export function isTrainingEtClass(value: string): value is TrainingEtClass {
  return (TRAINING_ET_CLASSES as readonly string[]).includes(value)
}

export function isTrainingAppliesTo(value: string): value is TrainingAppliesTo {
  return (TRAINING_APPLIES_TO as readonly string[]).includes(value)
}

export function isTrainingPeriodHalf(value: number): value is TrainingPeriodHalf {
  return value === 1 || value === 2
}

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value)
}

export function cadenceLabel(kind: TrainingKind): string {
  const cadence = EINSATZTRAINING_CADENCE[kind]
  return `${cadence.times}/Jahr`
}

export function etClassCadenceLabel(etClass: TrainingEtClass): string {
  if (etClass === 'zusatz') return 'Zusatz'
  return cadenceLabel(etClass)
}

export function cadenceSummary(): string {
  return fachlogikSummary()
}

export function fachlogikSummary(): string {
  return 'Intern 2/Jahr · Extern 4/Jahr · Zusatz'
}

export function etClassFromModule(module: {
  kind?: string | null
  module_type?: string | null
}): TrainingEtClass {
  if (module.module_type === 'pflicht_halbjahr') return 'intern'
  if (module.kind === 'extern') return 'extern'
  return 'zusatz'
}

export function columnsFromEtClass(etClass: TrainingEtClass): {
  kind: TrainingKind
  module_type: TrainingModuleType
} {
  if (etClass === 'intern') return { kind: 'intern', module_type: 'pflicht_halbjahr' }
  if (etClass === 'extern') return { kind: 'extern', module_type: 'zusatz' }
  return { kind: 'intern', module_type: 'zusatz' }
}

export function normalizeAppliesTo(value: string | null | undefined): TrainingAppliesTo {
  return isTrainingAppliesTo(value ?? '') ? value as TrainingAppliesTo : 'polizei'
}

export function currentHalfYear(now: Date = new Date()): { year: number; half: TrainingPeriodHalf } {
  const year = now.getFullYear()
  const half: TrainingPeriodHalf = now.getMonth() < 6 ? 1 : 2
  return { year, half }
}

export function halfYearBounds(year: number, half: TrainingPeriodHalf): { from: string; to: string } {
  return half === 1
    ? { from: `${year}-01-01`, to: `${year}-06-30` }
    : { from: `${year}-07-01`, to: `${year}-12-31` }
}

export function periodLabel(year: number, half: TrainingPeriodHalf): string {
  return `${half}. Halbjahr ${year}`
}

export function isDateInHalfYear(date: string, year: number, half: TrainingPeriodHalf): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const bounds = halfYearBounds(year, half)
  return date >= bounds.from && date <= bounds.to
}

export function defaultKindForModuleType(moduleType: TrainingModuleType): TrainingKind {
  return moduleType === 'pflicht_halbjahr' ? 'intern' : 'intern'
}

export function isStadtpolizeiMember(officer: { organisation?: string | null }): boolean {
  const org = (officer.organisation ?? ET_ROSTER_ORGANISATION).trim()
  return org === ET_ROSTER_ORGANISATION
}

export function isParkaufsichtMember(officer: { organisation?: string | null }): boolean {
  return (officer.organisation ?? '').trim() === PARKAUFSICHT_ORGANISATION
}

export function canManageEinsatztraining(input: {
  isStrictAdmin: boolean
  rows: readonly { area: string; roles: string[] }[] | null
}): boolean {
  if (input.isStrictAdmin) return true
  if (input.rows === null) return false
  const role = parseEinsatzMtRole(rolesForArea(input.rows, 'einsatz_mt'))
  return role === 'sachbearbeiter' || role === 'admin'
}

export type TrainingModuleInput = {
  name: string
  kind?: string
  active: boolean
  moduleType?: string
  etClass?: string
  schiesst: boolean
  appliesTo?: string
  periodYear: string | number | null
  periodHalf: string | number | null
}

export type TrainingModulePayload = {
  name: string
  kind: TrainingKind
  active: boolean
  module_type: TrainingModuleType
  schiesst: boolean
  applies_to: TrainingAppliesTo
  period_year: number | null
  period_half: TrainingPeriodHalf | null
}

export type ValidateOk<T> = { ok: true; payload: T }
export type ValidateErr = { ok: false; error: string }
export type ValidateResult<T> = ValidateOk<T> | ValidateErr

function parseYear(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === '') return null
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isInteger(value) || value < 2000 || value > 2100) return null
  return value
}

function parseHalf(raw: string | number | null | undefined): TrainingPeriodHalf | null {
  if (raw == null || raw === '') return null
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim())
  return isTrainingPeriodHalf(value) ? value : null
}

export function validateTrainingModule(input: TrainingModuleInput): ValidateResult<TrainingModulePayload> {
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Bitte einen Modulnamen angeben.' }

  const etClass: TrainingEtClass = isTrainingEtClass(input.etClass ?? '')
    ? input.etClass as TrainingEtClass
    : etClassFromModule({
      kind: input.kind,
      module_type: isTrainingModuleType(input.moduleType ?? '') ? input.moduleType : null,
    })
  const columns = columnsFromEtClass(etClass)
  const appliesTo = normalizeAppliesTo(input.appliesTo)

  if (columns.module_type === 'pflicht_halbjahr') {
    const year = parseYear(input.periodYear)
    const half = parseHalf(input.periodHalf)
    if (year == null || half == null) {
      return { ok: false, error: 'Internes Einsatztraining braucht Jahr und Halbjahr (1 oder 2).' }
    }
    return {
      ok: true,
      payload: {
        name,
        kind: columns.kind,
        active: input.active,
        module_type: 'pflicht_halbjahr',
        schiesst: Boolean(input.schiesst),
        applies_to: appliesTo,
        period_year: year,
        period_half: half,
      },
    }
  }

  return {
    ok: true,
    payload: {
      name,
      kind: columns.kind,
      active: input.active,
      module_type: 'zusatz',
      schiesst: Boolean(input.schiesst),
      applies_to: appliesTo,
      period_year: null,
      period_half: null,
    },
  }
}

export type TrainingCompletionRef = {
  officer_id: string
  module_id: string
  completed_on?: string | null
}

export type TrainingModulePeriodRef = {
  id: string
  kind?: TrainingKind | string | null
  module_type?: TrainingModuleType | string | null
  applies_to?: TrainingAppliesTo | string | null
  period_year?: number | null
  period_half?: number | null
}

export function officerHasCompletedModule(
  completions: readonly TrainingCompletionRef[],
  officerId: string,
  moduleId: string,
  module?: TrainingModulePeriodRef | null,
): boolean {
  if (!officerId || !moduleId) return false
  const moduleIdForPeriod = module?.id ?? moduleId
  return completions.some(row => row.officer_id === officerId && row.module_id === moduleIdForPeriod)
}

export type TrainingOfficerRef = {
  id: string
  organisation?: string | null
  active?: boolean | null
  name?: string | null
  dienstnummer?: string | null
  username?: string | null
}

export function stadtpolizeiDutyOfficers<T extends TrainingOfficerRef>(officers: readonly T[]): T[] {
  return officers.filter(officer => officer.active !== false && isStadtpolizeiMember(officer))
}

export function officerMatchesAppliesTo(
  officer: { organisation?: string | null },
  appliesTo?: TrainingAppliesTo | string | null,
): boolean {
  const audience = normalizeAppliesTo(appliesTo)
  const org = (officer.organisation ?? '').trim()
  if (audience === 'parkaufsicht') return org === PARKAUFSICHT_ORGANISATION
  const asPolizei = { organisation: org || ET_ROSTER_ORGANISATION }
  if (audience === 'polizei') return isStadtpolizeiMember(asPolizei)
  return isStadtpolizeiMember(asPolizei) || isParkaufsichtMember({ organisation: org })
}

export function officersEligibleForModule<T extends TrainingOfficerRef>(input: {
  module: Pick<TrainingModulePeriodRef, 'applies_to'>
  officers: readonly T[]
}): T[] {
  return input.officers.filter(
    officer => officer.active !== false && officerMatchesAppliesTo(officer, input.module.applies_to),
  )
}

export function officersOpenForModule<T extends TrainingOfficerRef>(input: {
  module: TrainingModulePeriodRef
  officers: readonly T[]
  completions: readonly TrainingCompletionRef[]
}): T[] {
  return officersEligibleForModule(input).filter(
    officer => !officerHasCompletedModule(input.completions, officer.id, input.module.id, input.module),
  )
}

export function officersCompletedForModule<T extends TrainingOfficerRef>(input: {
  module: TrainingModulePeriodRef
  officers: readonly T[]
  completions: readonly TrainingCompletionRef[]
}): T[] {
  return officersEligibleForModule(input).filter(
    officer => officerHasCompletedModule(input.completions, officer.id, input.module.id, input.module),
  )
}

export function modulePeriodFitsDate(module: TrainingModulePeriodRef | null | undefined, date: string): boolean {
  if (!module || module.module_type !== 'pflicht_halbjahr') return true
  if (module.period_year == null || !isTrainingPeriodHalf(module.period_half ?? 0)) return false
  return isDateInHalfYear(date, module.period_year, module.period_half as TrainingPeriodHalf)
}

export function moduleLockUserMessage(moduleName?: string | null): string {
  const name = moduleName?.trim()
  if (name) {
    return `Modul «${name}» bereits abgeschlossen – erneute Zuweisung nicht möglich.`
  }
  return 'Dieses Modul ist bereits abgeschlossen – erneute Zuweisung nicht möglich.'
}

export function isModuleLockDbError(message: string | null | undefined): boolean {
  if (!message) return false
  return /modul bereits abgeschlossen/i.test(message)
}

export function trainingModuleDeleteConfirm(moduleName?: string | null): string {
  const name = moduleName?.trim()
  if (name) {
    return `Modul «${name}» wirklich löschen?`
  }
  return 'Dieses Modul wirklich löschen?'
}

export type TrainingModuleDeleteDbError = {
  code?: string | null
  message?: string | null
}

export function isTrainingModuleInUseDbError(
  error: TrainingModuleDeleteDbError | string | null | undefined,
): boolean {
  const code = typeof error === 'string' ? '' : (error?.code ?? '')
  const message = typeof error === 'string' ? error : (error?.message ?? '')
  if (code === '23503') return true
  if (!message) return false
  if (/23503/.test(message)) return true
  if (/foreign key|foreign_key|referential integrity/i.test(message)) return true
  return /einsatz_training_(participations|completions|sessions)/i.test(message)
    && /violat|constraint|referenc/i.test(message)
}

export function trainingModuleDeleteUserMessage(
  error: TrainingModuleDeleteDbError | string | null | undefined,
  moduleName?: string | null,
): string {
  const name = moduleName?.trim()
  if (isTrainingModuleInUseDbError(error)) {
    if (name) {
      return `Modul «${name}» kann nicht gelöscht werden, weil noch Teilnahmen, Abschlüsse oder Trainingstage vorhanden sind.`
    }
    return 'Das Modul kann nicht gelöscht werden, weil noch Teilnahmen, Abschlüsse oder Trainingstage vorhanden sind.'
  }
  const fallback = (typeof error === 'string' ? error : error?.message)?.trim()
  if (fallback) return fallback
  return 'Löschen fehlgeschlagen.'
}

export function formatCompletedOn(value: string | null | undefined): string {
  if (!value) return ''
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return value
  return `${match[3]}.${match[2]}.${match[1]}`
}

export function moduleAssignmentBlockReason(input: {
  officerId: string
  moduleId: string
  moduleName?: string | null
  completions: readonly TrainingCompletionRef[]
  module?: TrainingModulePeriodRef | null
}): string | null {
  if (!officerHasCompletedModule(input.completions, input.officerId, input.moduleId, input.module)) {
    return null
  }
  const completion = input.completions.find(
    row => row.officer_id === input.officerId && row.module_id === input.moduleId,
  )
  const when = formatCompletedOn(completion?.completed_on)
  const base = moduleLockUserMessage(input.moduleName)
  return when ? `${base} Abgeschlossen am ${when}.` : base
}

export type AssignableModule = {
  id: string
  name: string
  kind: TrainingKind
  active: boolean
  module_type?: TrainingModuleType
  schiesst?: boolean
  applies_to?: TrainingAppliesTo
  period_year?: number | null
  period_half?: number | null
}

export type ModuleAssignmentOption = {
  module: AssignableModule
  blocked: boolean
  reason: string | null
}

export function moduleAssignmentOptions(input: {
  officerId: string
  kind?: TrainingKind
  moduleType?: TrainingModuleType
  modules: readonly AssignableModule[]
  completions: readonly TrainingCompletionRef[]
  includeInactive?: boolean
}): ModuleAssignmentOption[] {
  return input.modules
    .filter(module => input.kind == null || module.kind === input.kind)
    .filter(module => input.moduleType == null || module.module_type === input.moduleType)
    .filter(module => input.includeInactive || module.active)
    .map(module => {
      const reason = moduleAssignmentBlockReason({
        officerId: input.officerId,
        moduleId: module.id,
        moduleName: module.name,
        completions: input.completions,
        module,
      })
      return { module, blocked: reason !== null, reason }
    })
}

export type AttendanceInput = {
  sessionKind: string
  officerId: string
  status: string
}

export type AttendancePayload = {
  officer_id: string
  status: AttendanceStatus
}

export function validateAttendance(input: AttendanceInput): ValidateResult<AttendancePayload> {
  if (!isTrainingKind(input.sessionKind)) {
    return { ok: false, error: 'Ungültige Trainingsart.' }
  }
  if (!input.officerId.trim()) {
    return { ok: false, error: 'Bitte einen Polizisten wählen.' }
  }
  if (!isAttendanceStatus(input.status)) {
    return { ok: false, error: 'Bitte Anwesend oder Abwesend wählen.' }
  }
  return { ok: true, payload: { officer_id: input.officerId, status: input.status } }
}

export type ParticipationInput = {
  sessionKind: string
  officerId: string
  moduleId: string
  moduleKind?: string | null
  intervalLabel: string
  attendanceStatus: string | null
  completions: readonly TrainingCompletionRef[]
  moduleName?: string | null
  sessionModuleId?: string | null
  sessionDate?: string | null
  module?: TrainingModulePeriodRef | null
}

export type ParticipationPayload = {
  officer_id: string
  module_id: string
  interval_label: string | null
}

export function validateParticipation(input: ParticipationInput): ValidateResult<ParticipationPayload> {
  if (!isTrainingKind(input.sessionKind)) {
    return { ok: false, error: 'Ungültige Trainingsart.' }
  }
  if (!input.officerId.trim()) {
    return { ok: false, error: 'Bitte einen Polizisten wählen.' }
  }
  if (!input.moduleId.trim()) {
    return { ok: false, error: 'Bitte ein Modul wählen.' }
  }
  if (input.attendanceStatus != null && input.attendanceStatus !== 'present') {
    return { ok: false, error: 'Nur anwesende Personen können einem Modul zugewiesen werden.' }
  }
  if (input.sessionModuleId && input.sessionModuleId !== input.moduleId) {
    return { ok: false, error: 'Am Trainingstag gilt das gewählte Modul.' }
  }
  if (input.module && !modulePeriodFitsDate(input.module, input.sessionDate ?? '')) {
    if (input.sessionDate) {
      return { ok: false, error: 'Das Datum liegt außerhalb des Pflicht-Halbjahrs.' }
    }
  }

  const lock = moduleAssignmentBlockReason({
    officerId: input.officerId,
    moduleId: input.moduleId,
    moduleName: input.moduleName,
    completions: input.completions,
    module: input.module,
  })
  if (lock) return { ok: false, error: lock }

  const interval = input.intervalLabel.trim()
  return {
    ok: true,
    payload: {
      officer_id: input.officerId,
      module_id: input.moduleId,
      interval_label: interval.length > 0 ? interval : null,
    },
  }
}

export type TrainingSessionInput = {
  kind: string
  sessionDate: string
  note: string
  moduleId?: string
  capacity?: string | number | null
  announced?: boolean
  module?: TrainingModulePeriodRef | null
}

export type TrainingSessionPayload = {
  kind: TrainingKind
  session_date: string
  note: string | null
  module_id: string | null
  capacity: number | null
  announced: boolean
}

export function validateSession(input: TrainingSessionInput): ValidateResult<TrainingSessionPayload> {
  const kind = isTrainingKind(input.kind)
    ? input.kind
    : defaultKindForModuleType(
      input.module?.module_type === 'zusatz' ? 'zusatz' : 'pflicht_halbjahr',
    )
  if (!isTrainingKind(kind)) {
    return { ok: false, error: 'Bitte intern oder extern wählen.' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sessionDate)) {
    return { ok: false, error: 'Bitte ein Datum wählen.' }
  }
  const moduleId = input.moduleId?.trim() || null
  if (!moduleId) {
    return { ok: false, error: 'Bitte das Modul für diesen Trainingstag wählen.' }
  }
  if (input.module && input.module.id && input.module.id !== moduleId) {
    return { ok: false, error: 'Modul passt nicht zum Trainingstag.' }
  }
  if (input.module && !modulePeriodFitsDate(input.module, input.sessionDate)) {
    return { ok: false, error: 'Das Datum liegt außerhalb des Pflicht-Halbjahrs.' }
  }
  let capacity: number | null = null
  if (input.capacity != null && String(input.capacity).trim() !== '') {
    const raw = Number(String(input.capacity).trim())
    if (!Number.isInteger(raw) || raw < 1) {
      return { ok: false, error: 'Die Kapazität muss eine ganze Zahl größer 0 sein oder leer bleiben.' }
    }
    capacity = raw
  }
  const note = input.note.trim()
  return {
    ok: true,
    payload: {
      kind,
      session_date: input.sessionDate,
      note: note.length > 0 ? note : null,
      module_id: moduleId,
      capacity,
      announced: Boolean(input.announced),
    },
  }
}

export type SelfRegisterInput = {
  officerId: string
  moduleId: string
  moduleName?: string | null
  module?: TrainingModulePeriodRef | null
  officerOrganisation?: string | null
  completions: readonly TrainingCompletionRef[]
  announced: boolean
  capacity?: number | null
  registrationCount: number
  alreadyRegistered: boolean
  isOwnRegistration: boolean
  /** Sachbearbeiter darf andere anmelden; Abschluss und Kapazität gelten weiter. */
  isManagerEnrollment?: boolean
}

export function officerMatchesSearch(
  officer: Pick<TrainingOfficerRef, 'name' | 'dienstnummer' | 'username'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [officer.name, officer.dienstnummer, officer.username]
    .some(field => (field ?? '').toLowerCase().includes(q))
}

export function officersForAusschreibungPicker<T extends TrainingOfficerRef>(input: {
  module: Pick<TrainingModulePeriodRef, 'applies_to'>
  officers: readonly T[]
  registeredIds: ReadonlySet<string>
}): T[] {
  return officersEligibleForModule(input).filter(officer => !input.registeredIds.has(officer.id))
}

export function selfRegisterBlockReason(input: SelfRegisterInput): string | null {
  if (input.alreadyRegistered) {
    return 'Für diesen Termin bereits angemeldet.'
  }
  if (!input.announced) {
    return 'Dieses Trainingsprogramm ist noch nicht ausgeschrieben.'
  }
  if (!input.officerId.trim()) {
    return input.isManagerEnrollment
      ? 'Bitte eine Person wählen.'
      : 'Bitte anmelden, um sich einzutragen.'
  }
  if (!input.isOwnRegistration && !input.isManagerEnrollment) {
    return 'Anmeldung nur für das eigene Konto.'
  }
  if (
    input.officerOrganisation !== undefined
    && !officerMatchesAppliesTo({ organisation: input.officerOrganisation }, input.module?.applies_to)
  ) {
    return input.isManagerEnrollment
      ? 'Dieses Modul gilt nicht für diese Organisation.'
      : 'Dieses Modul gilt nicht für Ihre Organisation.'
  }
  const lock = moduleAssignmentBlockReason({
    officerId: input.officerId,
    moduleId: input.moduleId,
    moduleName: input.moduleName,
    completions: input.completions,
    module: input.module,
  })
  if (lock) {
    return 'Anmeldung nicht möglich: Modul bereits abgeschlossen.'
  }
  if (input.capacity != null && input.registrationCount >= input.capacity) {
    return 'Keine freien Plätze mehr.'
  }
  return null
}

export function canSelfRegister(input: SelfRegisterInput): boolean {
  return selfRegisterBlockReason(input) === null
}

export function shouldAskGeschossen(module: { schiesst?: boolean | null } | null | undefined): boolean {
  return module == null || module.schiesst === true || module.schiesst === false
}

export function preferGeschossenQuestion(module: { schiesst?: boolean | null } | null | undefined): boolean {
  return Boolean(module?.schiesst)
}

export function moduleTypeLabel(moduleType: string | null | undefined): string {
  return isTrainingModuleType(moduleType ?? '')
    ? TRAINING_MODULE_TYPE_LABELS[moduleType as TrainingModuleType]
    : 'Modul'
}

export function etClassLabel(module: {
  kind?: string | null
  module_type?: string | null
}): string {
  return TRAINING_ET_CLASS_LABELS[etClassFromModule(module)]
}

export function appliesToLabel(appliesTo: string | null | undefined): string {
  return TRAINING_APPLIES_TO_LABELS[normalizeAppliesTo(appliesTo)]
}

export function moduleFilterLabel(module: {
  name: string
  kind?: string | null
  module_type?: string | null
  applies_to?: string | null
  period_year?: number | null
  period_half?: number | null
  schiesst?: boolean | null
}): string {
  const bits = [module.name]
  const etClass = etClassFromModule(module)
  if (etClass === 'intern' && module.period_year != null && isTrainingPeriodHalf(module.period_half ?? 0)) {
    bits.push(periodLabel(module.period_year, module.period_half as TrainingPeriodHalf))
  } else {
    bits.push(TRAINING_ET_CLASS_LABELS[etClass])
  }
  if (module.schiesst) bits.push(SCHIESSEN_LABEL)
  return bits.join(' · ')
}

/** Freitext wie persönliche Munition (Marke/Kaliber/Art) — kein Katalog. */
export type MunitionVerbrauchInput = {
  anzahl: string
  marke: string
  kaliber: string
  art: string
  poolItemId: string
}

export type MunitionVerbrauchPayload = {
  munition_anzahl: number | null
  munition_marke: string | null
  munition_kaliber: string | null
  munition_art: string | null
  munition_pool_id: string | null
}

export type MunitionVerbrauchRecorded = MunitionVerbrauchPayload & {
  munition_recorded_at: string | null
  munition_recorded_by: string | null
}

export function emptyMunitionVerbrauchInput(): MunitionVerbrauchInput {
  return { anzahl: '', marke: '', kaliber: '', art: '', poolItemId: '' }
}

export const GESCHOSSEN_ANSWERS = ['yes', 'no'] as const
export type GeschossenAnswer = (typeof GESCHOSSEN_ANSWERS)[number] | ''

export function isGeschossenAnswer(value: string): value is Exclude<GeschossenAnswer, ''> {
  return value === 'yes' || value === 'no'
}

export function geschossenFromSession(session: {
  munition_anzahl?: number | null
  munition_pool_id?: string | null
}): GeschossenAnswer {
  if (session.munition_anzahl == null && !session.munition_pool_id) return ''
  if (session.munition_anzahl === 0 && !session.munition_pool_id) return 'no'
  return 'yes'
}

export function validateGeschossenMunition(input: {
  geschossen: GeschossenAnswer
  form: MunitionVerbrauchInput
}): ValidateResult<MunitionVerbrauchPayload> {
  if (input.geschossen === '') {
    return { ok: false, error: 'Bitte angeben, ob geschossen wurde.' }
  }
  if (input.geschossen === 'no') {
    return {
      ok: true,
      payload: {
        munition_anzahl: 0,
        munition_marke: null,
        munition_kaliber: null,
        munition_art: null,
        munition_pool_id: null,
      },
    }
  }
  const base = validateMunitionVerbrauch(input.form)
  if (!base.ok) return base
  if (!base.payload.munition_pool_id) {
    return { ok: false, error: 'Bitte die eingebuchte Munition wählen.' }
  }
  if (base.payload.munition_anzahl == null || base.payload.munition_anzahl < 1) {
    return { ok: false, error: 'Bitte die verbrauchte Anzahl angeben.' }
  }
  return base
}

export function munitionVerbrauchInputFromSession(session: {
  munition_anzahl?: number | null
  munition_marke?: string | null
  munition_kaliber?: string | null
  munition_art?: string | null
  munition_pool_id?: string | null
}): MunitionVerbrauchInput {
  return {
    anzahl: session.munition_anzahl == null ? '' : String(session.munition_anzahl),
    marke: session.munition_marke ?? '',
    kaliber: session.munition_kaliber ?? '',
    art: session.munition_art ?? '',
    poolItemId: session.munition_pool_id ?? '',
  }
}

function optionalMunitionText(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function validateMunitionVerbrauch(input: MunitionVerbrauchInput): ValidateResult<MunitionVerbrauchPayload> {
  const anzahlRaw = input.anzahl.trim()
  const marke = optionalMunitionText(input.marke)
  const kaliber = optionalMunitionText(input.kaliber)
  const art = optionalMunitionText(input.art)
  const poolId = optionalMunitionText(input.poolItemId)
  const hasMeta = Boolean(marke || kaliber || art || poolId)

  if (!anzahlRaw) {
    if (hasMeta) {
      return { ok: false, error: 'Bitte die verbrauchte Anzahl angeben oder die Angaben leeren.' }
    }
    return {
      ok: true,
      payload: {
        munition_anzahl: null,
        munition_marke: null,
        munition_kaliber: null,
        munition_art: null,
        munition_pool_id: null,
      },
    }
  }

  if (!/^\d+$/.test(anzahlRaw)) {
    return { ok: false, error: 'Munition verbraucht muss eine ganze Zahl sein.' }
  }
  const anzahl = Number(anzahlRaw)
  if (!Number.isSafeInteger(anzahl) || anzahl < 0) {
    return { ok: false, error: 'Munition verbraucht muss 0 oder größer sein.' }
  }

  return {
    ok: true,
    payload: {
      munition_anzahl: anzahl,
      munition_marke: marke,
      munition_kaliber: kaliber,
      munition_art: art,
      munition_pool_id: poolId,
    },
  }
}

export function withMunitionRecordedBy(
  payload: MunitionVerbrauchPayload,
  recordedBy: string | null,
  recordedAt: string = new Date().toISOString(),
): MunitionVerbrauchRecorded {
  const hasVerbrauch = payload.munition_anzahl != null
  return {
    ...payload,
    munition_recorded_at: hasVerbrauch ? recordedAt : null,
    munition_recorded_by: hasVerbrauch ? recordedBy : null,
  }
}

export function formatMunitionVerbrauch(session: {
  munition_anzahl?: number | null
  munition_marke?: string | null
  munition_kaliber?: string | null
  munition_art?: string | null
}): string {
  if (session.munition_anzahl == null) return ''
  if (session.munition_anzahl === 0) return 'nicht geschossen'
  const parts = [`${session.munition_anzahl}`]
  if (session.munition_marke?.trim()) parts.push(session.munition_marke.trim())
  if (session.munition_kaliber?.trim()) parts.push(session.munition_kaliber.trim())
  if (session.munition_art?.trim()) parts.push(session.munition_art.trim())
  return parts.join(' · ')
}

export type PoolMunitionStockRef = {
  id: string
  anzahl: number | null
}

export type PoolStockAdjustment = {
  poolId: string
  nextAnzahl: number
}

/**
 * Bestand nur anpassen, wenn eine konkrete Pool-Munitionszeile gewählt ist.
 * Persönliche Patronen werden nicht automatisch reduziert.
 */
export function planPoolMunitionAdjustments(input: {
  previous: { poolId: string | null; anzahl: number | null }
  next: { poolId: string | null; anzahl: number | null }
  stocks: Readonly<Record<string, number | null>>
}): ValidateResult<{ adjustments: PoolStockAdjustment[] }> {
  const prevId = input.previous.poolId
  const nextId = input.next.poolId
  const prevQty = prevId ? (input.previous.anzahl ?? 0) : 0
  const nextQty = nextId ? (input.next.anzahl ?? 0) : 0

  if (!prevId && !nextId) {
    return { ok: true, payload: { adjustments: [] } }
  }

  const adjustments = new Map<string, number>()

  function currentStock(poolId: string): ValidateResult<number> {
    if (!(poolId in input.stocks)) {
      return { ok: false, error: 'Die gewählte Pool-Munition wurde nicht gefunden.' }
    }
    const stock = input.stocks[poolId]
    if (stock == null) {
      return { ok: false, error: 'Pool-Munition hat keine Menge hinterlegt.' }
    }
    return { ok: true, payload: stock }
  }

  if (prevId) {
    const stock = currentStock(prevId)
    if (!stock.ok) return stock
    adjustments.set(prevId, stock.payload + prevQty)
  }

  if (nextId) {
    const base = adjustments.has(nextId)
      ? { ok: true as const, payload: adjustments.get(nextId) as number }
      : currentStock(nextId)
    if (!base.ok) return base
    const nextStock = base.payload - nextQty
    if (nextStock < 0) {
      return { ok: false, error: `Nicht genug Pool-Munition (Bestand ${base.payload}).` }
    }
    adjustments.set(nextId, nextStock)
  }

  return {
    ok: true,
    payload: {
      adjustments: [...adjustments.entries()].map(([poolId, nextAnzahl]) => ({ poolId, nextAnzahl })),
    },
  }
}

export function poolMunitionOptionLabel(item: {
  marke: string | null
  typ: string | null
  art: string | null
  anzahl: number | null
  locationLabel: string
}): string {
  const bits = [item.marke, item.typ, item.art].map(v => v?.trim()).filter((v): v is string => Boolean(v))
  const menge = item.anzahl == null ? 'ohne Menge' : `Menge ${item.anzahl}`
  return `${bits.length > 0 ? bits.join(' · ') : 'Munition (Pool)'} · ${menge} · ${item.locationLabel}`
}
