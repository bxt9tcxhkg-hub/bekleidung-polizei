/**
 * Offizielle Einsatztraining-Module aus dem Verzeichnis (Petternel, 2026-09-06).
 * Keine weiteren Namen — nur diese Liste.
 *
 * Primärachse laut Owner: Internes ET = pflicht_halbjahr (alle Stadtpolizei
 * Dornbirn im Halbjahr). Combat, Erste Hilfe COMBAT, Fahrsicherheit,
 * Stockschulung und Szenarien = zusatz (interne zusätzliche Module).
 * `kind` intern/extern bleibt nur Herkunft/Filter der Alt-Daten.
 */

import {
  currentHalfYear,
  isTrainingKind,
  isTrainingModuleType,
  isTrainingPeriodHalf,
  type TrainingKind,
  type TrainingModuleType,
  type TrainingPeriodHalf,
} from './einsatztraining'

export const OFFICIAL_TRAINING_MODULE_SOURCE = {
  folder: '2026-09-06-einsatztraining',
  files: ['verzeichnis.txt', 'Verzeichnis.pdf'],
} as const

export type OfficialTrainingModule = {
  name: string
  moduleType: TrainingModuleType
  kind: TrainingKind
  schiesst: boolean
  note?: string
}

export const OFFICIAL_TRAINING_MODULES: readonly OfficialTrainingModule[] = [
  { name: 'Internes ET', moduleType: 'pflicht_halbjahr', kind: 'intern', schiesst: false },
  {
    name: 'Combat',
    moduleType: 'zusatz',
    kind: 'extern',
    schiesst: false,
    note: 'Zusatzmodul (Owner: interne zusätzliche Module).',
  },
  {
    name: 'Stockschulung TS-Einsatzstock',
    moduleType: 'zusatz',
    kind: 'intern',
    schiesst: false,
    note: 'Zusatzmodul. kind intern nur als Herkunftsfilter.',
  },
  { name: 'Erste Hilfe COMBAT', moduleType: 'zusatz', kind: 'extern', schiesst: false },
  { name: 'Szenarientraining', moduleType: 'zusatz', kind: 'intern', schiesst: false },
  { name: 'Fahrsicherheitstraining', moduleType: 'zusatz', kind: 'extern', schiesst: false },
]

export function officialModuleKey(
  name: string,
  moduleType: string,
  period?: { year: number; half: TrainingPeriodHalf } | null,
): string {
  const base = `${name.trim().toLowerCase()}|${moduleType}`
  if (moduleType === 'pflicht_halbjahr' && period) {
    return `${base}|${period.year}|${period.half}`
  }
  return base
}

export type ExistingTrainingModuleRef = {
  id: string
  name: string
  kind: string
  active: boolean
  module_type?: string | null
  period_year?: number | null
  period_half?: number | null
  schiesst?: boolean | null
}

export type OfficialModulePlan = {
  inserts: Array<OfficialTrainingModule & { period_year: number | null; period_half: TrainingPeriodHalf | null }>
  reactivations: { id: string; name: string; moduleType: TrainingModuleType; kind: TrainingKind }[]
  alreadyActive: { id: string; name: string; moduleType: TrainingModuleType; kind: TrainingKind }[]
}

function existingKey(row: ExistingTrainingModuleRef): string | null {
  const type = row.module_type && isTrainingModuleType(row.module_type)
    ? row.module_type
    : row.kind === 'intern' && row.name.trim().toLowerCase() === 'internes et'
      ? 'pflicht_halbjahr'
      : isTrainingKind(row.kind)
        ? 'zusatz'
        : null
  if (!type) return null
  if (type === 'pflicht_halbjahr') {
    const year = row.period_year
    const half = row.period_half
    if (year == null || !isTrainingPeriodHalf(half ?? 0)) return officialModuleKey(row.name, type)
    return officialModuleKey(row.name, type, { year, half: half as TrainingPeriodHalf })
  }
  return officialModuleKey(row.name, type)
}

export function planOfficialModuleUpserts(
  existing: readonly ExistingTrainingModuleRef[],
  now: Date = new Date(),
): OfficialModulePlan {
  const period = currentHalfYear(now)
  const byKey = new Map<string, ExistingTrainingModuleRef>()
  const byName = new Map<string, ExistingTrainingModuleRef[]>()
  for (const row of existing) {
    const key = existingKey(row)
    if (key) byKey.set(key, row)
    const nameKey = row.name.trim().toLowerCase()
    const list = byName.get(nameKey) ?? []
    list.push(row)
    byName.set(nameKey, list)
  }

  const inserts: OfficialModulePlan['inserts'] = []
  const reactivations: OfficialModulePlan['reactivations'] = []
  const alreadyActive: OfficialModulePlan['alreadyActive'] = []

  for (const module of OFFICIAL_TRAINING_MODULES) {
    const periodRef = module.moduleType === 'pflicht_halbjahr' ? period : null
    const key = officialModuleKey(module.name, module.moduleType, periodRef)
    const found = byKey.get(key)
      ?? byName.get(module.name.trim().toLowerCase())?.find(row => {
        if (module.moduleType === 'pflicht_halbjahr') {
          return (row.module_type ?? 'pflicht_halbjahr') !== 'zusatz'
            && (row.period_year == null || (
              row.period_year === period.year && row.period_half === period.half
            ))
        }
        return (row.module_type ?? 'zusatz') !== 'pflicht_halbjahr'
      })

    const planned = {
      ...module,
      period_year: periodRef?.year ?? null,
      period_half: periodRef?.half ?? null,
    }

    if (!found) {
      inserts.push(planned)
      continue
    }
    if (found.active) {
      alreadyActive.push({ id: found.id, name: module.name, moduleType: module.moduleType, kind: module.kind })
    } else {
      reactivations.push({ id: found.id, name: module.name, moduleType: module.moduleType, kind: module.kind })
    }
  }

  return { inserts, reactivations, alreadyActive }
}
