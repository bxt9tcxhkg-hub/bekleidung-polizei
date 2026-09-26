/**
 * Dienstplan-Planung, Phase 6: Druck-/Exportansicht für einen
 * veröffentlichten Monat - Personen × Tage, wie die ursprüngliche
 * Excel-Vorlage (siehe lib/dienstplanImport.ts), aber als eigenständiges
 * A4-Querformat-Dokument über openPrintHtml() (Drucken oder als PDF
 * speichern über den Systemdialog des Browsers) statt eines echten
 * PDF-Exports - dasselbe Muster wie
 * lib/ueberstundenPdf.ts::generateUeberstundenSammelPdf.
 */
import { LETTERHEAD_CSS, escHtml, letterheadBlock, openPrintHtml, referenceLineBlock } from './printDocs'
import { parseDienstCode } from './dienstplanImport'
import type { DienstplanKategorieDb } from './dienstplanSupabase'

export interface DienstplanDruckPerson { id: string; name: string; dienstnummer: string | null; gruppe: string }
export interface DienstplanDruckZeile { beamter_id: string; datum: string; zeile: 1 | 2; rohtext: string; kategorie: DienstplanKategorieDb }

export interface DienstplanDruckInput {
  monatLabel: string
  bearbeiterName: string
  personen: readonly DienstplanDruckPerson[]
  tage: readonly string[]
  dienste: readonly DienstplanDruckZeile[]
}

const WOCHENTAG_LABEL: Record<number, string> = { 0: 'So', 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa' }

export function buildDienstplanDruckHtml(input: DienstplanDruckInput): string {
  const zellenProPersonUndTag = new Map<string, DienstplanDruckZeile[]>()
  for (const zeile of input.dienste) {
    const key = `${zeile.beamter_id}|${zeile.datum}`
    const liste = zellenProPersonUndTag.get(key) ?? []
    liste.push(zeile)
    zellenProPersonUndTag.set(key, liste)
  }

  const kopfZellen = input.tage.map(datum => {
    const [, , tagText] = datum.split('-')
    const wochentag = new Date(Number(datum.slice(0, 4)), Number(datum.slice(5, 7)) - 1, Number(tagText)).getDay()
    const wochenende = wochentag === 0 || wochentag === 6
    return `<th class="${wochenende ? 'we' : ''}">${WOCHENTAG_LABEL[wochentag]}<br>${tagText}</th>`
  }).join('')

  // Dicke Trennlinie zwischen Personen-Gruppen (Kommando/Dienstführung/
  // Beamte, siehe lib/dienstplanRoster.ts - personen ist bereits danach
  // sortiert), dünne zwischen einzelnen Beamten-Zeilen (Standard-Rahmen von
  // table.plan td/th greift dafür bereits).
  const zeilen = input.personen.map((person, index) => {
    const zellen = input.tage.map(datum => {
      const eintraege = (zellenProPersonUndTag.get(`${person.id}|${datum}`) ?? []).slice().sort((a, b) => a.zeile - b.zeile)
      const text = eintraege.map(zeile => escHtml(parseDienstCode(zeile.rohtext).code)).join('<br>')
      return `<td>${text}</td>`
    }).join('')
    const gruppenende = index < input.personen.length - 1 && input.personen[index + 1].gruppe !== person.gruppe
    return `<tr${gruppenende ? ' class="gruppenende"' : ''}><td class="name">${escHtml(person.name)}${person.dienstnummer ? ` <span class="klein">(${escHtml(person.dienstnummer)})</span>` : ''}</td>${zellen}</tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Dienstplan ${escHtml(input.monatLabel)}</title><style>
  @page { size: A4 landscape; margin: 12mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Calibri, sans-serif; font-size: 7pt; color: #000; line-height: 1.25; }
  ${LETTERHEAD_CSS}
  .kt { font-size: 14pt; font-weight: bold; margin-bottom: 4mm; }
  table.plan { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.plan th, table.plan td { border: 1px solid #999; padding: 0.8mm 0.5mm; text-align: center; overflow: hidden; }
  table.plan th { background: #f2f2f2; font-weight: bold; }
  table.plan th.we, table.plan td.we { background: #fdf3e0; }
  table.plan tr.gruppenende td { border-bottom: 1.5pt solid #333; }
  table.plan td.name { text-align: left; font-weight: bold; white-space: nowrap; width: 32mm; }
  .klein { font-weight: normal; font-size: 6pt; color: #555; }
  .foot { margin-top: 6mm; font-size: 7pt; color: #444; display: flex; justify-content: space-between; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  ${letterheadBlock(input.bearbeiterName)}
  ${referenceLineBlock()}
  <div class="kt">Dienstplan ${escHtml(input.monatLabel)}</div>
  <table class="plan">
    <thead><tr><th>Person</th>${kopfZellen}</tr></thead>
    <tbody>${zeilen || `<tr><td colspan="${input.tage.length + 1}">Keine Diensteinträge in diesem Monat.</td></tr>`}</tbody>
  </table>
  <div class="foot"><span>Dienstplan · Ausdruck</span><span>DVR 0036030</span></div>
</body></html>`
}

export function generateDienstplanDruckPdf(input: DienstplanDruckInput): void {
  openPrintHtml(buildDienstplanDruckHtml(input))
}
