/**
 * Auth-Login-E-Mail für Offiziere: vorname.nachname@dornbirn.at (alles klein).
 * ASCII-Fold für den Local-Part (SMTP/Supabase). Eine Ausnahme: Feurstein Martin / DN 3.
 */

export const AUTH_EMAIL_DOMAIN = 'dornbirn.at'
export const FEURSTEIN_MARTIN_EMAIL = 'martin.feurstein2@dornbirn.at'

export function foldGermanAscii(input: string): string {
  return input
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

export function splitOfficerName(name: string): { vorname: string; nachname: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { vorname: '', nachname: '' }
  if (parts.length === 1) return { vorname: parts[0], nachname: '' }
  return { vorname: parts[0], nachname: parts.slice(1).join(' ') }
}

function normalizeDienstnummer(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? ''
  if (!trimmed) return ''
  const stripped = trimmed.replace(/^0+/, '')
  return stripped || '0'
}

export function isFeursteinMartinException(input: {
  vorname: string
  nachname: string
  dienstnummer?: string | null
}): boolean {
  const first = foldGermanAscii(input.vorname).trim().toLowerCase()
  const last = foldGermanAscii(input.nachname).trim().toLowerCase()
  const dn = normalizeDienstnummer(input.dienstnummer)
  if (first === 'martin' && last === 'feurstein') return true
  if (dn === '3' && last === 'feurstein') return true
  return false
}

export function resolveOfficerNames(input: {
  vorname?: string
  nachname?: string
  name?: string
}): { vorname: string; nachname: string } {
  let vorname = (input.vorname ?? '').trim()
  let nachname = (input.nachname ?? '').trim()
  if (!vorname || !nachname) {
    const split = splitOfficerName(input.name ?? '')
    if (!vorname) vorname = split.vorname
    if (!nachname) nachname = split.nachname
  }
  return { vorname, nachname }
}

/** Login-E-Mail (klein). Leer wenn Vor- und Nachname fehlen. */
export function officerAuthEmail(input: {
  vorname?: string
  nachname?: string
  name?: string
  dienstnummer?: string | null
}): string {
  const { vorname, nachname } = resolveOfficerNames(input)
  if (!vorname || !nachname) return ''
  if (isFeursteinMartinException({ vorname, nachname, dienstnummer: input.dienstnummer })) {
    return FEURSTEIN_MARTIN_EMAIL.toLowerCase()
  }
  const localFirst = foldGermanAscii(vorname).replace(/\s+/g, '')
  const localLast = foldGermanAscii(nachname).replace(/\s+/g, '-')
  if (!localFirst || !localLast) return ''
  return `${localFirst}.${localLast}@${AUTH_EMAIL_DOMAIN}`.toLowerCase()
}

