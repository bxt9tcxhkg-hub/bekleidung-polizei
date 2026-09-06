/**
 * Offiziersliste aus users-seed.json.
 * Auth-Anlage nur über create-user: E-Mail = vorname.nachname@dornbirn.at
 * (klein, ASCII-Fold). Ausnahme: Feurstein Martin / DN 3 → martin.feurstein2@dornbirn.at.
 * profiles.username bleibt leer bis zum Erstlogin (PC-Anmeldename).
 * Organisation aus der Seed-Zeile.
 */

import { officerAuthEmail } from './officerAuthEmail'
import { normalizeDienstnummer } from './roleMatrix'
import {
  ET_ROSTER_ORGANISATION,
  USERS_SEED,
  bekleidungRolesFromSeed,
  parseUsersSeed,
  type SeedOrganisation,
  type UserSeedOfficer,
} from './usersSeed'

export type OfficerRosterRow = {
  vorname: string
  nachname: string
  dienstnummer: string
  organisation?: SeedOrganisation
  gender?: 'male' | 'female'
  bekleidung?: UserSeedOfficer['bekleidung']
  einsatz_mt?: UserSeedOfficer['einsatz_mt']
}

export const KNOWN_OFFICER_ROSTER: readonly OfficerRosterRow[] = USERS_SEED.map(row => ({
  vorname: row.vorname,
  nachname: row.nachname,
  dienstnummer: row.dienstnummer,
  organisation: row.organisation,
  gender: inferOfficerGender(`${row.vorname} ${row.nachname}`),
  bekleidung: row.bekleidung,
  einsatz_mt: row.einsatz_mt,
}))

export const OFFICER_ROSTER_CSV_TEMPLATE = [
  'vorname;nachname;dienstnummer',
  ...USERS_SEED.map(row => `${row.vorname};${row.nachname};${row.dienstnummer}`),
  '',
].join('\n')

const JUNK_NAME = /^(name|vorname|nachname|summe|gesamt|lagerstand|dienstnummer|dn|dg)$/i

export function officerDisplayName(vorname: string, nachname: string): string {
  return [vorname.trim(), nachname.trim()].filter(Boolean).join(' ').replace(/\s+/g, ' ')
}

export function isJunkRosterRow(input: { name?: string; vorname?: string; nachname?: string; dienstnummer?: string }): boolean {
  const name = officerDisplayName(input.vorname ?? '', input.nachname ?? '') || (input.name ?? '').trim()
  if (!name || JUNK_NAME.test(name) || JUNK_NAME.test(input.vorname ?? '') || JUNK_NAME.test(input.nachname ?? '')) {
    return true
  }
  const dn = normalizeDienstnummer(input.dienstnummer)
  if (!dn || !/^\d+$/.test(dn)) return true
  return false
}

export function inferOfficerGender(name: string): 'male' | 'female' {
  if (/\b(stefanie|irmgard|karin|jessica|melissa|lea|jeanine|sonja|verona)\b/i.test(name)) return 'female'
  return 'male'
}

export type RosterImportUser = {
  name: string
  vorname: string
  nachname: string
  email: string
  username: string | null
  dienstnummer: string
  organisation: SeedOrganisation
  roles: string[]
  einsatzMtRole: string
  gender: 'male' | 'female'
}

function rolesForRow(row: OfficerRosterRow): { roles: string[]; einsatzMtRole: string; organisation: SeedOrganisation } {
  const seed = USERS_SEED.find(item => normalizeDienstnummer(item.dienstnummer) === normalizeDienstnummer(row.dienstnummer))
  const organisation = row.organisation ?? seed?.organisation ?? ET_ROSTER_ORGANISATION
  const bekleidung = organisation === 'Parkaufsicht'
    ? 'user'
    : (row.bekleidung ?? seed?.bekleidung ?? 'user')
  const einsatz = organisation === 'Parkaufsicht'
    ? 'user'
    : (row.einsatz_mt ?? seed?.einsatz_mt ?? 'user')
  return {
    roles: bekleidungRolesFromSeed(bekleidung),
    einsatzMtRole: einsatz,
    organisation,
  }
}

export function rosterRowToImportUser(row: OfficerRosterRow): RosterImportUser | null {
  if (isJunkRosterRow(row)) return null
  const name = officerDisplayName(row.vorname, row.nachname)
  const email = officerAuthEmail({
    vorname: row.vorname,
    nachname: row.nachname,
    name,
    dienstnummer: row.dienstnummer,
  })
  if (!name || !email) return null
  const planned = rolesForRow(row)
  return {
    name,
    vorname: row.vorname.trim(),
    nachname: row.nachname.trim(),
    email,
    username: null,
    dienstnummer: normalizeDienstnummer(row.dienstnummer),
    organisation: planned.organisation,
    roles: planned.roles,
    einsatzMtRole: planned.einsatzMtRole,
    gender: row.gender ?? inferOfficerGender(name),
  }
}

export function knownRosterImportUsers(): RosterImportUser[] {
  return KNOWN_OFFICER_ROSTER.map(rosterRowToImportUser).filter((row): row is RosterImportUser => row !== null)
}

export function importUsersFromSeedJson(text: string): { ok: true; users: RosterImportUser[] } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'users-seed.json ist ungültig.' }
  }
  const seed = parseUsersSeed(parsed)
  if (!seed.ok) return seed
  const users = seed.file.officers
    .map(row => rosterRowToImportUser(row))
    .filter((row): row is RosterImportUser => row !== null)
  return { ok: true, users }
}

export type ExistingRosterProfile = {
  id: string
  name?: string | null
  username?: string | null
  dienstnummer?: string | null
}

export function planRosterEnsure(
  rows: readonly RosterImportUser[],
  existing: readonly ExistingRosterProfile[],
): { create: RosterImportUser[]; already: RosterImportUser[]; skipped: { name: string; reason: string }[] } {
  const create: RosterImportUser[] = []
  const already: RosterImportUser[] = []
  const skipped: { name: string; reason: string }[] = []
  const takenUsernames = new Set(existing.map(p => (p.username ?? '').trim().toLowerCase()).filter(Boolean))
  const takenEmails = new Set<string>()

  for (const row of rows) {
    const dn = normalizeDienstnummer(row.dienstnummer)
    const byDn = existing.filter(p => normalizeDienstnummer(p.dienstnummer) === dn)
    if (byDn.length === 1) {
      already.push(row)
      continue
    }
    if (byDn.length > 1) {
      skipped.push({ name: row.name, reason: `Dienstnummer ${dn} ist nicht eindeutig.` })
      continue
    }
    const emailKey = row.email.trim().toLowerCase()
    if (takenEmails.has(emailKey)) {
      skipped.push({ name: row.name, reason: `Login-E-Mail ${row.email} ist doppelt.` })
      continue
    }
    const username = (row.username ?? '').trim().toLowerCase()
    if (username && takenUsernames.has(username)) {
      skipped.push({ name: row.name, reason: `Benutzername ${row.username} ist vergeben.` })
      continue
    }
    create.push(row)
    if (username) takenUsernames.add(username)
    takenEmails.add(emailKey)
  }
  return { create, already, skipped }
}
