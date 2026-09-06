/**
 * Import der Einsatzmittel-Zuteilungsliste (persönliche EM).
 * Quelle: Einsatzmittel_Zuteilungsliste.pdf / zuteilung.txt (2026-09-06).
 * Keine erfundenen Offiziere — Zeilen ohne Profiltreffer werden übersprungen.
 */

import { parseCsvUsers, splitCsvLine } from './csvUsers'
import {
  emptyPersonalEmFormValues,
  isPersonalEmCategory,
  normalizeAblaufMmYyyy,
  validatePersonalEm,
  type PersonalEmCategory,
  type PersonalEmPayload,
} from './personalEinsatzmittel'
import { isVerwahrungsort, type Verwahrungsort } from './verwahrungsort'
import { normalizeDienstnummer } from './roleMatrix'

export const ZUTEILUNG_SOURCE = {
  folder: '2026-09-06-einsatztraining',
  files: ['zuteilung.txt', 'Einsatzmittel_Zuteilungsliste.pdf'],
} as const

export const ZUTEILUNG_CSV_TEMPLATE = `name;dienstnummer;verwahrungsort;glock_17;glock_26;steyer_m9;pfefferspray_ablauf;schlagstock_eka
`

export type ZuteilungSourceRow = {
  name?: string | null
  dienstnummer?: string | null
  verwahrungsort?: string | null
  glock_17?: string | null
  glock_26?: string | null
  steyer_m9?: string | null
  pfefferspray_ablauf?: string | null
  schlagstock_eka?: string | null
}

export type ZuteilungFile = {
  source?: { folder?: string; files?: string[] }
  rows: ZuteilungSourceRow[]
}

export type ZuteilungOfficerRef = {
  id: string
  name?: string | null
  dienstnummer?: string | null
}

export type ExistingPersonalEmRef = {
  category: string
  officer_id?: string | null
  verwahrungsort?: string | null
  waffennummer?: string | null
  marke?: string | null
  ablauf_mm_yyyy?: string | null
  removed_at?: string | null
}

export type ZuteilungSkip = {
  rowIndex: number
  reason: string
}

export type ZuteilungMappedItem = {
  rowIndex: number
  payload: PersonalEmPayload
  label: string
}

export type ZuteilungPlan = {
  inserts: ZuteilungMappedItem[]
  skipped: ZuteilungSkip[]
}

const WEAPON_COLUMNS = [
  { key: 'glock_17', modell: 'Glock 17' },
  { key: 'glock_26', modell: 'Glock 26' },
  { key: 'steyer_m9', modell: 'Steyer M9' },
] as const

export function parseQuarterAblauf(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, value: null }
  const quarter = trimmed.match(/^q\s*([1-4])\s*\/\s*(\d{4})$/i)
    ?? trimmed.match(/^([1-4])\.\s*quartal\s+(\d{4})$/i)
  if (quarter) {
    const month = String(Number(quarter[1]) * 3).padStart(2, '0')
    return normalizeAblaufMmYyyy(`${month}/${quarter[2]}`)
  }
  return normalizeAblaufMmYyyy(trimmed)
}

export function parseZuteilungOrt(raw: string | null | undefined): Verwahrungsort | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  if (isVerwahrungsort(trimmed)) return trimmed
  const compact = trimmed.toLowerCase().replace(/[\s_-]+/g, '')
  if (compact === 'peter1') return 'peter_1'
  if (compact === 'peter2') return 'peter_2'
  if (compact === 'peter30') return 'peter_30'
  if (compact === 'innendienst') return 'innendienst'
  if (compact === 'lager') return 'lager'
  return null
}

function textOrNull(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

export function parseZuteilungJson(text: string): { ok: true; file: ZuteilungFile } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Zuteilung-JSON ist ungültig.' }
  }
  if (Array.isArray(parsed)) {
    return { ok: true, file: { rows: parsed as ZuteilungSourceRow[] } }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Zuteilung-JSON muss ein Objekt mit rows oder ein Array sein.' }
  }
  const rec = parsed as { rows?: unknown }
  if (!Array.isArray(rec.rows)) {
    return { ok: false, error: 'Zuteilung-JSON braucht ein rows-Array.' }
  }
  return { ok: true, file: parsed as ZuteilungFile }
}

export function parseZuteilungCsv(text: string): ZuteilungSourceRow[] {
  const lines = text.trim().split(/\r?\n/).filter(line => line.trim())
  if (lines.length === 0) return []
  const header = splitCsvLine(lines[0], lines[0].includes(';') ? ';' : ',').map(h => h.toLowerCase())
  const looksLikeHeader = header.some(h =>
    ['name', 'dienstnummer', 'glock_17', 'glock 17', 'pfefferspray', 'schlagstock'].includes(h),
  )
  if (looksLikeHeader) {
    return parseCsvUsers(text).map(row => rowToZuteilung(row))
  }
  return []
}

function rowToZuteilung(row: Record<string, string>): ZuteilungSourceRow {
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const val = row[key] ?? row[key.toLowerCase()] ?? ''
      if (val.trim()) return val.trim()
    }
    return ''
  }
  return {
    name: get('name', 'nachname', 'offizier'),
    dienstnummer: get('dienstnummer', 'dn', 'dg', 'dienstnr'),
    verwahrungsort: get('verwahrungsort', 'ort', 'fahrzeug'),
    glock_17: get('glock_17', 'glock 17', 'glock17'),
    glock_26: get('glock_26', 'glock 26', 'glock26'),
    steyer_m9: get('steyer_m9', 'steyer m9', 'steyr m9', 'steyr_m9'),
    pfefferspray_ablauf: get('pfefferspray_ablauf', 'pfefferspray', 'spray'),
    schlagstock_eka: get('schlagstock_eka', 'schlagstock', 'eka'),
  }
}

export function parseZuteilungText(text: string): { ok: true; file: ZuteilungFile } | { ok: false; error: string } {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: 'Keine Zuteilungsdaten.' }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseZuteilungJson(trimmed)
  return { ok: true, file: { rows: parseZuteilungCsv(trimmed) } }
}

export function matchZuteilungOfficer(
  row: ZuteilungSourceRow,
  officers: readonly ZuteilungOfficerRef[],
): { ok: true; officer: ZuteilungOfficerRef } | { ok: false; reason: string } {
  const dn = normalizeDienstnummer(row.dienstnummer)
  if (dn) {
    const hits = officers.filter(o => normalizeDienstnummer(o.dienstnummer) === dn)
    if (hits.length === 1) return { ok: true, officer: hits[0] }
    if (hits.length > 1) return { ok: false, reason: `Dienstnummer ${dn} ist nicht eindeutig.` }
    return { ok: false, reason: `Kein Profil mit Dienstnummer ${dn}.` }
  }
  const name = row.name?.trim().toLowerCase()
  if (name) {
    const hits = officers.filter(o => (o.name ?? '').trim().toLowerCase() === name)
    if (hits.length === 1) return { ok: true, officer: hits[0] }
    if (hits.length > 1) return { ok: false, reason: `Name «${row.name}» ist nicht eindeutig.` }
    return { ok: false, reason: `Kein Profil mit Namen «${row.name}».` }
  }
  return { ok: false, reason: 'Weder Dienstnummer noch Name angegeben.' }
}

function identifierOf(item: {
  category: string
  waffennummer?: string | null
  marke?: string | null
  ablauf_mm_yyyy?: string | null
}): string {
  if (item.category === 'glock_17') return (item.waffennummer ?? '').trim().toLowerCase()
  if (item.category === 'schlagstock') return (item.marke ?? '').trim().toLowerCase()
  if (item.category === 'pfefferspray') return (item.ablauf_mm_yyyy ?? '').trim().toLowerCase()
  return ''
}

function alreadyExists(
  payload: PersonalEmPayload,
  existing: readonly ExistingPersonalEmRef[],
): ExistingPersonalEmRef | undefined {
  const ident = identifierOf(payload)
  return existing.find(row => {
    if (row.category !== payload.category) return false
    if ((row.officer_id ?? null) !== payload.officer_id) return false
    if ((row.verwahrungsort ?? null) !== payload.verwahrungsort) return false
    return identifierOf(row) === ident
  })
}

function personalPayload(input: {
  category: PersonalEmCategory
  officerId: string
  verwahrungsort: string
  values: ReturnType<typeof emptyPersonalEmFormValues>
}): { ok: true; payload: PersonalEmPayload } | { ok: false; error: string } {
  if (!isPersonalEmCategory(input.category)) {
    return { ok: false, error: 'Ungültige Kategorie.' }
  }
  return validatePersonalEm({
    category: input.category,
    officer_id: input.officerId,
    verwahrungsort: input.verwahrungsort,
    values: input.values,
  })
}

export function planZuteilungImport(input: {
  rows: readonly ZuteilungSourceRow[]
  officers: readonly ZuteilungOfficerRef[]
  existing: readonly ExistingPersonalEmRef[]
}): ZuteilungPlan {
  const inserts: ZuteilungMappedItem[] = []
  const skipped: ZuteilungSkip[] = []
  const planned = [...input.existing]

  input.rows.forEach((row, index) => {
    const rowIndex = index + 1
    const ort = parseZuteilungOrt(row.verwahrungsort)
    const hasOfficerHint = Boolean(textOrNull(row.name) || textOrNull(row.dienstnummer))
    let officerId = ''
    if (hasOfficerHint) {
      const match = matchZuteilungOfficer(row, input.officers)
      if (!match.ok) {
        skipped.push({ rowIndex, reason: match.reason })
        return
      }
      officerId = match.officer.id
    } else if (!ort) {
      skipped.push({ rowIndex, reason: 'Weder Profil noch Verwahrungsort — übersprungen (keine erfundenen Offiziere).' })
      return
    }

    const items: { category: PersonalEmCategory; values: ReturnType<typeof emptyPersonalEmFormValues>; label: string }[] = []

    for (const weapon of WEAPON_COLUMNS) {
      const number = textOrNull(row[weapon.key])
      if (!number) continue
      items.push({
        category: 'glock_17',
        label: `${weapon.modell} ${number}`,
        values: { ...emptyPersonalEmFormValues(), marke: weapon.modell, waffennummer: number },
      })
    }

    const spray = textOrNull(row.pfefferspray_ablauf)
    if (spray) {
      const parsed = parseQuarterAblauf(spray)
      if (!parsed.ok) {
        skipped.push({ rowIndex, reason: parsed.error })
      } else {
        items.push({
          category: 'pfefferspray',
          label: `Pfefferspray ${parsed.value ?? spray}`,
          values: { ...emptyPersonalEmFormValues(), ablauf_mm_yyyy: parsed.value ?? '' },
        })
      }
    }

    const eka = textOrNull(row.schlagstock_eka)
    if (eka) {
      items.push({
        category: 'schlagstock',
        label: `Schlagstock ${eka}`,
        values: { ...emptyPersonalEmFormValues(), marke: eka },
      })
    }

    if (items.length === 0) {
      skipped.push({ rowIndex, reason: 'Keine Waffe, Spray oder Schlagstock in der Zeile.' })
      return
    }

    for (const item of items) {
      const validated = personalPayload({
        category: item.category,
        officerId,
        verwahrungsort: ort ?? '',
        values: item.values,
      })
      if (!validated.ok) {
        skipped.push({ rowIndex, reason: validated.error })
        continue
      }
      const prior = alreadyExists(validated.payload, planned)
      if (prior) {
        skipped.push({
          rowIndex,
          reason: prior.removed_at
            ? `${item.label} ist ausgebucht — nicht erneut angelegt.`
            : `${item.label} ist bereits erfasst.`,
        })
        continue
      }
      inserts.push({ rowIndex, payload: validated.payload, label: item.label })
      planned.push({
        category: validated.payload.category,
        officer_id: validated.payload.officer_id,
        verwahrungsort: validated.payload.verwahrungsort,
        waffennummer: validated.payload.waffennummer,
        marke: validated.payload.marke,
        ablauf_mm_yyyy: validated.payload.ablauf_mm_yyyy,
        removed_at: null,
      })
    }
  })

  return { inserts, skipped }
}
