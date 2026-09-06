/**
 * Quelle der Offiziersanlage: users-seed.json (Zuteilung/ET).
 * Rollen stehen an der Zeile. Keine erfundenen Namen über diese Liste hinaus.
 */

import seedFile from '../data/users-seed.json'

export const BEKLEIDUNG_SEED_ROLES = ['user', 'sachbearbeiter', 'genehmiger', 'admin'] as const
export const EINSATZ_MT_SEED_ROLES = ['user', 'sachbearbeiter', 'admin'] as const

export type BekleidungSeedRole = (typeof BEKLEIDUNG_SEED_ROLES)[number]
export type EinsatzMtSeedRole = (typeof EINSATZ_MT_SEED_ROLES)[number]

export type UserSeedOfficer = {
  nachname: string
  vorname: string
  dienstnummer: string
  bekleidung: BekleidungSeedRole
  einsatz_mt: EinsatzMtSeedRole
}

export type UserSeedFile = {
  source?: { path?: string; note?: string }
  officers: UserSeedOfficer[]
}

function isBekleidungSeedRole(value: string): value is BekleidungSeedRole {
  return (BEKLEIDUNG_SEED_ROLES as readonly string[]).includes(value)
}

function isEinsatzMtSeedRole(value: string): value is EinsatzMtSeedRole {
  return (EINSATZ_MT_SEED_ROLES as readonly string[]).includes(value)
}

export function parseUsersSeed(input: unknown): { ok: true; file: UserSeedFile } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'users-seed.json muss ein Objekt sein.' }
  }
  const officers = (input as { officers?: unknown }).officers
  if (!Array.isArray(officers)) {
    return { ok: false, error: 'users-seed.json braucht ein officers-Array.' }
  }
  const rows: UserSeedOfficer[] = []
  for (const [index, raw] of officers.entries()) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: `Zeile ${index + 1}: ungültiger Eintrag.` }
    }
    const row = raw as Record<string, unknown>
    const nachname = String(row.nachname ?? '').trim()
    const vorname = String(row.vorname ?? '').trim()
    const dienstnummer = String(row.dienstnummer ?? '').trim()
    const bekleidung = String(row.bekleidung ?? 'user').trim()
    const einsatz = String(row.einsatz_mt ?? 'user').trim()
    if (!nachname || !vorname || !dienstnummer) {
      return { ok: false, error: `Zeile ${index + 1}: nachname, vorname und dienstnummer sind Pflicht.` }
    }
    if (!isBekleidungSeedRole(bekleidung) || !isEinsatzMtSeedRole(einsatz)) {
      return { ok: false, error: `Zeile ${index + 1}: ungültige Rolle.` }
    }
    rows.push({ nachname, vorname, dienstnummer, bekleidung, einsatz_mt: einsatz })
  }
  return { ok: true, file: { ...(input as UserSeedFile), officers: rows } }
}

const parsed = parseUsersSeed(seedFile)
if (!parsed.ok) {
  throw new Error(parsed.error)
}

export const USERS_SEED_FILE = parsed.file
export const USERS_SEED = parsed.file.officers

export function bekleidungRolesFromSeed(role: BekleidungSeedRole): string[] {
  if (role === 'admin') return ['admin']
  if (role === 'user') return ['user']
  return ['user', role]
}

export function findUserSeedByDienstnummer(dienstnummer: string): UserSeedOfficer | undefined {
  const needle = dienstnummer.trim().replace(/^0+/, '') || '0'
  return USERS_SEED.find(row => (row.dienstnummer.replace(/^0+/, '') || '0') === needle)
}
