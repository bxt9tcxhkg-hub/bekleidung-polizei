/**
 * Schulungen: Modul-/Termin-Tracking, analog zu Einsatztraining (Paket 5),
 * aber bewusst einfacher – Module sind einmalig/ad-hoc (keine Halbjahres-/
 * Periodenpflicht, kein intern/extern-Unterschied, keine Organisations-
 * filterung). Anmeldung/Zuteilung läuft über einen Vorschlag, den der
 * Genehmiger entscheidet (schulungen_assignments, RPC decide_schulung_assignment).
 */
import { parseSchulungenRoles, rolesForArea } from './portalEntitlements'
import { excludeAdminsFromOfficerList, type PortalAdminProfile } from './portalAdmin'
import { formatCompletedOn, officerMatchesSearch } from './einsatztraining'

export { formatCompletedOn, officerMatchesSearch }

export function canManageSchulungen(input: {
  isStrictAdmin: boolean
  isGenehmiger?: boolean
  rows: readonly { area: string; roles: string[] }[] | null
  /** Sachbearbeiter/Genehmiger ist kein Dauerzustand - default true hält bestehende Aufrufe/Tests unverändert. */
  operativeModeActive?: boolean
}): boolean {
  if (input.isStrictAdmin || input.isGenehmiger) return true
  if (input.operativeModeActive === false) return false
  if (input.rows === null) return false
  const roles = parseSchulungenRoles(rolesForArea(input.rows, 'schulungen'))
  return roles.includes('sachbearbeiter') || roles.includes('admin')
}

export type SchulungOfficerRef = {
  id: string
  active?: boolean | null
  name?: string | null
  dienstnummer?: string | null
  username?: string | null
} & PortalAdminProfile

export type SchulungCompletionRef = {
  officer_id: string
  module_id: string
}

function officerHasCompletedModule(completions: readonly SchulungCompletionRef[], officerId: string, moduleId: string): boolean {
  return completions.some(row => row.officer_id === officerId && row.module_id === moduleId)
}

export function activeSchulungOfficers<T extends SchulungOfficerRef>(officers: readonly T[]): T[] {
  return excludeAdminsFromOfficerList(officers).filter(officer => officer.active !== false)
}

export function officersOpenForModule<T extends SchulungOfficerRef>(input: {
  moduleId: string
  officers: readonly T[]
  completions: readonly SchulungCompletionRef[]
}): T[] {
  return activeSchulungOfficers(input.officers).filter(
    officer => !officerHasCompletedModule(input.completions, officer.id, input.moduleId),
  )
}

export function officersCompletedForModule<T extends SchulungOfficerRef>(input: {
  moduleId: string
  officers: readonly T[]
  completions: readonly SchulungCompletionRef[]
}): T[] {
  return activeSchulungOfficers(input.officers).filter(
    officer => officerHasCompletedModule(input.completions, officer.id, input.moduleId),
  )
}

export function officersForSchulungPicker<T extends SchulungOfficerRef>(input: {
  officers: readonly T[]
  registeredIds: ReadonlySet<string>
}): T[] {
  return activeSchulungOfficers(input.officers).filter(officer => !input.registeredIds.has(officer.id))
}

export type SchulungSelfRegisterInput = {
  officerId: string
  moduleId: string
  completions: readonly SchulungCompletionRef[]
  announced: boolean
  capacity: number | null
  registrationCount: number
  alreadyRegistered: boolean
  isOwnRegistration: boolean
  isManagerEnrollment?: boolean
}

export function selfRegisterBlockReasonSchulung(input: SchulungSelfRegisterInput): string | null {
  if (input.alreadyRegistered) {
    return 'Für diesen Termin bereits angemeldet oder vorgeschlagen.'
  }
  if (!input.announced) {
    return 'Dieser Termin ist noch nicht ausgeschrieben.'
  }
  if (!input.officerId.trim()) {
    return input.isManagerEnrollment ? 'Bitte eine Person wählen.' : 'Bitte anmelden, um sich einzutragen.'
  }
  if (!input.isOwnRegistration && !input.isManagerEnrollment) {
    return 'Anmeldung nur für das eigene Konto.'
  }
  if (officerHasCompletedModule(input.completions, input.officerId, input.moduleId)) {
    return 'Modul bereits abgeschlossen.'
  }
  if (input.capacity != null && input.registrationCount >= input.capacity) {
    return 'Keine freien Plätze mehr.'
  }
  return null
}

export function canSelfRegisterSchulung(input: SchulungSelfRegisterInput): boolean {
  return selfRegisterBlockReasonSchulung(input) === null
}

export function validateSchulungModuleName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Bitte einen Namen angeben.'
  if (trimmed.length > 160) return 'Name ist zu lang (max. 160 Zeichen).'
  return null
}

export type SchulungSessionInput = {
  moduleId: string
  sessionDate: string
  note: string
  capacity: string
  announced: boolean
}

export type SchulungSessionPayload = {
  module_id: string
  session_date: string
  note: string | null
  capacity: number | null
  announced: boolean
}

export function validateSchulungSession(input: SchulungSessionInput): { ok: true; payload: SchulungSessionPayload } | { ok: false; error: string } {
  if (!input.moduleId) return { ok: false, error: 'Bitte ein Modul wählen.' }
  if (!input.sessionDate) return { ok: false, error: 'Bitte ein Datum angeben.' }
  let capacity: number | null = null
  if (input.capacity.trim() !== '') {
    const parsed = Number(input.capacity)
    if (!Number.isInteger(parsed) || parsed <= 0) return { ok: false, error: 'Kapazität muss eine positive Zahl sein.' }
    capacity = parsed
  }
  return {
    ok: true,
    payload: {
      module_id: input.moduleId,
      session_date: input.sessionDate,
      note: input.note.trim() || null,
      capacity,
      announced: input.announced,
    },
  }
}
