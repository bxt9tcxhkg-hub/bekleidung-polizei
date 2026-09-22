/**
 * Einsatz-Übersicht als Druckvorlage für die Streife - fasst alle zu einer
 * Meldung dokumentierten Details auf einer Seite zusammen (Melder, Ort,
 * Sachverhalt, Ereignisstufe, beteiligte Parteien, Notiz, beigefügte
 * Unterlagen), gleicher Briefkopf wie Kurzbrief/Straßenzustandsbericht.
 */
import { DISPOSITION_LABEL } from './zentraleShared'
import { EINSATZ_PARTEI_ROLLE_LABEL } from './einsatzParteien'
import { STUFE_META } from './einsatzSchema'
import { DOK_ART_LABEL, type EinsatzDokument } from './einsatzDokumente'
import { LETTERHEAD_CSS, escHtml, letterheadBlock, openPrintHtml } from './printDocs'
import type { EinsatzPartei, EreignisDimension, IncidentDisposition } from './types'

const DE_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

function dateTimeLong(value: string): string {
  const date = new Date(value)
  return `${String(date.getDate()).padStart(2, '0')}. ${DE_MONTHS[date.getMonth()]} ${date.getFullYear()}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} Uhr`
}

function birthDateText(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString('de-AT') : ''
}

export interface EinsatzUebersichtInput {
  incident: {
    id: string
    reported_at: string
    location: string | null
    summary: string
    disposition: IncidentDisposition
    status: string
    note: string | null
    caller_name?: string | null
    caller_phone?: string | null
    involved_person?: string | null
    involved_birth_date?: string | null
  }
  parteien: EinsatzPartei[]
  dokumente: EinsatzDokument[]
  erstelltVon: string
  ereignisDimension?: EreignisDimension
  now?: Date
}

function factRow(label: string, value: string): string {
  return `<tr><td class="c1">${escHtml(label)}</td><td class="c2">${escHtml(value || '–')}</td></tr>`
}

function statusText(status: string): string {
  return status === 'weitergegeben' ? 'An BP weitergegeben' : status === 'erledigt' ? 'Erledigt' : 'Offen'
}

function legacyDimension(note: string | null): EreignisDimension {
  const match = note?.match(/^STUFE:(klein|mittel|gross|katastrophe)\n?/)
  return (match?.[1] as EreignisDimension | undefined) ?? 'klein'
}

function cleanLegacyNote(note: string | null): string {
  return (note ?? '').replace(/^STUFE:(klein|mittel|gross|katastrophe)\n?/, '')
}

export function buildEinsatzUebersichtHtml(input: EinsatzUebersichtInput): string {
  const now = input.now ?? new Date()
  const { incident } = input
  const stufe = STUFE_META[input.ereignisDimension ?? legacyDimension(incident.note)]
  const sachverhaltsnotiz = cleanLegacyNote(incident.note)

  const factsRows = [
    factRow('Gemeldet', dateTimeLong(incident.reported_at)),
    factRow('Ort', incident.location ?? ''),
    factRow('Disposition', DISPOSITION_LABEL[incident.disposition]),
    factRow('Status', statusText(incident.status)),
    factRow('Ereignisstufe', stufe.label),
    factRow('Melder', [incident.caller_name, incident.caller_phone].filter(Boolean).join(' · ')),
    factRow('Beteiligte Person', [incident.involved_person, birthDateText(incident.involved_birth_date)].filter(Boolean).join(', ')),
  ].join('\n')

  const parteienRows = input.parteien.length === 0
    ? '<tr><td colspan="3">Keine Parteien erfasst.</td></tr>'
    : input.parteien.map(item => {
      const name = [item.person?.vorname, item.person?.nachname].filter(Boolean).join(' ') || '–'
      const geburt = birthDateText(item.person?.birth_date)
      return `<tr><td>${escHtml(name)}${geburt ? ` <span class="dim">(${escHtml(geburt)})</span>` : ''}</td><td>${escHtml(EINSATZ_PARTEI_ROLLE_LABEL[item.rolle])}</td><td>${escHtml(item.note ?? '–')}</td></tr>`
    }).join('\n')

  const dokumenteList = input.dokumente.length === 0
    ? '<p class="dim">Keine Unterlagen hinterlegt.</p>'
    : `<ul class="doks">${input.dokumente.map(item => `<li>${escHtml(DOK_ART_LABEL[item.art])}: ${escHtml(item.fileName)}</li>`).join('\n')}</ul>`

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Einsatz-Übersicht</title><style>
  @page { size: A4; margin: 20mm 20mm 20mm 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Calibri, sans-serif; font-size: 10pt; color: #000; line-height: 1.4; }
  ${LETTERHEAD_CSS}
  .title { text-align: center; font-size: 14pt; font-weight: bold; letter-spacing: 0.5px; margin: 12mm 0 3mm; }
  .meta { text-align: center; font-size: 9pt; color: #333; margin-bottom: 8mm; }
  .section { margin-bottom: 6mm; break-inside: avoid; }
  .section h2 { font-size: 11pt; font-weight: bold; margin-bottom: 2mm; }
  table.eu-table { width: 174.4mm; max-width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 10pt; }
  table.eu-table td { border: 1px solid #000; padding: 3px 6px; vertical-align: top; }
  table.eu-table td.c1 { width: 30%; font-weight: bold; }
  table.eu-table td.c2 { width: 70%; }
  table.parteien-table { width: 174.4mm; max-width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 10pt; }
  table.parteien-table td, table.parteien-table th { border: 1px solid #000; padding: 3px 6px; vertical-align: top; text-align: left; }
  .dim { color: #555; }
  .sachverhalt, .anmerkungen { margin: 6mm 0; }
  .sachverhalt h2, .anmerkungen h2 { font-size: 11pt; font-weight: bold; margin-bottom: 2mm; }
  .sachverhalt p, .anmerkungen p { white-space: pre-wrap; }
  ul.doks { padding-left: 5mm; }
  .foot { margin-top: 16mm; font-size: 8pt; color: #444; display: flex; justify-content: space-between; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  ${letterheadBlock()}
  <div class="title">EINSATZ-ÜBERSICHT</div>
  <div class="meta">Erstellt: ${escHtml(dateTimeLong(now.toISOString()))} · Ausdruck ersetzt nicht die PAD-Dokumentation</div>

  <div class="section">
    <h2>Meldung</h2>
    <table class="eu-table"><tbody>${factsRows}</tbody></table>
  </div>

  <div class="sachverhalt">
    <h2>Sachverhalt</h2>
    <p>${escHtml(incident.summary)}</p>
  </div>

  <div class="section">
    <h2>Beteiligte Parteien</h2>
    <table class="parteien-table"><thead><tr><th>Person</th><th>Rolle</th><th>Notiz</th></tr></thead><tbody>${parteienRows}</tbody></table>
  </div>

  <div class="anmerkungen">
    <h2>Notiz</h2>
    <p>${escHtml(sachverhaltsnotiz || '–')}</p>
  </div>

  <div class="section">
    <h2>Beigefügte Unterlagen</h2>
    ${dokumenteList}
  </div>

  <div class="foot">
    <span>Einsatz-Übersicht · Erstellt von ${escHtml(input.erstelltVon)}</span>
    <span>DVR 0036030</span>
  </div>
</body></html>`
}

export function generateEinsatzUebersicht(input: EinsatzUebersichtInput): void {
  openPrintHtml(buildEinsatzUebersichtHtml(input))
}
