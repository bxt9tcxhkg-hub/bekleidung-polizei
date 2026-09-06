/**
 * Quelle der Offiziersanlage: users-seed.json (Zuteilung/ET + Parkaufsicht-Liste).
 * Rollen stehen an der Zeile. Login-E-Mail: vorname.nachname@dornbirn.at
 * (klein; Ausnahme Feurstein Martin / DN 3). Username bleibt leer bis zum Erstlogin.
 * Keine erfundenen Namen oder höheren Rollen.
 */

import seedFile from '../data/users-seed.json'
import { officerAuthEmail } from './officerAuthEmail'

export const BEKLEIDUNG_SEED_ROLES = ['user', 'sachbearbeiter', 'genehmiger', 'admin'] as const
export const EINSATZ_MT_SEED_ROLES = ['user', 'sachbearbeiter', 'admin'] as const
/** App-Wert für Stadtpolizei Dornbirn (profiles.organisation). */
export const ET_ROSTER_ORGANISATION = 'Stadtpolizei' as const
export const PARKAUFSICHT_ORGANISATION = 'Parkaufsicht' as const

export type BekleidungSeedRole = (typeof BEKLEIDUNG_SEED_ROLES)[number]
export type EinsatzMtSeedRole = (typeof EINSATZ_MT_SEED_ROLES)[number]
export type SeedOrganisation = typeof ET_ROSTER_ORGANISATION | typeof PARKAUFSICHT_ORGANISATION

export type UserSeedOfficer = {
  nachname: string
  vorname: string
  dienstnummer: string
  organisation: SeedOrganisation
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

export function organisationFromSeedValue(raw: unknown): SeedOrganisation {
  return /parkaufsicht/i.test(String(raw ?? '').trim())
    ? PARKAUFSICHT_ORGANISATION
    : ET_ROSTER_ORGANISATION
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
    const organisation = organisationFromSeedValue(row.organisation)
    let bekleidung = String(row.bekleidung ?? 'user').trim()
    let einsatz = String(row.einsatz_mt ?? 'user').trim()
    if (!nachname || !vorname || !dienstnummer) {
      return { ok: false, error: `Zeile ${index + 1}: nachname, vorname und dienstnummer sind Pflicht.` }
    }
    // Parkaufsicht: nur Bekleidung Benutzer. Keine erfundenen höheren Rollen.
    if (organisation === PARKAUFSICHT_ORGANISATION) {
      bekleidung = 'user'
      einsatz = 'user'
    }
    if (!isBekleidungSeedRole(bekleidung) || !isEinsatzMtSeedRole(einsatz)) {
      return { ok: false, error: `Zeile ${index + 1}: ungültige Rolle.` }
    }
    rows.push({
      nachname,
      vorname,
      dienstnummer,
      organisation,
      bekleidung,
      einsatz_mt: einsatz,
    })
  }
  return { ok: true, file: { ...(input as UserSeedFile), officers: rows } }
}

const parsed = parseUsersSeed(seedFile)
if (!parsed.ok) {
  throw new Error(parsed.error)
}

export const USERS_SEED_FILE = parsed.file
export const USERS_SEED = parsed.file.officers
export const PARKAUFSICHT_SEED = USERS_SEED.filter(row => row.organisation === PARKAUFSICHT_ORGANISATION)
export const STADTPOLIZEI_SEED = USERS_SEED.filter(row => row.organisation === ET_ROSTER_ORGANISATION)

export function bekleidungRolesFromSeed(role: BekleidungSeedRole): string[] {
  if (role === 'admin') return ['admin']
  if (role === 'user') return ['user']
  return ['user', role]
}

export function findUserSeedByDienstnummer(dienstnummer: string): UserSeedOfficer | undefined {
  const needle = dienstnummer.trim().replace(/^0+/, '') || '0'
  return USERS_SEED.find(row => (row.dienstnummer.replace(/^0+/, '') || '0') === needle)
}

export function seedOfficerAuthEmail(row: Pick<UserSeedOfficer, 'vorname' | 'nachname' | 'dienstnummer'>): string {
  return officerAuthEmail(row)
}
