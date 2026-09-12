/**
 * Straßenzustandsbericht als Druckvorlage - bildet exakt das bisherige
 * Word-Formular ("Straßenzustandsbericht_Automation.dotm") nach: gleicher
 * Briefkopf wie im Kurzbrief (STADT DORNBIRN Polizei ...), Titel
 * "STRASSENZUSTANDSBERICHT", pro Straße eine zweispaltige Tabelle
 * (Gesamtbreite 17,44 cm, Spalte 1 = 30 %, Spalte 2 = 70 %, Arial 10pt -
 * exakt die Vorgabe aus dem alten Makro), Anmerkungen, Verteiler-Hinweis,
 * Bearbeiter/in-Zeile und Fußzeile mit DVR-Nummer.
 */
import { escHtml, openPrintHtml } from './printDocs'
import { MELDUNGSART_LABEL, ZUSTAND_LABEL, formatZeitraum, strassenName } from './strassenzustand'
import type { StrassenzustandBerichtzeile } from './types'

const DE_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

function dateTimeLong(now: Date): string {
  return `${String(now.getDate()).padStart(2, '0')}. ${DE_MONTHS[now.getMonth()]} ${now.getFullYear()}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} Uhr`
}

export interface StrassenzustandPdfInput {
  nummer: number
  bearbeiterName: string
  anmerkung?: string | null
  zeilen: readonly StrassenzustandBerichtzeile[]
  now?: Date
}

function zustandText(zeile: StrassenzustandBerichtzeile): string {
  const label = ZUSTAND_LABEL[zeile.zustand]
  return zeile.zustand_freitext?.trim() ? `${label} – ${zeile.zustand_freitext.trim()}` : label
}
function auftraggeberText(zeile: StrassenzustandBerichtzeile): string {
  return zeile.strassenzustand_auftraggeber?.name ?? zeile.auftraggeber_freitext?.trim() ?? '–'
}
function melderText(zeile: StrassenzustandBerichtzeile): string {
  return zeile.strassenzustand_melder?.name ?? zeile.melder_freitext?.trim() ?? '–'
}

function strasseTable(zeile: StrassenzustandBerichtzeile): string {
  const rows: [string, string][] = [
    ['Straße', strassenName(zeile)],
    ['Meldungsart', MELDUNGSART_LABEL[zeile.meldungsart]],
    ['Zustand', zustandText(zeile)],
    ['Auftrag von', auftraggeberText(zeile)],
    ['Meldung durch', melderText(zeile)],
    ['Zeitraum', formatZeitraum(zeile)],
  ]
  const body = rows.map(([label, value]) => `<tr><td class="c1">${escHtml(label)}</td><td class="c2">${escHtml(value)}</td></tr>`).join('\n')
  return `<table class="szb-table"><tbody>${body}</tbody></table>`
}

export function buildStrassenzustandPdfHtml(input: StrassenzustandPdfInput): string {
  const now = input.now ?? new Date()
  const strassenSections = input.zeilen.map(zeile => `
    <div class="section">
      <h2>${escHtml(strassenName(zeile))}</h2>
      ${strasseTable(zeile)}
    </div>`).join('\n')

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Straßenzustandsbericht Nr. ${input.nummer}</title><style>
  @page { size: A4; margin: 20mm 20mm 20mm 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Calibri, sans-serif; font-size: 10pt; color: #000; line-height: 1.4; }
  .lh { font-size: 8pt; line-height: 1.6; margin-bottom: 8mm; text-align: center; }
  .title { text-align: center; font-size: 14pt; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 3mm; }
  .meta { text-align: center; font-size: 9pt; color: #333; margin-bottom: 8mm; }
  .section { margin-bottom: 6mm; break-inside: avoid; }
  .section h2 { font-size: 11pt; font-weight: bold; margin-bottom: 2mm; }
  table.szb-table { width: 174.4mm; max-width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 10pt; text-decoration: none; }
  table.szb-table td { border: 1px solid #000; padding: 3px 6px; vertical-align: top; }
  table.szb-table td.c1 { width: 30%; font-weight: bold; }
  table.szb-table td.c2 { width: 70%; }
  .anmerkungen { margin: 8mm 0; }
  .anmerkungen h2 { font-size: 11pt; font-weight: bold; margin-bottom: 2mm; }
  .anmerkungen p { white-space: pre-wrap; }
  .verteiler { margin: 6mm 0; font-style: italic; }
  table.unterschrift { margin-top: 12mm; border-collapse: collapse; }
  table.unterschrift td { padding: 2px 10px 2px 0; font-size: 10pt; }
  table.unterschrift td:first-child { font-weight: bold; white-space: nowrap; }
  .foot { margin-top: 16mm; font-size: 8pt; color: #444; display: flex; justify-content: space-between; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <div class="lh">
    STADT DORNBIRN&nbsp;&nbsp;<strong>Polizei</strong><br>
    Rathausplatz 2&nbsp;&nbsp;A 6850 Dornbirn<br>
    T +43 5572 222 00&nbsp;&nbsp;&nbsp;F +43 5572 330 08&nbsp;&nbsp;&nbsp;polizei@dornbirn.at
  </div>
  <div class="title">STRASSENZUSTANDSBERICHT</div>
  <div class="meta">Bericht Nr. ${input.nummer} · Erstellt: ${escHtml(dateTimeLong(now))}</div>

  ${strassenSections}

  <div class="anmerkungen">
    <h2>Anmerkungen:</h2>
    <p>${escHtml(input.anmerkung?.trim() || '–')}</p>
  </div>

  <div class="verteiler">Geht an: siehe E-Mail-Verteiler.</div>

  <table class="unterschrift">
    <tr><td>Bearbeiter/in:</td><td>${escHtml(input.bearbeiterName)}</td></tr>
  </table>

  <div class="foot">
    <span>Straßenzustandsbericht · Formularversion</span>
    <span>DVR 0036030</span>
  </div>
</body></html>`
}

export function generateStrassenzustandPdf(input: StrassenzustandPdfInput): void {
  openPrintHtml(buildStrassenzustandPdfHtml(input))
}
