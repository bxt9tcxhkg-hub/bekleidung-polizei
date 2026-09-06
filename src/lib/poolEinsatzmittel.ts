/**
 * Pool-Einsatzmittel und Verwahrungsorte (Phase 2b).
 *
 * Eine Tabelle `pool_einsatzmittel` mit category + typisierten nullable
 * Spalten (gleiches Modell wie persönliche EM). Verwahrungsort ist ein
 * festes Lookup (CHECK), keine Extra-Tabelle.
 * Schreiben: einsatz_mt Sachbearbeiter/Admin oder globales profiles.admin.
 * Lesen: SB/Admin alle Kategorien; Benutzer Pool ohne Munition.
 * Lagerbestand ist eine abgeleitete Übersicht, keine eigene Tabelle.
 */

import { parseEinsatzMtRole, rolesForArea } from './portalEntitlements'
import { formatIsoDate } from './personalEinsatzmittel'
import {
  isLagerOrt,
  isVerwahrungsort,
  VERWAHRUNGSORTE,
  VERWAHRUNGSORT_LABELS,
  type Verwahrungsort,
} from './verwahrungsort'

export {
  isLagerOrt,
  isVerwahrungsort,
  VERWAHRUNGSORTE,
  VERWAHRUNGSORT_LABELS,
  type Verwahrungsort,
}

export const POOL_EM_CATEGORIES = [
  'langwaffe_stg77',
  'magazine',
  'munition',
  'pfefferspray_gross',
  'schild',
  'ballistischer_helm',
  'schwere_westen',
  'spuckschutzhaube',
] as const

export type PoolEmCategory = (typeof POOL_EM_CATEGORIES)[number]

export const POOL_EM_FIELD_KEYS = [
  'marke',
  'typ',
  'waffennummer',
  'kaliber',
  'art',
  'anzahl',
  'groessen',
  'ablaufdatum',
] as const

export type PoolEmFieldKey = (typeof POOL_EM_FIELD_KEYS)[number]

export const POOL_EM_CATEGORY_LABELS: Record<PoolEmCategory, string> = {
  langwaffe_stg77: 'Langwaffen Stg77',
  magazine: 'Magazine',
  munition: 'Munition (Pool)',
  pfefferspray_gross: 'großes Pfefferspray',
  schild: 'Schild',
  ballistischer_helm: 'ballistischer Helm',
  schwere_westen: 'schwere Westen',
  spuckschutzhaube: 'Spuckschutzhaube',
}

const FIELD_LABELS: Record<PoolEmFieldKey, string> = {
  marke: 'Marke',
  typ: 'Type',
  waffennummer: 'Waffennummer',
  kaliber: 'Kaliber',
  art: 'Art',
  anzahl: 'Anzahl',
  groessen: 'Größen',
  ablaufdatum: 'Ablauf',
}

/**
 * Felder je Kategorie laut Owner. Verwahrungsort ist Pflicht für alle
 * Pool-Zeilen (auch Magazine) und liegt außerhalb dieser Liste.
 */
export const POOL_EM_FIELDS: Record<PoolEmCategory, readonly PoolEmFieldKey[]> = {
  langwaffe_stg77: ['marke', 'typ', 'waffennummer', 'kaliber'],
  magazine: ['anzahl'],
  munition: ['marke', 'typ', 'art', 'anzahl'],
  pfefferspray_gross: ['marke', 'anzahl', 'ablaufdatum'],
  schild: ['marke', 'anzahl'],
  ballistischer_helm: ['ablaufdatum', 'anzahl'],
  schwere_westen: ['marke', 'anzahl', 'groessen', 'ablaufdatum'],
  spuckschutzhaube: ['anzahl'],
}

export type PoolEmFieldKind = 'text' | 'date' | 'integer'

export function poolEmFieldKind(field: PoolEmFieldKey): PoolEmFieldKind {
  if (field === 'ablaufdatum') return 'date'
  if (field === 'anzahl') return 'integer'
  return 'text'
}

export function poolEmFieldLabel(field: PoolEmFieldKey, category: PoolEmCategory): string {
  if (field === 'anzahl' && category === 'munition') return 'Menge'
  return FIELD_LABELS[field]
}

export function isPoolEmCategory(value: string): value is PoolEmCategory {
  return (POOL_EM_CATEGORIES as readonly string[]).includes(value)
}

export type PoolEmFormValues = Record<PoolEmFieldKey, string>

export function emptyPoolEmFormValues(): PoolEmFormValues {
  return {
    marke: '',
    typ: '',
    waffennummer: '',
    kaliber: '',
    art: '',
    anzahl: '',
    groessen: '',
    ablaufdatum: '',
  }
}

export type PoolEmPayload = {
  category: PoolEmCategory
  verwahrungsort: Verwahrungsort
  lager_notiz: string | null
  marke: string | null
  typ: string | null
  waffennummer: string | null
  kaliber: string | null
  art: string | null
  anzahl: number | null
  groessen: string | null
  ablaufdatum: string | null
}

export type PoolEmValidateOk = { ok: true; payload: PoolEmPayload }
export type PoolEmValidateErr = { ok: false; error: string }
export type PoolEmValidateResult = PoolEmValidateOk | PoolEmValidateErr

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

/** Lager-Notiz nur bei Ort Lager; sonst null (auch leerer Freitext). */
export function resolveLagerNotiz(verwahrungsort: string, raw: string | null | undefined): string | null {
  if (!isLagerOrt(verwahrungsort)) return null
  return optionalText(raw ?? '')
}

export function poolEmLocationLabel(
  verwahrungsort: Verwahrungsort,
  lagerNotiz?: string | null,
): string {
  const label = VERWAHRUNGSORT_LABELS[verwahrungsort]
  if (!isLagerOrt(verwahrungsort)) return label
  const note = lagerNotiz?.trim()
  return note ? `${label} · ${note}` : label
}

export function validatePoolEm(input: {
  category: string
  verwahrungsort: string
  values: PoolEmFormValues
  lagerNotiz?: string
}): PoolEmValidateResult {
  if (!isPoolEmCategory(input.category)) {
    return { ok: false, error: 'Bitte eine Kategorie wählen.' }
  }
  if (!isVerwahrungsort(input.verwahrungsort)) {
    return { ok: false, error: 'Bitte einen Verwahrungsort wählen.' }
  }

  const allowed = new Set(POOL_EM_FIELDS[input.category])
  const payload: PoolEmPayload = {
    category: input.category,
    verwahrungsort: input.verwahrungsort,
    lager_notiz: resolveLagerNotiz(input.verwahrungsort, input.lagerNotiz),
    marke: null,
    typ: null,
    waffennummer: null,
    kaliber: null,
    art: null,
    anzahl: null,
    groessen: null,
    ablaufdatum: null,
  }

  for (const field of POOL_EM_FIELD_KEYS) {
    if (!allowed.has(field)) continue
    const raw = input.values[field]
    const kind = poolEmFieldKind(field)
    const label = poolEmFieldLabel(field, input.category)
    if (kind === 'integer') {
      const parsed = parseOptionalInt(raw, label)
      if (!parsed.ok) return parsed
      payload.anzahl = parsed.value
      continue
    }
    const text = optionalText(raw)
    if (field === 'marke') payload.marke = text
    else if (field === 'typ') payload.typ = text
    else if (field === 'waffennummer') payload.waffennummer = text
    else if (field === 'kaliber') payload.kaliber = text
    else if (field === 'art') payload.art = text
    else if (field === 'groessen') payload.groessen = text
    else if (field === 'ablaufdatum') payload.ablaufdatum = text
  }

  return { ok: true, payload }
}

export function formValuesFromPoolRecord(record: {
  marke: string | null
  typ: string | null
  waffennummer: string | null
  kaliber: string | null
  art: string | null
  anzahl: number | null
  groessen: string | null
  ablaufdatum: string | null
}): PoolEmFormValues {
  return {
    marke: record.marke ?? '',
    typ: record.typ ?? '',
    waffennummer: record.waffennummer ?? '',
    kaliber: record.kaliber ?? '',
    art: record.art ?? '',
    anzahl: record.anzahl == null ? '' : String(record.anzahl),
    groessen: record.groessen ?? '',
    ablaufdatum: record.ablaufdatum ?? '',
  }
}

export function formatPoolEmFieldValue(
  field: PoolEmFieldKey,
  value: string | number | null | undefined,
): string {
  if (value == null || value === '') return ''
  if (field === 'ablaufdatum' && typeof value === 'string') return formatIsoDate(value)
  return String(value)
}

export function poolEmDetailText(record: {
  category: PoolEmCategory
  verwahrungsort: Verwahrungsort
  marke: string | null
  typ: string | null
  waffennummer: string | null
  kaliber: string | null
  art: string | null
  anzahl: number | null
  groessen: string | null
  ablaufdatum: string | null
}): string {
  const parts: string[] = []
  for (const field of POOL_EM_FIELDS[record.category]) {
    const raw = record[field]
    const formatted = formatPoolEmFieldValue(field, raw)
    if (!formatted) continue
    parts.push(`${poolEmFieldLabel(field, record.category)}: ${formatted}`)
  }
  return parts.join(' · ')
}

/** Langwaffen: eine Zeile = 1 Stück. Übrige: Summe von Anzahl/Menge (fehlend = 0). */
export function poolEmStockQuantity(item: {
  category: PoolEmCategory
  anzahl: number | null
}): number {
  if (item.category === 'langwaffe_stg77') return 1
  return item.anzahl ?? 0
}

export type LagerbestandRow = {
  category: PoolEmCategory
  byOrt: Record<Verwahrungsort, number>
  total: number
}

export function emptyOrtCounts(): Record<Verwahrungsort, number> {
  return Object.fromEntries(VERWAHRUNGSORTE.map(ort => [ort, 0])) as Record<Verwahrungsort, number>
}

export function aggregateLagerbestand(
  items: readonly {
    category: PoolEmCategory
    verwahrungsort: Verwahrungsort
    anzahl: number | null
    removed_at?: string | null
  }[],
): LagerbestandRow[] {
  const rows: LagerbestandRow[] = POOL_EM_CATEGORIES.map(category => ({
    category,
    byOrt: emptyOrtCounts(),
    total: 0,
  }))
  const index = new Map(rows.map(row => [row.category, row]))
  for (const item of items) {
    if (item.removed_at) continue
    if (!isPoolEmCategory(item.category) || !isVerwahrungsort(item.verwahrungsort)) continue
    const row = index.get(item.category)
    if (!row) continue
    const qty = poolEmStockQuantity(item)
    row.byOrt[item.verwahrungsort] += qty
    row.total += qty
  }
  return rows
}

export function canManagePoolEinsatzmittel(input: {
  isStrictAdmin: boolean
  rows: readonly { area: string; roles: string[] }[] | null
}): boolean {
  if (input.isStrictAdmin) return true
  if (input.rows === null) return false
  const role = parseEinsatzMtRole(rolesForArea(input.rows, 'einsatz_mt'))
  return role === 'sachbearbeiter' || role === 'admin'
}

export const POOL_EM_RESTRICTED_CATEGORY: PoolEmCategory = 'munition'

export function isPoolMunitionCategory(category: string): boolean {
  return category === POOL_EM_RESTRICTED_CATEGORY
}

/** Benutzer sieht alle Pool-Kategorien außer Munitionsbestand. */
export function visiblePoolEmCategories(canManage: boolean): readonly PoolEmCategory[] {
  if (canManage) return POOL_EM_CATEGORIES
  return POOL_EM_CATEGORIES.filter(category => category !== POOL_EM_RESTRICTED_CATEGORY)
}

export function filterPoolItemsForViewer<T extends { category: string }>(
  items: readonly T[],
  canManage: boolean,
): T[] {
  if (canManage) return items.slice()
  return items.filter(item => item.category !== POOL_EM_RESTRICTED_CATEGORY)
}

export function sanitizePoolCategoryFilter<T extends string>(
  filter: T,
  canManage: boolean,
): T | 'all' {
  if (!canManage && filter === POOL_EM_RESTRICTED_CATEGORY) return 'all'
  return filter
}
