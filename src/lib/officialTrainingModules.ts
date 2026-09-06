/**
 * Offizielle Einsatztraining-Module aus dem Verzeichnis (Petternel, 2026-09-06).
 * Keine weiteren Namen — nur diese Liste.
 *
 * Stockschulung ist intern (wie internes ET getaktet). Erste Hilfe COMBAT
 * und Fahrsicherheitstraining sind externe Kurse. Szenarientraining intern.
 */

import { isTrainingKind, type TrainingKind } from './einsatztraining'

export const OFFICIAL_TRAINING_MODULE_SOURCE = {
  folder: '2026-09-06-einsatztraining',
  files: ['verzeichnis.txt', 'Verzeichnis.pdf'],
} as const

export type OfficialTrainingModule = {
  name: string
  kind: TrainingKind
  note?: string
}

export const OFFICIAL_TRAINING_MODULES: readonly OfficialTrainingModule[] = [
  { name: 'Combat', kind: 'extern' },
  { name: 'Internes ET', kind: 'intern' },
  {
    name: 'Stockschulung TS-Einsatzstock',
    kind: 'intern',
    note: 'Wie internes ET geplant; PDF trennt die Matrix, intern angesetzt.',
  },
  { name: 'Erste Hilfe COMBAT', kind: 'extern' },
  { name: 'Szenarientraining', kind: 'intern' },
  { name: 'Fahrsicherheitstraining', kind: 'extern' },
]

export function officialModuleKey(name: string, kind: string): string {
  return `${name.trim().toLowerCase()}|${kind}`
}

export type ExistingTrainingModuleRef = {
  id: string
  name: string
  kind: string
  active: boolean
}

export type OfficialModulePlan = {
  inserts: OfficialTrainingModule[]
  reactivations: { id: string; name: string; kind: TrainingKind }[]
  alreadyActive: { id: string; name: string; kind: TrainingKind }[]
}

export function planOfficialModuleUpserts(
  existing: readonly ExistingTrainingModuleRef[],
): OfficialModulePlan {
  const byKey = new Map<string, ExistingTrainingModuleRef>()
  for (const row of existing) {
    if (!isTrainingKind(row.kind)) continue
    byKey.set(officialModuleKey(row.name, row.kind), row)
  }

  const inserts: OfficialTrainingModule[] = []
  const reactivations: OfficialModulePlan['reactivations'] = []
  const alreadyActive: OfficialModulePlan['alreadyActive'] = []

  for (const module of OFFICIAL_TRAINING_MODULES) {
    const found = byKey.get(officialModuleKey(module.name, module.kind))
    if (!found) {
      inserts.push(module)
      continue
    }
    if (found.active) {
      alreadyActive.push({ id: found.id, name: module.name, kind: module.kind })
    } else {
      reactivations.push({ id: found.id, name: module.name, kind: module.kind })
    }
  }

  return { inserts, reactivations, alreadyActive }
}
