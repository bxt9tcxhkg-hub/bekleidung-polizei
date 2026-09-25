/**
 * Überstundenmeldung als Druckvorlage - bildet die offizielle Dornbirn-
 * Vorlage nach (Kopfdaten, Tabelle mit den fünf Lohnarten-Kategorien,
 * Bearbeiter/in- und Genehmiger-Zeile).
 */
import { LETTERHEAD_CSS, escHtml, letterheadBlock, openPrintHtml, referenceLineBlock } from './printDocs'
import { KATEGORIEN, VERGUETUNG_LABEL, formatStunden } from './ueberstunden'
import type { MonatsZeile, UeberstundenKategorieKey } from './ueberstunden'
import type { UeberstundenVerguetung } from './types'

export interface UeberstundenPdfInput {
  beamterName: string
  bearbeiterName: string
  genehmigerName: string | null
  vonDatum: string
  vonZeit: string
  bisDatum: string
  bisZeit: string
  grund: string
  verguetung: UeberstundenVerguetung
  stunden: Record<UeberstundenKategorieKey, number>
}

function formatDateShort(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  return `${day}.${month}.${year}`
}

export function buildUeberstundenPdfHtml(input: UeberstundenPdfInput): string {
  const mehrtaegig = input.vonDatum !== input.bisDatum
  const datumText = mehrtaegig ? `${formatDateShort(input.vonDatum)} bis ${formatDateShort(input.bisDatum)}` : formatDateShort(input.vonDatum)
  const zeit = `${input.vonZeit} bis ${input.bisZeit} Uhr`
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
  table.unterschrift { width: 100%; border-collapse: collapse; margin-top: 10mm; }
  table.unterschrift td { width: 50%; padding-right: 8mm; vertical-align: top; font-size: 10pt; }
  .us-label { font-weight: bold; }
  .us-platz { height: 14mm; border-bottom: 1px solid #000; }
  .us-name { padding-top: 1.5mm; font-size: 9pt; color: #333; }
  .foot { margin-top: 16mm; font-size: 8pt; color: #444; display: flex; justify-content: space-between; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  ${letterheadBlock(input.bearbeiterName)}
  ${referenceLineBlock()}
  <div class="kt">Überstundenmeldung</div>
  <table class="meta">
    <tr><td>Name des Beamten:</td><td>${escHtml(input.beamterName)}</td></tr>
    <tr><td>Datum:</td><td>${escHtml(datumText)}</td></tr>
    <tr><td>Uhrzeit:</td><td>${escHtml(zeit)}</td></tr>
    <tr><td>Grund der Überstunde(n):</td><td>${escHtml(input.grund)}</td></tr>
    <tr><td>Vergütung:</td><td>${escHtml(VERGUETUNG_LABEL[input.verguetung])}</td></tr>
  </table>
  <table class="grid"><tr>${cols}</tr></table>
  <table class="unterschrift">
    <tr>
      <td><div class="us-label">Bearbeiter/in:</div><div class="us-platz"></div><div class="us-name">${escHtml(input.bearbeiterName)}</div></td>
      <td><div class="us-label">Genehmiger:</div><div class="us-platz"></div><div class="us-name">${escHtml(input.genehmigerName ?? '–')}</div></td>
    </tr>
  </table>
  <div class="foot"><span>Überstundenmeldung · Formularversion</span><span>DVR 0036030</span></div>
</body></html>`
}

export function generateUeberstundenPdf(input: UeberstundenPdfInput): void {
  openPrintHtml(buildUeberstundenPdfHtml(input))
}

export interface UeberstundenSammelPdfInput {
  monatLabel: string
  bearbeiterName: string
  zeilen: MonatsZeile[]
}

/**
 * Sammelansicht für den Genehmiger: alle im gewählten Monat genehmigten
 * Meldungen, je Beamten/-in UND Vergütungsart zu einer Zeile aufsummiert -
 * zur Weiterleitung an die Lohnberechnung (siehe
 * lib/ueberstunden.ts::monatsUebersicht). Eigene Zeile je Vergütungsart,
 * damit Auszahlung und Stundenersatz nicht vermischt werden.
 */
export function buildUeberstundenSammelPdfHtml(input: UeberstundenSammelPdfInput): string {
  const gesamtProKategorie: Record<UeberstundenKategorieKey, number> = { std_werktag_50: 0, std_sonn_100: 0, std_19_22: 0, std_22_06: 0, std_sonn_200: 0 }
  let gesamtGesamt = 0
  const rows = input.zeilen.map(zeile => {
    for (const kat of KATEGORIEN) gesamtProKategorie[kat.key] += zeile.stunden[kat.key]
    gesamtGesamt += zeile.gesamt
    return `<tr>
      <td>${escHtml(zeile.beamterName)}${zeile.dienstnummer ? ` <span class="klein">(DNr. ${escHtml(zeile.dienstnummer)})</span>` : ''}</td>
      <td>${zeile.verguetung ? escHtml(VERGUETUNG_LABEL[zeile.verguetung]) : '–'}</td>
      ${KATEGORIEN.map(kat => `<td class="r">${zeile.stunden[kat.key] ? formatStunden(zeile.stunden[kat.key]) : '–'}</td>`).join('')}
      <td class="r"></td>
      <td class="r b">${formatStunden(zeile.gesamt)}</td>
    </tr>`
  }).join('')
  const summeRow = `<tr class="summe">
    <td>Gesamt</td>
    <td></td>
    ${KATEGORIEN.map(kat => `<td class="r">${gesamtProKategorie[kat.key] ? formatStunden(gesamtProKategorie[kat.key]) : '–'}</td>`).join('')}
    <td class="r"></td>
    <td class="r b">${formatStunden(gesamtGesamt)}</td>
  </tr>`

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Überstunden Sammelansicht ${escHtml(input.monatLabel)}</title><style>
  @page { size: A4 landscape; margin: 16mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Calibri, sans-serif; font-size: 9.5pt; color: #000; line-height: 1.4; }
  ${LETTERHEAD_CSS}
  .kt { font-size: 15pt; font-weight: bold; margin-bottom: 1mm; }
  .ut { font-size: 10pt; margin-bottom: 6mm; color: #333; }
  table.sammel { width: 100%; border-collapse: collapse; margin-bottom: 8mm; }
  table.sammel th, table.sammel td { border: 1px solid #999; padding: 1.5mm 2.5mm; }
  table.sammel th { background: #f2f2f2; font-size: 8pt; text-align: left; vertical-align: bottom; }
  table.sammel td.r, table.sammel th.r { text-align: right; font-variant-numeric: tabular-nums; }
  table.sammel td.b { font-weight: bold; }
  table.sammel tr.summe td { border-top: 2px solid #000; font-weight: bold; background: #f7f7f7; }
  .klein { font-size: 8pt; color: #555; font-weight: normal; }
  .foot { margin-top: 10mm; font-size: 8pt; color: #444; display: flex; justify-content: space-between; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  ${letterheadBlock(input.bearbeiterName)}
  ${referenceLineBlock()}
  <div class="kt">Überstunden – Sammelansicht ${escHtml(input.monatLabel)}</div>
  <div class="ut">Genehmigte Überstunden aller Bediensteten, aufgeschlüsselt nach Lohnart – zur Weiterleitung an die Lohnberechnung.</div>
  <table class="sammel">
    <thead><tr>
      <th>Beamter/in</th>
      <th>Vergütung</th>
      ${KATEGORIEN.map(kat => `<th class="r">${escHtml(kat.code)}<br><span class="klein">${escHtml(kat.satz)}</span></th>`).join('')}
      <th class="r">Mehrstunden<br><span class="klein">Teilzeit</span></th>
      <th class="r">Gesamt</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="${KATEGORIEN.length + 4}">Keine genehmigten Meldungen in diesem Monat.</td></tr>`}${input.zeilen.length ? summeRow : ''}</tbody>
  </table>
  <div class="foot"><span>Überstundenmeldung · Sammelansicht · Mehrstunden Teilzeit händisch ergänzen</span><span>DVR 0036030</span></div>
</body></html>`
}

export function generateUeberstundenSammelPdf(input: UeberstundenSammelPdfInput): void {
  openPrintHtml(buildUeberstundenSammelPdfHtml(input))
}
