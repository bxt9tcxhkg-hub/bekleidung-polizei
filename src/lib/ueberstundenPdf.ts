/**
 * Überstundenmeldung als Druckvorlage - bildet die offizielle Dornbirn-
 * Vorlage nach (Kopfdaten, Tabelle mit den fünf Lohnarten-Kategorien,
 * Bearbeiter/in- und Genehmiger-Zeile).
 */
import { LETTERHEAD_CSS, escHtml, letterheadBlock, openPrintHtml } from './printDocs'
import { KATEGORIEN, formatStunden } from './ueberstunden'
import type { UeberstundenKategorieKey } from './ueberstunden'

export interface UeberstundenPdfInput {
  beamterName: string
  bearbeiterName: string
  genehmigerName: string | null
  datum: string
  zeitVon: string | null
  zeitBis: string | null
  grund: string
  stunden: Record<UeberstundenKategorieKey, number>
}

function formatDateShort(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  return `${day}.${month}.${year}`
}

export function buildUeberstundenPdfHtml(input: UeberstundenPdfInput): string {
  const zeit = input.zeitVon && input.zeitBis ? `${input.zeitVon} bis ${input.zeitBis} Uhr` : '–'
  const cols = KATEGORIEN.map(kat => {
    const value = input.stunden[kat.key]
    return `<td>
      <div class="hinweis">${escHtml(kat.label)}${kat.hinweis ? `<br><span class="klein">${escHtml(kat.hinweis)}</span>` : ''}</div>
      <div class="satz">${escHtml(kat.satz)}<br>${escHtml(kat.code)}</div>
      <div class="wert">${value ? formatStunden(value) : '–'}</div>
    </td>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Überstundenmeldung</title><style>
  @page { size: A4; margin: 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Calibri, sans-serif; font-size: 10pt; color: #000; line-height: 1.4; }
  ${LETTERHEAD_CSS}
  .ra { font-size: 8pt; border-bottom: 1px solid #666; padding-bottom: 1mm; margin-bottom: 6mm; color: #333; }
  .kt { font-size: 16pt; font-weight: bold; text-align: center; margin-bottom: 8mm; }
  table.meta { border-collapse: collapse; margin-bottom: 6mm; }
  table.meta td { padding: 1mm 4mm 1mm 0; vertical-align: top; }
  table.meta td:first-child { font-weight: bold; white-space: nowrap; }
  table.grid { width: 100%; border-collapse: collapse; margin-bottom: 6mm; table-layout: fixed; }
  table.grid td { border: 1px solid #000; padding: 2mm; vertical-align: top; text-align: center; }
  .hinweis { font-weight: bold; font-size: 8.5pt; min-height: 20mm; }
  .klein { font-weight: normal; font-size: 8pt; }
  .satz { font-size: 9pt; border-top: 1px solid #000; margin-top: 2mm; padding-top: 1mm; }
  .wert { font-size: 12pt; font-weight: bold; border-top: 1px solid #000; margin-top: 2mm; padding-top: 1mm; }
  table.unterschrift { width: 100%; border-collapse: collapse; margin-top: 14mm; }
  table.unterschrift td { width: 50%; padding-top: 2mm; border-top: 1px solid #000; font-size: 10pt; vertical-align: top; }
  .foot { margin-top: 16mm; font-size: 8pt; color: #444; display: flex; justify-content: space-between; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  ${letterheadBlock(input.bearbeiterName)}
  <div class="ra">Stadt Dornbirn Rathausplatz 2 A 6850 Dornbirn</div>
  <div class="kt">Überstundenmeldung</div>
  <table class="meta">
    <tr><td>Name des Beamten:</td><td>${escHtml(input.beamterName)}</td></tr>
    <tr><td>Datum:</td><td>${escHtml(formatDateShort(input.datum))}</td></tr>
    <tr><td>Uhrzeit:</td><td>${escHtml(zeit)}</td></tr>
    <tr><td>Grund der Überstunde(n):</td><td>${escHtml(input.grund)}</td></tr>
  </table>
  <table class="grid"><tr>${cols}</tr></table>
  <table class="unterschrift">
    <tr>
      <td>Bearbeiter/in:<br>${escHtml(input.bearbeiterName)}</td>
      <td>Genehmiger:<br>${escHtml(input.genehmigerName ?? '–')}</td>
    </tr>
  </table>
  <div class="foot"><span>Überstundenmeldung · Formularversion</span><span>DVR 0036030</span></div>
</body></html>`
}

export function generateUeberstundenPdf(input: UeberstundenPdfInput): void {
  openPrintHtml(buildUeberstundenPdfHtml(input))
}
