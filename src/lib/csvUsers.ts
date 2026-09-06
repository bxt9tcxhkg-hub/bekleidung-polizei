import { inferOfficerGender, isJunkRosterRow, usernameFromDienstnummer } from './officerRoster'
import { planRoleMatrixAssignment } from './roleMatrix'
import { ET_ROSTER_ORGANISATION } from './usersSeed'

/** Parkaufsicht nur, wenn die Organisationsspalte das ausdrücklich sagt. */
export function organisationFromImportRow(explicit: string, rosterStyle: boolean): string {
  if (rosterStyle) return ET_ROSTER_ORGANISATION
  if (/parkaufsicht/i.test(explicit.trim())) return 'Parkaufsicht'
  return ET_ROSTER_ORGANISATION
}

export interface ImportUser {
  name: string
  username: string
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
  const explicitUsername = get('benutzername', 'username', 'benutzer', 'login')
  const username = explicitUsername || usernameFromDienstnummer(dienstnummer)
  if (!name || !username) return null
  if (!explicitUsername && isJunkRosterRow({ name, vorname, nachname, dienstnummer })) return null
  const rollen = get('rollen', 'roles', 'rolle', 'role')
  const org = get('organisation', 'org')
  // Offiziersliste (Vorname/Nachname/DN, kein expliziter Login): immer Stadtpolizei.
  const rosterStyle = Boolean(vorname && nachname && dienstnummer && !explicitUsername)
  const planned = planRoleMatrixAssignment({ id: '', name, dienstnummer, roles: ['user'] })
  return {
    name,
    username: username.toLowerCase(),
    dienstnummer,
    organisation: organisationFromImportRow(org, rosterStyle),
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
