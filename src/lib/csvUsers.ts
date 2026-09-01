export interface ImportUser {
  name: string
  username: string
  dienstnummer: string
  organisation: string
  roles: string[]
}

export function rowToUser(row: Record<string, string>): ImportUser | null {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const val = row[k] ?? row[k.toLowerCase()] ?? ''
      if (val.trim()) return val.trim()
    }
    return ''
  }
  const name = get('name', 'nachname', 'vollname')
  const username = get('benutzername', 'username', 'benutzer', 'login')
  if (!name || !username) return null
  const rollen = get('rollen', 'roles', 'rolle', 'role')
  const org = get('organisation', 'org', 'abteilung', 'einheit')
  const normOrg = org.toLowerCase().includes('park') ? 'Parkaufsicht' : 'Stadtpolizei'
  return {
    name,
    username: username.toLowerCase(),
    dienstnummer: get('dienstnummer', 'dg', 'dienst-nr', 'dienstnr'),
    organisation: normOrg,
    roles: rollen ? rollen.split('|').map((s) => s.trim()).filter(Boolean) : ['user'],
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
