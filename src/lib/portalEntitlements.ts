/**
 * Portal-Bereichsrechte (Phase 1).
 *
 * Modell: eine Zeile pro (user_id, area) mit `roles text[]`.
 * - bekleidung: mehrere Rollen gleichzeitig (wie profiles.roles: Benutzer,
 *   Sachbearbeiter, Genehmiger, Admin). approver wird als genehmiger gelesen.
 * - einsatz_mt: genau eine Rolle aus Benutzer | Sachbearbeiter | Admin
 *   (kein Genehmiger). Benutzer = Leserecht für persönliche Einsatzmittel.
 *
 * Dual-Write: area=bekleidung.roles ↔ profiles.roles. profiles.roles bleibt
 * Quelle für bestehende Bekleidungs-RLS / has_role.
 *
 * Keine Zeile = kein Entitlement für den Bereich (Kachel ausgeblendet).
 * Ausnahme ohne Tabelle (Migration noch nicht angewandt): Bekleidung sichtbar,
 * Einsatzmittel & Training nicht — Admin sieht immer alles.
 */

import type { PortalApp } from './portalApps'

export const PORTAL_AREAS = ['bekleidung', 'einsatz_mt'] as const
export type PortalArea = (typeof PORTAL_AREAS)[number]

export const BEKLEIDUNG_ROLES = ['user', 'sachbearbeiter', 'genehmiger', 'admin'] as const
export const EINSATZ_MT_ROLES = ['user', 'sachbearbeiter', 'admin'] as const

export type BekleidungRole = (typeof BEKLEIDUNG_ROLES)[number]
export type EinsatzMtRole = (typeof EINSATZ_MT_ROLES)[number]
export type PortalAreaRoleName = BekleidungRole | EinsatzMtRole

export const AREA_ROLES = {
  bekleidung: BEKLEIDUNG_ROLES,
  einsatz_mt: EINSATZ_MT_ROLES,
} as const

export const AREA_LABELS: Record<PortalArea, string> = {
  bekleidung: 'Bekleidung',
  einsatz_mt: 'Einsatzmittel & Training',
}

export const AREA_ROLE_LABELS: Record<PortalAreaRoleName, string> = {
  user: 'Benutzer',
  sachbearbeiter: 'Sachbearbeiter',
  genehmiger: 'Genehmiger',
  admin: 'Admin',
}

const ROLE_RANK: Record<string, number> = {
  user: 0,
  sachbearbeiter: 1,
  genehmiger: 2,
  admin: 3,
}

export type PortalAreaRoleRow = {
  user_id: string
  area: PortalArea
  roles: string[]
}

function uniquePreserve(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

/** approver ist historisches Synonym für genehmiger (Bekleidung). */
export function canonicalizeRoleName(role: string): string {
  return role === 'approver' ? 'genehmiger' : role
}

export function sortAreaRoles(roles: readonly string[]): string[] {
  return uniquePreserve(roles).slice().sort((a, b) => {
    const ra = ROLE_RANK[canonicalizeRoleName(a)] ?? 99
    const rb = ROLE_RANK[canonicalizeRoleName(b)] ?? 99
    if (ra !== rb) return ra - rb
    return a.localeCompare(b)
  })
}

export function isPortalArea(value: string): value is PortalArea {
  return (PORTAL_AREAS as readonly string[]).includes(value)
}

export function isAllowedAreaRole(area: PortalArea, role: string): boolean {
  const canonical = canonicalizeRoleName(role)
  return (AREA_ROLES[area] as readonly string[]).includes(canonical)
}

export function highestAreaRole(roles: readonly string[]): string | null {
  const sorted = sortAreaRoles(roles.map(canonicalizeRoleName))
  return sorted.length > 0 ? sorted[sorted.length - 1] : null
}

/** profiles.roles → Bereich Bekleidung (gültige Namen, Sortierung). */
export function bekleidungRolesFromProfiles(roles: readonly string[]): string[] {
  const mapped = roles.map(canonicalizeRoleName).filter(role => isAllowedAreaRole('bekleidung', role))
  const sorted = sortAreaRoles(mapped)
  return sorted.length > 0 ? sorted : ['user']
}

/** Bekleidungs-Bereichsrollen → profiles.roles (kanonisch, Dual-Write). */
export function profilesRolesFromBekleidung(roles: readonly string[]): string[] {
  return bekleidungRolesFromProfiles(roles)
}

export function parseEinsatzMtRole(roles: readonly string[] | null | undefined): EinsatzMtRole | null {
  if (!roles || roles.length === 0) return null
  const allowed = roles.map(canonicalizeRoleName).filter(role => isAllowedAreaRole('einsatz_mt', role))
  const highest = highestAreaRole(allowed)
  if (highest === 'user' || highest === 'sachbearbeiter' || highest === 'admin') return highest
  return null
}

export function rolesForArea(
  rows: readonly { area: string; roles: string[] }[],
  area: PortalArea,
): string[] {
  const row = rows.find(r => r.area === area)
  return row ? [...row.roles] : []
}

/**
 * @param rows `null` = Tabelle nicht lesbar (Migration fehlt). Sonst geladene Zeilen.
 */
export function hasAreaEntitlement(input: {
  area: PortalArea
  isStrictAdmin: boolean
  rows: readonly { area: string; roles: string[] }[] | null
}): boolean {
  if (input.isStrictAdmin) return true
  if (input.rows === null) return input.area === 'bekleidung'
  const roles = rolesForArea(input.rows, input.area)
  return roles.length > 0
}

export function visiblePortalApps(
  apps: readonly PortalApp[],
  entitlement: {
    isStrictAdmin: boolean
    rows: readonly { area: string; roles: string[] }[] | null
  },
): PortalApp[] {
  return apps.filter(app => {
    if (!isPortalArea(app.id)) return true
    return hasAreaEntitlement({ area: app.id, ...entitlement })
  })
}

export function defaultEinsatzMtRoleForNewUser(): EinsatzMtRole {
  return 'user'
}
