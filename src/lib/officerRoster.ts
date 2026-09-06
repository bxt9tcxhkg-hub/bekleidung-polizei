/**
 * Offiziersliste aus Zuteilung/ET (Vorname, Nachname, Dienstnummer).
 * Auth-Anlage nur über create-user: E-Mail = {username}@stadtpolizei-dornbirn.local
 * mit username dn{DN}. Keine erfundenen Adressen.
 */

import { USERNAME_RE } from './workflow'
import { normalizeDienstnummer, planRoleMatrixAssignment } from './roleMatrix'

export type OfficerRosterRow = {
  vorname: string
  nachname: string
  dienstnummer: string
  gender?: 'male' | 'female'
}

/** Bestätigte Personen. Weitere Zeilen kommen per CSV-Import, nicht erfunden. */
export const KNOWN_OFFICER_ROSTER: readonly OfficerRosterRow[] = [
  { vorname: 'Hans-Peter', nachname: 'Schwendinger', dienstnummer: '1', gender: 'male' },
  { vorname: 'Stefanie', nachname: 'Albrecht', dienstnummer: '32', gender: 'female' },
  { vorname: 'Matthias', nachname: 'Fenkart', dienstnummer: '7', gender: 'male' },
  { vorname: 'Heinz', nachname: 'Petternel', dienstnummer: '18', gender: 'male' },
  { vorname: 'Muhammet', nachname: 'Soyucok', dienstnummer: '37', gender: 'male' },
]

export const OFFICER_ROSTER_CSV_TEMPLATE = `vorname;nachname;dienstnummer
Hans-Peter;Schwendinger;1
Stefanie;Albrecht;32
Matthias;Fenkart;7
Heinz;Petternel;18
Muhammet;Soyucok;37
`

const JUNK_NAME = /^(name|vorname|nachname|summe|gesamt|lagerstand|dienstnummer|dn|dg)$/i

export function usernameFromDienstnummer(raw: string | null | undefined): string {
  const dn = normalizeDienstnummer(raw)
  return dn ? `dn${dn}` : ''
}

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
  if (/\bstefanie\b/i.test(name)) return 'female'
  return 'male'
}

export type RosterImportUser = {
  name: string
  username: string
  dienstnummer: string
  organisation: 'Stadtpolizei'
  roles: string[]
  einsatzMtRole: string
  gender: 'male' | 'female'
}

export function rosterRowToImportUser(row: OfficerRosterRow): RosterImportUser | null {
  if (isJunkRosterRow(row)) return null
  const name = officerDisplayName(row.vorname, row.nachname)
  const username = usernameFromDienstnummer(row.dienstnummer)
  if (!name || !USERNAME_RE.test(username)) return null
  const planned = planRoleMatrixAssignment({
    id: '',
    name,
    dienstnummer: row.dienstnummer,
    roles: ['user'],
  })
  return {
    name,
    username,
    dienstnummer: normalizeDienstnummer(row.dienstnummer),
    organisation: 'Stadtpolizei',
    roles: planned.bekleidungRoles,
    einsatzMtRole: planned.einsatzMtRole,
    gender: row.gender ?? inferOfficerGender(name),
  }
}

export function knownRosterImportUsers(): RosterImportUser[] {
  return KNOWN_OFFICER_ROSTER.map(rosterRowToImportUser).filter((row): row is RosterImportUser => row !== null)
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
    if (takenUsernames.has(row.username)) {
      skipped.push({ name: row.name, reason: `Benutzername ${row.username} ist vergeben.` })
      continue
    }
    create.push(row)
    takenUsernames.add(row.username)
  }
  return { create, already, skipped }
}
