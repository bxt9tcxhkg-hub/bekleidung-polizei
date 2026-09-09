import { officerAuthEmail, splitOfficerName } from './officerAuthEmail'
import { inferOfficerGender, isJunkRosterRow } from './officerRoster'
import { planRoleMatrixAssignment } from './roleMatrix'
import { findUserSeedByDienstnummer, organisationFromSeedValue } from './usersSeed'
import { USERNAME_RE, isDnPlaceholderUsername } from './workflow'

/** Seed-DN gewinnt. Sonst nur explizite Parkaufsicht-Spalte — nicht aus „park“ im Namen. */
export function organisationFromImportRow(explicit: string, dienstnummer: string): string {
  const seed = findUserSeedByDienstnummer(dienstnummer)
  if (seed) return seed.organisation
  if (/verwaltung/i.test(explicit.trim())) return 'Verwaltung'
  return organisationFromSeedValue(explicit)
}

export interface ImportUser {
  name: string
  vorname?: string
  nachname?: string
  email: string
  username: string | null
  dienstnummer: string
  organisation: string
  roles: string[]
  einsatzMtRole?: string
  gender?: 'male' | 'female'
}

export function rowToUser(row: Record<string, string>): ImportUser | null {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const val = row[k] ?? row[k.toLowerCase()] ?? ''
      if (val.trim()) return val.trim()
    }
    return ''
  }
  const vorname = get('vorname')
  const nachname = get('nachname')
  const name = get('name', 'vollname') || [vorname, nachname].filter(Boolean).join(' ')
  const dienstnummer = get('dienstnummer', 'dn', 'dg', 'dienst-nr', 'dienstnr')
  const names = vorname && nachname ? { vorname, nachname } : splitOfficerName(name)
  const email = officerAuthEmail({
    vorname: names.vorname || vorname,
    nachname: names.nachname || nachname,
    name,
    dienstnummer,
  })
  const explicitUsername = get('benutzername', 'username', 'benutzer', 'login').toLowerCase()
  const username = explicitUsername && USERNAME_RE.test(explicitUsername) && !isDnPlaceholderUsername(explicitUsername)
    ? explicitUsername
    : null
  if (!name) return null
  if (!explicitUsername && isJunkRosterRow({ name, vorname, nachname, dienstnummer })) return null
  if (!email && !username) return null
  const rollen = get('rollen', 'roles', 'rolle', 'role')
  const org = get('organisation', 'org')
  const planned = planRoleMatrixAssignment({ id: '', name, dienstnummer, roles: ['user'] })
  return {
    name,
    vorname: names.vorname || vorname || undefined,
    nachname: names.nachname || nachname || undefined,
    email,
    username,
    dienstnummer,
    organisation: organisationFromImportRow(org, dienstnummer),
    roles: rollen ? rollen.split('|').map((s) => s.trim()).filter(Boolean) : planned.bekleidungRoles,
    einsatzMtRole: planned.einsatzMtRole,
    gender: inferOfficerGender(name),
  }
}

/** Zerlegt eine CSV-Zeile inkl. einfachem Quote-Handling. */
export function splitCsvLine(line: string, sep: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQuotes = false
      } else cur += ch
    } else if (ch === '"' && cur.trim() === '') {
      inQuotes = true
      cur = ''
    } else if (ch === sep) {
      cols.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  cols.push(cur.trim())
  return cols
}

export function parseCsvUsers(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase())
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line, sep)
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']))
  })
}

export function parseImportUsers(text: string): ImportUser[] {
  return parseCsvUsers(text).map(rowToUser).filter((u): u is ImportUser => u !== null)
}
