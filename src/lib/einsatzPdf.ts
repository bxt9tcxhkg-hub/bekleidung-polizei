/**
 * Interne PDF-Berichte für Einsatzmittel und Training.
 * Nutzt dieselbe Print-HTML-Technik wie Kurzbrief/Ausgabeliste (kein jsPDF).
 * Keine Dienstregeln oder BMI-Formulare — nur lesbare Bestands- und Protokollberichte.
 */

import { activeEinsatzmittel } from './einsatzmittelAusbuchung'
import {
  ATTENDANCE_STATUS_LABELS,
  TRAINING_KIND_LABELS,
  formatCompletedOn,
  formatMunitionVerbrauch,
  isAttendanceStatus,
  isTrainingKind,
  type TrainingKind,
} from './einsatztraining'
import { escHtml, openPrintHtml } from './printDocs'
import {
  PERSONAL_EM_CATEGORY_LABELS,
  isPersonalEmCategory,
  officerDisplayName,
  personalEmDetailText,
  personalEmLocationLabel,
  personalEmOfficerLabel,
  type PersonalEmCategory,
} from './personalEinsatzmittel'
import {
  POOL_EM_CATEGORY_LABELS,
  VERWAHRUNGSORTE,
  VERWAHRUNGSORT_LABELS,
  isPoolEmCategory,
  isVerwahrungsort,
  poolEmDetailText,
  poolEmLocationLabel,
  type LagerbestandRow,
  type PoolEmCategory,
} from './poolEinsatzmittel'
import type { PersonalLagerbestandRow } from './personalEinsatzmittel'

export const PDF_UNASSIGNED_OFFICER = '__unassigned__'

const DE_MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

export function reportDateLong(now: Date): string {
  return `${String(now.getDate()).padStart(2, '0')}. ${DE_MONTHS[now.getMonth()]} ${now.getFullYear()}`
}

export function compareDe(a: string, b: string): number {
  return a.localeCompare(b, 'de', { sensitivity: 'base' })
}

export type PersonalEmPdfRecord = {
  category: string
  officer_id: string | null
  verwahrungsort: string | null
  removed_at?: string | null
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
  officer?: {
    name?: string | null
    username?: string | null
    dienstnummer?: string | null
  } | null
}

export type PoolEmPdfRecord = {
  category: string
  verwahrungsort: string
  lager_notiz?: string | null
  removed_at?: string | null
  marke: string | null
  typ: string | null
  waffennummer: string | null
  kaliber: string | null
  art: string | null
  anzahl: number | null
  groessen: string | null
  ablaufdatum: string | null
}

export type TrainingAttendancePdfRow = {
  officer_id: string
  status: string
  officer?: {
    name?: string | null
    username?: string | null
    dienstnummer?: string | null
  } | null
}

export type TrainingParticipationPdfRow = {
  officer_id: string
  interval_label: string | null
  module?: { name?: string | null } | null
  officer?: {
    name?: string | null
    username?: string | null
    dienstnummer?: string | null
  } | null
}

export type TrainingSessionPdfRecord = {
  kind: string
  session_date: string
  note?: string | null
  munition_anzahl?: number | null
  munition_marke?: string | null
  munition_kaliber?: string | null
  munition_art?: string | null
}

export type TrainingModulePdfRow = {
  name: string
  kind: TrainingKind
  active: boolean
  completionCount: number
}

export type TrainingCompletionPdfRow = {
  officerName: string
  moduleName: string
  kind: TrainingKind
  completedOn: string
}

export function filterPersonalEmForPdf<T extends PersonalEmPdfRecord>(
  items: readonly T[],
  officerId?: string | null,
): T[] {
  const active = activeEinsatzmittel(items)
  if (!officerId) return active
  if (officerId === PDF_UNASSIGNED_OFFICER) return active.filter(item => !item.officer_id)
  return active.filter(item => item.officer_id === officerId)
}

export function filterPoolEmForPdf<T extends PoolEmPdfRecord>(
  items: readonly T[],
  verwahrungsort?: string | null,
): T[] {
  const active = activeEinsatzmittel(items)
  if (!verwahrungsort) return active
  return active.filter(item => item.verwahrungsort === verwahrungsort)
}

function personalCategoryLabel(category: string): string {
  return isPersonalEmCategory(category) ? PERSONAL_EM_CATEGORY_LABELS[category] : category
}

function poolCategoryLabel(category: string): string {
  return isPoolEmCategory(category) ? POOL_EM_CATEGORY_LABELS[category] : category
}

function asPersonalDetail(item: PersonalEmPdfRecord): string {
  if (!isPersonalEmCategory(item.category)) return ''
  return personalEmDetailText({ ...item, category: item.category as PersonalEmCategory })
}

function asPoolDetail(item: PoolEmPdfRecord): string {
  if (!isPoolEmCategory(item.category) || !isVerwahrungsort(item.verwahrungsort)) return ''
  return poolEmDetailText({
    ...item,
    category: item.category as PoolEmCategory,
    verwahrungsort: item.verwahrungsort,
  })
}

function officerSortKey(item: PersonalEmPdfRecord): string {
  if (!item.officer_id) return '\uFFFF'
  return officerDisplayName(item.officer)
}

export function sortPersonalEmForPdf<T extends PersonalEmPdfRecord>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const byOfficer = compareDe(officerSortKey(a), officerSortKey(b))
    if (byOfficer !== 0) return byOfficer
    const byCat = compareDe(personalCategoryLabel(a.category), personalCategoryLabel(b.category))
    if (byCat !== 0) return byCat
    return compareDe(a.waffennummer ?? '', b.waffennummer ?? '')
  })
}

export function sortPoolEmForPdf<T extends PoolEmPdfRecord>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const locA = isVerwahrungsort(a.verwahrungsort)
      ? poolEmLocationLabel(a.verwahrungsort, a.lager_notiz)
      : a.verwahrungsort
    const locB = isVerwahrungsort(b.verwahrungsort)
      ? poolEmLocationLabel(b.verwahrungsort, b.lager_notiz)
      : b.verwahrungsort
    const byLoc = compareDe(locA, locB)
    if (byLoc !== 0) return byLoc
    const byCat = compareDe(poolCategoryLabel(a.category), poolCategoryLabel(b.category))
    if (byCat !== 0) return byCat
    return compareDe(a.waffennummer ?? '', b.waffennummer ?? '')
  })
}

function personalFilterNote(officerId?: string | null, officerLabel?: string | null): string {
  if (!officerId) return 'Aktive persönliche Einsatzmittel (alle Polizisten)'
  if (officerId === PDF_UNASSIGNED_OFFICER) return 'Aktive persönliche Einsatzmittel · nicht zugewiesen'
  return `Aktive persönliche Einsatzmittel · ${officerLabel?.trim() || 'Polizist'}`
}

function poolFilterNote(verwahrungsort?: string | null): string {
  if (!verwahrungsort) return 'Aktive Pool-Einsatzmittel (alle Verwahrungsorte)'
  const label = isVerwahrungsort(verwahrungsort)
    ? VERWAHRUNGSORT_LABELS[verwahrungsort]
    : verwahrungsort
  return `Aktive Pool-Einsatzmittel · ${label}`
}

function emptyRow(colspan: number, text: string): string {
  return `<tr><td colspan="${colspan}" class="empty">${escHtml(text)}</td></tr>`
}

function personalRowsHtml(items: readonly PersonalEmPdfRecord[]): string {
  if (items.length === 0) {
    return emptyRow(4, 'Keine aktiven persönlichen Einsatzmittel.')
  }
  return sortPersonalEmForPdf(items).map(item => {
    const category = personalCategoryLabel(item.category)
    const officer = personalEmOfficerLabel(item.officer, item.officer_id)
    const location = personalEmLocationLabel(item.verwahrungsort)
    const detail = asPersonalDetail(item) || '–'
    return `<tr>
      <td>${escHtml(category)}</td>
      <td>${escHtml(officer)}</td>
      <td>${escHtml(location)}</td>
      <td>${escHtml(detail)}</td>
    </tr>`
  }).join('\n')
}

function poolRowsHtml(items: readonly PoolEmPdfRecord[]): string {
  if (items.length === 0) {
    return emptyRow(3, 'Keine aktiven Pool-Einsatzmittel.')
  }
  return sortPoolEmForPdf(items).map(item => {
    const category = poolCategoryLabel(item.category)
    const location = isVerwahrungsort(item.verwahrungsort)
      ? poolEmLocationLabel(item.verwahrungsort, item.lager_notiz)
      : item.verwahrungsort
    const detail = asPoolDetail(item) || '–'
    return `<tr>
      <td>${escHtml(category)}</td>
      <td>${escHtml(location)}</td>
      <td>${escHtml(detail)}</td>
    </tr>`
  }).join('\n')
}

function reportChrome(input: {
  title: string
  subtitle: string
  body: string
  entryCount: number
  now: Date
}): string {
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>${escHtml(input.title)}</title><style>
  @page { size: A4; margin: 14mm 14mm 16mm 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #111; line-height: 1.4; }
  .page-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #166534; padding-bottom: 8px; margin-bottom: 14px; }
  .page-title { font-size: 16pt; font-weight: bold; color: #14532d; }
  .page-org { font-size: 9pt; color: #3f6212; margin-top: 2px; }
  .page-meta { font-size: 9pt; color: #444; text-align: right; }
  .subtitle { font-size: 9.5pt; color: #3f3f3f; margin-bottom: 10px; }
  .section { margin-top: 16px; break-inside: avoid; }
  .section h2 { font-size: 11pt; color: #14532d; border-left: 4px solid #166534; padding-left: 8px; margin-bottom: 6px; }
  .meta-table { border-collapse: collapse; margin-bottom: 10px; }
  .meta-table td { padding: 2px 10px 2px 0; font-size: 10pt; vertical-align: top; }
  .meta-table td:first-child { color: #3f6212; font-weight: 600; white-space: nowrap; padding-right: 12px; }
  table.report { width: 100%; border-collapse: collapse; font-size: 9pt; }
  table.report th { background: #dcfce7; color: #14532d; font-weight: 600; padding: 5px 6px; border: 1px solid #86efac; text-align: left; }
  table.report td { padding: 4px 6px; border: 1px solid #bbf7d0; vertical-align: top; }
  table.report td.num, table.report th.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.report td.empty { text-align: center; color: #666; font-style: italic; }
  .foot { margin-top: 16px; font-size: 8pt; color: #666; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <div class="page-header">
    <div>
      <div class="page-title">${escHtml(input.title)}</div>
      <div class="page-org">Stadtpolizei Dornbirn · interner Bericht</div>
    </div>
    <div class="page-meta">Erstellt: ${escHtml(reportDateLong(input.now))}<br>Einträge: ${input.entryCount}</div>
  </div>
  <p class="subtitle">${escHtml(input.subtitle)}</p>
  ${input.body}
  <p class="foot">Nur für den internen Dienstgebrauch. Kein amtliches Formular.</p>
</body></html>`
}

export function buildPersonalEmPdfHtml(
  items: readonly PersonalEmPdfRecord[],
  options: { officerId?: string | null; officerLabel?: string | null; now?: Date } = {},
): string {
  const filtered = filterPersonalEmForPdf(items, options.officerId)
  const now = options.now ?? new Date()
  const body = `<table class="report">
    <thead><tr>
      <th>Kategorie</th>
      <th>Polizist</th>
      <th>Verwahrungsort</th>
      <th>Kennung / Angaben</th>
    </tr></thead>
    <tbody>${personalRowsHtml(filtered)}</tbody>
  </table>`
  return reportChrome({
    title: 'Persönliche Einsatzmittel',
    subtitle: personalFilterNote(options.officerId, options.officerLabel),
    body,
    entryCount: filtered.length,
    now,
  })
}

export function buildPoolEmPdfHtml(
  items: readonly PoolEmPdfRecord[],
  options: { verwahrungsort?: string | null; now?: Date } = {},
): string {
  const filtered = filterPoolEmForPdf(items, options.verwahrungsort)
  const now = options.now ?? new Date()
  const body = `<table class="report">
    <thead><tr>
      <th>Kategorie</th>
      <th>Verwahrungsort</th>
      <th>Kennung / Angaben</th>
    </tr></thead>
    <tbody>${poolRowsHtml(filtered)}</tbody>
  </table>`
  return reportChrome({
    title: 'Pool-Einsatzmittel',
    subtitle: poolFilterNote(options.verwahrungsort),
    body,
    entryCount: filtered.length,
    now,
  })
}

export function buildLagerbestandPdfHtml(input: {
  poolRows: readonly LagerbestandRow[]
  personalCounts: readonly PersonalLagerbestandRow[]
  personalItems: readonly PersonalEmPdfRecord[]
  now?: Date
}): string {
  const now = input.now ?? new Date()
  const ortHeaders = VERWAHRUNGSORTE.map(ort =>
    `<th class="num">${escHtml(VERWAHRUNGSORT_LABELS[ort])}</th>`,
  ).join('')
  const poolBody = input.poolRows.map(row => {
    const cells = VERWAHRUNGSORTE.map(ort =>
      `<td class="num">${row.byOrt[ort]}</td>`,
    ).join('')
    return `<tr>
      <td>${escHtml(POOL_EM_CATEGORY_LABELS[row.category])}</td>
      ${cells}
      <td class="num">${row.total}</td>
    </tr>`
  }).join('\n')

  const personalCountBody = input.personalCounts.map(row =>
    `<tr>
      <td>${escHtml(PERSONAL_EM_CATEGORY_LABELS[row.category])}</td>
      <td class="num">${row.count}</td>
    </tr>`,
  ).join('\n')

  const personalDetail = input.personalItems.length === 0
    ? emptyRow(3, 'Keine persönlichen Stücke eingelagert.')
    : input.personalItems.map(item => {
      const kennung = item.waffennummer?.trim() || item.marke?.trim() || '–'
      return `<tr>
        <td>${escHtml(personalCategoryLabel(item.category))}</td>
        <td>${escHtml(kennung)}</td>
        <td>${escHtml(asPersonalDetail(item) || '–')}</td>
      </tr>`
    }).join('\n')

  const personalTotal = input.personalItems.length
  const body = `
    <div class="section">
      <h2>Pool</h2>
      <table class="report">
        <thead><tr>
          <th>Kategorie</th>
          ${ortHeaders}
          <th class="num">Gesamt</th>
        </tr></thead>
        <tbody>${poolBody || emptyRow(VERWAHRUNGSORTE.length + 2, 'Kein Pool-Bestand.')}</tbody>
      </table>
    </div>
    <div class="section">
      <h2>Persönliche Einsatzmittel im Lager</h2>
      <p class="subtitle">${personalTotal === 0
        ? 'Keine persönlichen Stücke eingelagert.'
        : `${personalTotal} Stück eingelagert (ohne Polizisten-Zuweisung oder mit Ort Lager).`}</p>
      <table class="report">
        <thead><tr><th>Kategorie</th><th class="num">Im Lager</th></tr></thead>
        <tbody>${personalCountBody}</tbody>
      </table>
      <table class="report" style="margin-top:10px">
        <thead><tr><th>Kategorie</th><th>Kennung</th><th>Angaben</th></tr></thead>
        <tbody>${personalDetail}</tbody>
      </table>
    </div>`

  return reportChrome({
    title: 'Lagerbestand Einsatzmittel',
    subtitle: 'Aktiver Bestand je Verwahrungsort (Pool) und eingelagerte persönliche Stücke',
    body,
    entryCount: input.poolRows.reduce((sum, row) => sum + row.total, 0) + personalTotal,
    now,
  })
}

function participationText(
  officerId: string,
  participations: readonly TrainingParticipationPdfRow[],
): string {
  const rows = participations.filter(row => row.officer_id === officerId)
  if (rows.length === 0) return '–'
  return rows.map(row => {
    const interval = row.interval_label?.trim() || '–'
    const moduleName = row.module?.name?.trim() || 'Modul'
    return `Intervall ${interval} · ${moduleName}`
  }).join('; ')
}

function sortAttendance(rows: readonly TrainingAttendancePdfRow[]): TrainingAttendancePdfRow[] {
  return [...rows].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'present' ? -1 : 1
    return compareDe(officerDisplayName(a.officer), officerDisplayName(b.officer))
  })
}

export function buildTrainingProtocolPdfHtml(input: {
  session: TrainingSessionPdfRecord
  attendance?: readonly TrainingAttendancePdfRow[]
  participations?: readonly TrainingParticipationPdfRow[]
  now?: Date
}): string {
  const now = input.now ?? new Date()
  const attendance = input.attendance ?? []
  const participations = input.participations ?? []
  const kindLabel = isTrainingKind(input.session.kind)
    ? TRAINING_KIND_LABELS[input.session.kind]
    : input.session.kind
  const dateLabel = formatCompletedOn(input.session.session_date) || input.session.session_date
  const munition = formatMunitionVerbrauch(input.session) || 'Kein Verbrauch erfasst.'
  const note = input.session.note?.trim() || '–'

  const meta = `<table class="meta-table">
    <tr><td>Datum</td><td>${escHtml(dateLabel)}</td></tr>
    <tr><td>Art</td><td>${escHtml(kindLabel)}</td></tr>
    <tr><td>Hinweis</td><td>${escHtml(note)}</td></tr>
    <tr><td>Munition</td><td>${escHtml(munition)}</td></tr>
  </table>`

  let tables: string
  if (attendance.length > 0) {
    const rows = sortAttendance(attendance).map(row => {
      const status = isAttendanceStatus(row.status)
        ? ATTENDANCE_STATUS_LABELS[row.status]
        : row.status
      return `<tr>
        <td>${escHtml(officerDisplayName(row.officer))}</td>
        <td>${escHtml(status)}</td>
        <td>${escHtml(participationText(row.officer_id, participations))}</td>
      </tr>`
    }).join('\n')
    tables = `<div class="section">
      <h2>Anwesenheit</h2>
      <table class="report">
        <thead><tr><th>Polizist</th><th>Status</th><th>Teilnahmen / Intervalle</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
  } else if (participations.length > 0) {
    const rows = [...participations]
      .sort((a, b) => compareDe(officerDisplayName(a.officer), officerDisplayName(b.officer)))
      .map(row => `<tr>
        <td>${escHtml(officerDisplayName(row.officer))}</td>
        <td>${escHtml(row.module?.name?.trim() || '–')}</td>
        <td>${escHtml(row.interval_label?.trim() || '–')}</td>
      </tr>`)
      .join('\n')
    tables = `<div class="section">
      <h2>Teilnahmen</h2>
      <table class="report">
        <thead><tr><th>Polizist</th><th>Modul</th><th>Intervall</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
  } else {
    tables = `<p class="subtitle">Keine Anwesenheit oder Teilnahmen erfasst.</p>`
  }

  const entryCount = attendance.length > 0 ? attendance.length : participations.length
  return reportChrome({
    title: `Trainingstag-Protokoll · ${kindLabel}`,
    subtitle: `Einsatztraining ${kindLabel.toLowerCase()} am ${dateLabel}`,
    body: meta + tables,
    entryCount,
    now,
  })
}

export function buildTrainingModulesPdfHtml(input: {
  modules: readonly TrainingModulePdfRow[]
  completions?: readonly TrainingCompletionPdfRow[]
  now?: Date
}): string {
  const now = input.now ?? new Date()
  const moduleRows = [...input.modules]
    .sort((a, b) => compareDe(a.name, b.name) || compareDe(a.kind, b.kind))
    .map(row => `<tr>
      <td>${escHtml(row.name)}</td>
      <td>${escHtml(TRAINING_KIND_LABELS[row.kind])}</td>
      <td>${row.active ? 'Aktiv' : 'Inaktiv'}</td>
      <td class="num">${row.completionCount}</td>
    </tr>`)
    .join('\n')

  const completions = input.completions ?? []
  const completionSection = completions.length === 0
    ? ''
    : `<div class="section">
      <h2>Abschlüsse</h2>
      <table class="report">
        <thead><tr><th>Polizist</th><th>Modul</th><th>Art</th><th>Abgeschlossen</th></tr></thead>
        <tbody>${[...completions]
          .sort((a, b) => compareDe(a.officerName, b.officerName) || compareDe(a.moduleName, b.moduleName))
          .map(row => `<tr>
            <td>${escHtml(row.officerName)}</td>
            <td>${escHtml(row.moduleName)}</td>
            <td>${escHtml(TRAINING_KIND_LABELS[row.kind])}</td>
            <td>${escHtml(formatCompletedOn(row.completedOn) || row.completedOn)}</td>
          </tr>`)
          .join('\n')}</tbody>
      </table>
    </div>`

  const body = `<div class="section">
    <h2>Module</h2>
    <table class="report">
      <thead><tr><th>Modul</th><th>Art</th><th>Status</th><th class="num">Abschlüsse</th></tr></thead>
      <tbody>${moduleRows || emptyRow(4, 'Keine Module erfasst.')}</tbody>
    </table>
  </div>${completionSection}`

  return reportChrome({
    title: 'Einsatztraining · Module',
    subtitle: 'Modulliste und Abschlussübersicht',
    body,
    entryCount: input.modules.length,
    now,
  })
}

export function generatePersonalEmPdf(
  items: readonly PersonalEmPdfRecord[],
  options: { officerId?: string | null; officerLabel?: string | null; now?: Date } = {},
): void {
  openPrintHtml(buildPersonalEmPdfHtml(items, options))
}

export function generatePoolEmPdf(
  items: readonly PoolEmPdfRecord[],
  options: { verwahrungsort?: string | null; now?: Date } = {},
): void {
  openPrintHtml(buildPoolEmPdfHtml(items, options))
}

export function generateLagerbestandPdf(input: {
  poolRows: readonly LagerbestandRow[]
  personalCounts: readonly PersonalLagerbestandRow[]
  personalItems: readonly PersonalEmPdfRecord[]
  now?: Date
}): void {
  openPrintHtml(buildLagerbestandPdfHtml(input))
}

export function generateTrainingProtocolPdf(input: {
  session: TrainingSessionPdfRecord
  attendance?: readonly TrainingAttendancePdfRow[]
  participations?: readonly TrainingParticipationPdfRow[]
  now?: Date
}): void {
  openPrintHtml(buildTrainingProtocolPdfHtml(input))
}

export function generateTrainingModulesPdf(input: {
  modules: readonly TrainingModulePdfRow[]
  completions?: readonly TrainingCompletionPdfRow[]
  now?: Date
}): void {
  openPrintHtml(buildTrainingModulesPdfHtml(input))
}
