/**
 * Einsatztraining (Phase 3a): Module, internes Protokoll, Modul-Sperre.
 *
 * Kein hinterlegter Lehrplan — Module legt SB/Admin an (Name, intern/extern).
 * Taktung nur hier als Konstante, nicht als Magie in der UI.
 * Schreiben: einsatz_mt Sachbearbeiter/Admin oder globales profiles.admin.
 * Lesen: jede einsatz_mt-Rolle (user = nur Lesen).
 */

import { parseEinsatzMtRole, rolesForArea } from './portalEntitlements'

export const TRAINING_KINDS = ['intern', 'extern'] as const
export type TrainingKind = (typeof TRAINING_KINDS)[number]

export const TRAINING_KIND_LABELS: Record<TrainingKind, string> = {
  intern: 'Intern',
  extern: 'Extern',
}

export const ATTENDANCE_STATUSES = ['present', 'absent'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Anwesend',
  absent: 'Abwesend',
}

/** Owner-Taktung. Nur diese Datei, nicht in Komponenten nachbauen. */
export const EINSATZTRAINING_CADENCE = {
  intern: { times: 1, period: 'halbjahr' },
  extern: { times: 4, period: 'jahr' },
} as const

export type CadencePeriod = (typeof EINSATZTRAINING_CADENCE)[TrainingKind]['period']

export function isTrainingKind(value: string): value is TrainingKind {
  return (TRAINING_KINDS as readonly string[]).includes(value)
}

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value)
}

export function cadenceLabel(kind: TrainingKind): string {
  const cadence = EINSATZTRAINING_CADENCE[kind]
  if (cadence.period === 'halbjahr') {
    return `${cadence.times}× pro Halbjahr`
  }
  return `${cadence.times}× pro Jahr`
}

export function cadenceSummary(): string {
  return `Internes ET: ${cadenceLabel('intern')}. Externes ET: ${cadenceLabel('extern')}.`
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
  kind: string
  active: boolean
}

export type TrainingModulePayload = {
  name: string
  kind: TrainingKind
  active: boolean
}

export type ValidateOk<T> = { ok: true; payload: T }
export type ValidateErr = { ok: false; error: string }
export type ValidateResult<T> = ValidateOk<T> | ValidateErr

export function validateTrainingModule(input: TrainingModuleInput): ValidateResult<TrainingModulePayload> {
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Bitte einen Modulnamen angeben.' }
  if (!isTrainingKind(input.kind)) return { ok: false, error: 'Bitte intern oder extern wählen.' }
  return { ok: true, payload: { name, kind: input.kind, active: input.active } }
}

export type TrainingCompletionRef = {
  officer_id: string
  module_id: string
  completed_on?: string | null
}

export function officerHasCompletedModule(
  completions: readonly TrainingCompletionRef[],
  officerId: string,
  moduleId: string,
): boolean {
  if (!officerId || !moduleId) return false
  return completions.some(row => row.officer_id === officerId && row.module_id === moduleId)
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
}): string | null {
  if (!officerHasCompletedModule(input.completions, input.officerId, input.moduleId)) {
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
}

export type ModuleAssignmentOption = {
  module: AssignableModule
  blocked: boolean
  reason: string | null
}

export function moduleAssignmentOptions(input: {
  officerId: string
  kind: TrainingKind
  modules: readonly AssignableModule[]
  completions: readonly TrainingCompletionRef[]
  includeInactive?: boolean
}): ModuleAssignmentOption[] {
  return input.modules
    .filter(module => module.kind === input.kind)
    .filter(module => input.includeInactive || module.active)
    .map(module => {
      const reason = moduleAssignmentBlockReason({
        officerId: input.officerId,
        moduleId: module.id,
        moduleName: module.name,
        completions: input.completions,
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
  if (input.moduleKind && isTrainingKind(input.moduleKind) && input.moduleKind !== input.sessionKind) {
    return { ok: false, error: 'Modulart muss zur Trainingsart passen (intern/extern).' }
  }

  if (input.sessionKind === 'intern') {
    if (input.attendanceStatus !== 'present') {
      return { ok: false, error: 'Nur anwesende Personen können einem Modul zugewiesen werden.' }
    }
    const interval = input.intervalLabel.trim()
    if (!interval) {
      return { ok: false, error: 'Bitte das Intervall angeben.' }
    }
  }

  const lock = moduleAssignmentBlockReason({
    officerId: input.officerId,
    moduleId: input.moduleId,
    moduleName: input.moduleName,
    completions: input.completions,
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

export function validateSession(input: {
  kind: string
  sessionDate: string
  note: string
}): ValidateResult<{ kind: TrainingKind; session_date: string; note: string | null }> {
  if (!isTrainingKind(input.kind)) {
    return { ok: false, error: 'Bitte intern oder extern wählen.' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sessionDate)) {
    return { ok: false, error: 'Bitte ein Datum wählen.' }
  }
  const note = input.note.trim()
  return {
    ok: true,
    payload: {
      kind: input.kind,
      session_date: input.sessionDate,
      note: note.length > 0 ? note : null,
    },
  }
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
