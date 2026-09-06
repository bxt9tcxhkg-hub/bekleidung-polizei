/**
 * Persönliche Einsatzmittel.
 *
 * Eine Tabelle `personal_einsatzmittel` mit category + typisierten nullable
 * Spalten. Officer ist optional, wenn ein Verwahrungsort gesetzt ist
 * (typisch: Lager nach Austritt). Mehrere Zeilen derselben Kategorie mit
 * unterschiedlicher Waffennummer sind zulässig.
 * Schreiben: einsatz_mt Sachbearbeiter/Admin oder globales profiles.admin.
 * Lesen: jede einsatz_mt-Rolle (user = nur Lesen).
 */

import { parseEinsatzMtRole, rolesForArea } from './portalEntitlements'
import { isVerwahrungsort, VERWAHRUNGSORT_LABELS, type Verwahrungsort } from './verwahrungsort'

export const PERSONAL_EM_CATEGORIES = [
  'schutzweste',
  'glock_17',
  'munition',
  'pfefferspray',
  'schlagstock',
  'handfesseln',
  'taschenlampe_kelle',
  'leatherman',
  'warnweste',
] as const

export type PersonalEmCategory = (typeof PERSONAL_EM_CATEGORIES)[number]

export const PERSONAL_EM_FIELD_KEYS = [
  'groesse',
  'ablaufdatum',
  'schutzfristen',
  'waffennummer',
  'service',
  'magazinanzahl',
  'marke',
  'kaliber',
  'art',
  'patronen',
  'ablauf_mm_yyyy',
] as const

export type PersonalEmFieldKey = (typeof PERSONAL_EM_FIELD_KEYS)[number]

export const PERSONAL_EM_CATEGORY_LABELS: Record<PersonalEmCategory, string> = {
  schutzweste: 'Schutzweste',
  glock_17: 'Glock 17',
  munition: 'Munition',
  pfefferspray: 'Pfefferspray',
  schlagstock: 'Schlagstock',
  handfesseln: 'Handfesseln',
  taschenlampe_kelle: 'Taschenlampe + rote Kelle',
  leatherman: 'Leatherman',
  warnweste: 'Warnweste',
}

const FIELD_LABELS: Record<PersonalEmFieldKey, string> = {
  groesse: 'Größe',
  ablaufdatum: 'Ablaufdatum',
  schutzfristen: 'Schutzfristen',
  waffennummer: 'Waffennummer',
  service: 'Service',
  magazinanzahl: 'Magazinanzahl',
  marke: 'Marke',
  kaliber: 'Kaliber',
  art: 'Art',
  patronen: 'Ausgegebene Patronen',
  ablauf_mm_yyyy: 'Ablauf (MM/JJJJ)',
}

export const PERSONAL_EM_FIELDS: Record<PersonalEmCategory, readonly PersonalEmFieldKey[]> = {
  schutzweste: ['groesse', 'ablaufdatum', 'schutzfristen'],
  glock_17: ['waffennummer', 'service', 'magazinanzahl'],
  munition: ['marke', 'kaliber', 'art', 'patronen'],
  pfefferspray: ['ablauf_mm_yyyy'],
  schlagstock: [],
  handfesseln: [],
  taschenlampe_kelle: ['marke'],
  leatherman: ['marke'],
  warnweste: ['marke', 'groesse'],
}

export type PersonalEmFieldKind = 'text' | 'date' | 'integer' | 'month_year'

export function personalEmFieldKind(field: PersonalEmFieldKey): PersonalEmFieldKind {
  if (field === 'ablaufdatum') return 'date'
  if (field === 'magazinanzahl' || field === 'patronen') return 'integer'
  if (field === 'ablauf_mm_yyyy') return 'month_year'
  return 'text'
}

export function personalEmFieldLabel(field: PersonalEmFieldKey, category: PersonalEmCategory): string {
  if (field === 'marke' && (category === 'taschenlampe_kelle' || category === 'leatherman')) {
    return 'Marke/Type'
  }
  return FIELD_LABELS[field]
}

export function isPersonalEmCategory(value: string): value is PersonalEmCategory {
  return (PERSONAL_EM_CATEGORIES as readonly string[]).includes(value)
}

export type PersonalEmFormValues = Record<PersonalEmFieldKey, string>

export function emptyPersonalEmFormValues(): PersonalEmFormValues {
  return {
    groesse: '',
    ablaufdatum: '',
    schutzfristen: '',
    waffennummer: '',
    service: '',
    magazinanzahl: '',
    marke: '',
    kaliber: '',
    art: '',
    patronen: '',
    ablauf_mm_yyyy: '',
  }
}

export type PersonalEmPayload = {
  category: PersonalEmCategory
  officer_id: string | null
  verwahrungsort: Verwahrungsort | null
  groesse: string | null
  ablaufdatum: string | null
  schutzfristen: string | null
  waffennummer: string | null
  service: string | null
  magazinanzahl: number | null
  marke: string | null
  kaliber: string | null
  art: string | null
  patronen: number | null
  ablauf_mm_yyyy: string | null
}

export type PersonalEmValidateOk = { ok: true; payload: PersonalEmPayload }
export type PersonalEmValidateErr = { ok: false; error: string }
export type PersonalEmValidateResult = PersonalEmValidateOk | PersonalEmValidateErr

const ABLAUF_MM_YYYY_RE = /^(0[1-9]|1[0-2])\/[0-9]{4}$/

export function normalizeAblaufMmYyyy(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, value: null }
  const match = trimmed.match(/^(\d{1,2})\s*\/\s*(\d{4})$/)
  if (!match) return { ok: false, error: 'Ablauf bitte als MM/JJJJ eingeben.' }
  const month = Number(match[1])
  if (month < 1 || month > 12) return { ok: false, error: 'Ablauf bitte als MM/JJJJ eingeben.' }
  const value = `${String(month).padStart(2, '0')}/${match[2]}`
  if (!ABLAUF_MM_YYYY_RE.test(value)) return { ok: false, error: 'Ablauf bitte als MM/JJJJ eingeben.' }
  return { ok: true, value }
}

function parseOptionalInt(raw: string, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, value: null }
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: `${label} muss eine ganze Zahl sein.` }
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value) || value < 0) return { ok: false, error: `${label} muss 0 oder größer sein.` }
  return { ok: true, value }
}

function optionalText(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function validatePersonalEm(input: {
  category: string
  officer_id: string
  verwahrungsort?: string
  values: PersonalEmFormValues
}): PersonalEmValidateResult {
  if (!isPersonalEmCategory(input.category)) {
    return { ok: false, error: 'Bitte eine Kategorie wählen.' }
  }

  const officerId = input.officer_id.trim() || null
  const ortRaw = (input.verwahrungsort ?? '').trim()
  let verwahrungsort: Verwahrungsort | null = null
  if (ortRaw) {
    if (!isVerwahrungsort(ortRaw)) {
      return { ok: false, error: 'Bitte einen gültigen Verwahrungsort wählen.' }
    }
    verwahrungsort = ortRaw
  }
  if (!officerId && !verwahrungsort) {
    return { ok: false, error: 'Bitte einen Polizisten zuweisen oder einen Verwahrungsort wählen.' }
  }

  const allowed = new Set(PERSONAL_EM_FIELDS[input.category])
  const payload: PersonalEmPayload = {
    category: input.category,
    officer_id: officerId,
    verwahrungsort,
    groesse: null,
    ablaufdatum: null,
    schutzfristen: null,
    waffennummer: null,
    service: null,
    magazinanzahl: null,
    marke: null,
    kaliber: null,
    art: null,
    patronen: null,
    ablauf_mm_yyyy: null,
  }

  for (const field of PERSONAL_EM_FIELD_KEYS) {
    if (!allowed.has(field)) continue
    const raw = input.values[field]
    const kind = personalEmFieldKind(field)
    const label = personalEmFieldLabel(field, input.category)
    if (kind === 'integer') {
      const parsed = parseOptionalInt(raw, label)
      if (!parsed.ok) return parsed
      if (field === 'magazinanzahl') payload.magazinanzahl = parsed.value
      if (field === 'patronen') payload.patronen = parsed.value
      continue
    }
    if (kind === 'month_year') {
      const parsed = normalizeAblaufMmYyyy(raw)
      if (!parsed.ok) return parsed
      payload.ablauf_mm_yyyy = parsed.value
      continue
    }
    const text = optionalText(raw)
    if (field === 'groesse') payload.groesse = text
    else if (field === 'ablaufdatum') payload.ablaufdatum = text
    else if (field === 'schutzfristen') payload.schutzfristen = text
    else if (field === 'waffennummer') payload.waffennummer = text
    else if (field === 'service') payload.service = text
    else if (field === 'marke') payload.marke = text
    else if (field === 'kaliber') payload.kaliber = text
    else if (field === 'art') payload.art = text
  }

  return { ok: true, payload }
}

export function formValuesFromRecord(record: {
  groesse: string | null
  ablaufdatum: string | null
  schutzfristen: string | null
  waffennummer: string | null
  service: string | null
  magazinanzahl: number | null
  marke: string | null
  kaliber: string | null
  art: string | null
  patronen: number | null
  ablauf_mm_yyyy: string | null
}): PersonalEmFormValues {
  return {
    groesse: record.groesse ?? '',
    ablaufdatum: record.ablaufdatum ?? '',
    schutzfristen: record.schutzfristen ?? '',
    waffennummer: record.waffennummer ?? '',
    service: record.service ?? '',
    magazinanzahl: record.magazinanzahl == null ? '' : String(record.magazinanzahl),
    marke: record.marke ?? '',
    kaliber: record.kaliber ?? '',
    art: record.art ?? '',
    patronen: record.patronen == null ? '' : String(record.patronen),
    ablauf_mm_yyyy: record.ablauf_mm_yyyy ?? '',
  }
}

export function formatIsoDate(value: string | null | undefined): string {
  if (!value) return ''
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return value
  return `${match[3]}.${match[2]}.${match[1]}`
}

export function formatPersonalEmFieldValue(
  field: PersonalEmFieldKey,
  value: string | number | null | undefined,
): string {
  if (value == null || value === '') return ''
  if (field === 'ablaufdatum' && typeof value === 'string') return formatIsoDate(value)
  return String(value)
}

export function personalEmDetailText(record: {
  category: PersonalEmCategory
  groesse: string | null
  ablaufdatum: string | null
  schutzfristen: string | null
  waffennummer: string | null
  service: string | null
  magazinanzahl: number | null
  marke: string | null
  kaliber: string | null
  art: string | null
  patronen: number | null
  ablauf_mm_yyyy: string | null
}): string {
  const parts: string[] = []
  for (const field of PERSONAL_EM_FIELDS[record.category]) {
    const raw = record[field]
    const formatted = formatPersonalEmFieldValue(field, raw)
    if (!formatted) continue
    parts.push(`${personalEmFieldLabel(field, record.category)}: ${formatted}`)
  }
  return parts.join(' · ')
}

export function officerDisplayName(officer: {
  name?: string | null
  username?: string | null
  dienstnummer?: string | null
} | null | undefined): string {
  if (!officer) return '–'
  const name = officer.name?.trim() || officer.username?.trim() || '–'
  if (officer.dienstnummer?.trim()) return `${name} (${officer.dienstnummer.trim()})`
  return name
}

export function personalEmOfficerLabel(
  officer: {
    name?: string | null
    username?: string | null
    dienstnummer?: string | null
  } | null | undefined,
  officerId: string | null | undefined,
): string {
  if (!officerId) return 'nicht zugewiesen'
  return officerDisplayName(officer)
}

export function personalEmLocationLabel(verwahrungsort: string | null | undefined): string {
  if (!verwahrungsort) return 'Beim Polizisten'
  if (isVerwahrungsort(verwahrungsort)) return VERWAHRUNGSORT_LABELS[verwahrungsort]
  return verwahrungsort
}

export function isPersonalEmInLager(item: { verwahrungsort?: string | null; removed_at?: string | null }): boolean {
  return item.verwahrungsort === 'lager' && !item.removed_at
}

export type PersonalLagerbestandRow = {
  category: PersonalEmCategory
  count: number
}

/** Eine Zeile = 1 Stück. Nur verwahrungsort = lager. Ausgebuchte zählen nicht. */
export function aggregatePersonalLagerbestand(
  items: readonly { category: string; verwahrungsort?: string | null; removed_at?: string | null }[],
): PersonalLagerbestandRow[] {
  const rows: PersonalLagerbestandRow[] = PERSONAL_EM_CATEGORIES.map(category => ({
    category,
    count: 0,
  }))
  const index = new Map(rows.map(row => [row.category, row]))
  for (const item of items) {
    if (!isPersonalEmInLager(item) || !isPersonalEmCategory(item.category)) continue
    const row = index.get(item.category)
    if (row) row.count += 1
  }
  return rows
}

export function personalItemsInLager<T extends { verwahrungsort?: string | null }>(items: readonly T[]): T[] {
  return items.filter(isPersonalEmInLager)
}

export function toPersonalLagerAssignment(): { officer_id: null; verwahrungsort: 'lager' } {
  return { officer_id: null, verwahrungsort: 'lager' }
}

export function canManagePersonalEinsatzmittel(input: {
  isStrictAdmin: boolean
  rows: readonly { area: string; roles: string[] }[] | null
}): boolean {
  if (input.isStrictAdmin) return true
  if (input.rows === null) return false
  const role = parseEinsatzMtRole(rolesForArea(input.rows, 'einsatz_mt'))
  return role === 'sachbearbeiter' || role === 'admin'
}
