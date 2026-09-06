/**
 * Quelle der Offiziersanlage: users-seed.json (Zuteilung/ET + Parkaufsicht-Liste).
 * Rollen stehen an der Zeile. Login-E-Mail: vorname.nachname@dornbirn.at
 * (klein; Ausnahme Feurstein Martin / DN 3). Username bleibt leer bis zum Erstlogin.
 * Keine erfundenen Namen oder höheren Rollen.
 *
 * `officer`: optional, Default true. `false` = kein Polizei-Offizier
 * (z. B. Sonja Dolliner / DN 24). Organisation bleibt unverändert, damit
 * der Bekleidung-Shop weiter nach `profile.organisation` lädt.
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
  /**
   * Polizei-Offiziersliste. Default true.
   * false: Portal-/Bekleidung-Benutzer, nicht in EM-Matrix Polizei / ET polizei.
   */
  officer: boolean
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

/** Nur explizites `false` (oder Alias `einsatz_roster: false`) setzt den Offiziersflag zurück. */
export function parseSeedOfficerFlag(row: Record<string, unknown>): boolean {
  if (row.officer === false || row.einsatz_roster === false) return false
  return true
}

export function normalizeSeedDienstnummer(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/^0+/, '') || '0'
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
      officer: parseSeedOfficerFlag(row),
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
/** Stadtpolizei-Mitglieder, die in Polizei-Offizierslisten stehen (officer !== false). */
export const STADTPOLIZEI_OFFICER_SEED = STADTPOLIZEI_SEED.filter(row => row.officer !== false)

export function bekleidungRolesFromSeed(role: BekleidungSeedRole): string[] {
  if (role === 'admin') return ['admin']
  if (role === 'user') return ['user']
  return ['user', role]
}

export function findUserSeedByDienstnummer(dienstnummer: string): UserSeedOfficer | undefined {
  const needle = normalizeSeedDienstnummer(dienstnummer)
  if (!needle) return undefined
  return USERS_SEED.find(row => normalizeSeedDienstnummer(row.dienstnummer) === needle)
}

export type RosterOfficerRef = {
  organisation?: string | null
  officer?: boolean | null
  einsatz_roster?: boolean | null
  dienstnummer?: string | null
  name?: string | null
  vorname?: string | null
  nachname?: string | null
}

function seedDisplayNames(row: Pick<UserSeedOfficer, 'vorname' | 'nachname'>): string[] {
  return [
    `${row.vorname} ${row.nachname}`,
    `${row.nachname} ${row.vorname}`,
  ].map(value => value.toLowerCase().replace(/\s+/g, ' ').trim())
}

function profileNameHay(profile: RosterOfficerRef): string {
  const fromParts = [profile.vorname, profile.nachname].filter(Boolean).join(' ')
  return (profile.name ?? fromParts).trim().toLowerCase().replace(/\s+/g, ' ')
}

export function findUserSeedForRoster(profile: RosterOfficerRef): UserSeedOfficer | undefined {
  const dn = normalizeSeedDienstnummer(profile.dienstnummer)
  if (dn) {
    const byDn = findUserSeedByDienstnummer(dn)
    if (byDn) return byDn
  }
  const hay = profileNameHay(profile)
  if (!hay) return undefined
  const hits = USERS_SEED.filter(row => seedDisplayNames(row).some(name => hay === name || hay.includes(name)))
  return hits.length === 1 ? hits[0] : undefined
}

/**
 * Polizei-Offizier für EM-Matrix / ET-Geltung `polizei`.
 * Stadtpolizei und officer !== false (Default true).
 * Live-Profile ohne DB-Spalte: Seed-Flag über Dienstnummer oder Namen
 * (Sonja Dolliner / DN 24).
 */
export function isPolizistForRoster(profile: RosterOfficerRef): boolean {
  const org = (profile.organisation ?? '').trim() || ET_ROSTER_ORGANISATION
  if (org !== ET_ROSTER_ORGANISATION) return false
  if (profile.officer === false || profile.einsatz_roster === false) return false
  const seed = findUserSeedForRoster(profile)
  if (seed && seed.officer === false) return false
  return true
}

export function seedOfficerAuthEmail(row: Pick<UserSeedOfficer, 'vorname' | 'nachname' | 'dienstnummer'>): string {
  return officerAuthEmail(row)
}
