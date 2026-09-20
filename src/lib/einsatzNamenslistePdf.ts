/**
 * Druckvorlage für eine Personen-/Namensliste eines Einsatzes - bei der
 * Listenart "unterbringung" an die offizielle Namensliste-Vorlage der Stadt
 * Dornbirn angelehnt (Nr/Name/Alter/m-w-d/Sprache/Familie/Telefonnummer/Ort
 * Unterkunft/Anmerkungen), bei den übrigen Listenarten an die einfachere
 * Spaltenstruktur der jeweiligen Liste (siehe LISTENART_SPALTEN).
 */
import { LETTERHEAD_CSS, escHtml, letterheadBlock, openPrintHtml, referenceLineBlock } from './printDocs'
import { LISTENART_LABEL, type Listenart } from './zmrPersonen'
import type { NamenslistePerson } from './types'

export interface NamenslistePdfInput {
  incidentTitel: string
  listenart: Listenart
  personen: readonly NamenslistePerson[]
  erstelltVon: string
  now?: Date
}

function statusText(person: NamenslistePerson): string {
  if (person.status === 'im_haus') return 'im Haus'
  if (person.status === 'draussen') return 'draußen'
  if (person.status === 'unbekannt') return 'unbekannt'
  return person.status === 'erledigt' ? 'erledigt' : 'offen'
}

export function generateNamenslistePdf(input: NamenslistePdfInput): void {
  const now = input.now ?? new Date()
  const datumText = now.toLocaleDateString('de-AT')
  const istUnterbringung = input.listenart === 'unterbringung'

  const head = istUnterbringung
    ? '<tr><th>Nr</th><th>Name</th><th>Alter</th><th>m/w/d</th><th>Sprache</th><th>Familie</th><th>Telefonnummer</th><th>Ort Unterkunft</th><th>Anmerkungen</th></tr>'
    : '<tr><th>Nr</th><th>Top-Nr</th><th>Name</th><th>geboren</th><th>Status</th></tr>'

  const rows = input.personen.map((person, index) => istUnterbringung
    ? `<tr>
        <td>${index + 1}</td>
        <td>${escHtml(person.name)}</td>
        <td class="c">${person.alter ?? ''}</td>
        <td class="c">${person.geschlecht ?? ''}</td>
        <td>${escHtml(person.sprache ?? '')}</td>
        <td>${escHtml(person.familie ?? '')}</td>
        <td>${escHtml(person.telefon ?? '')}</td>
        <td>${escHtml(person.ort_unterkunft ?? '')}</td>
        <td>${escHtml(person.anmerkungen ?? '')}</td>
      </tr>`
    : `<tr>
        <td>${index + 1}</td>
        <td class="c">${escHtml(person.wohnung ?? '')}</td>
        <td>${escHtml(person.name)}</td>
        <td class="c">${escHtml(person.geboren ?? '')}</td>
        <td class="c">${escHtml(statusText(person))}</td>
      </tr>`,
  ).join('')

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Namensliste</title><style>
  @page { size: A4 landscape; margin: 15mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Calibri, sans-serif; font-size: 9pt; color: #000; line-height: 1.4; }
  ${LETTERHEAD_CSS}
  .kt { font-size: 14pt; font-weight: bold; margin-bottom: 2mm; }
  .meta { font-size: 9pt; color: #333; margin-bottom: 4mm; }
  table.grid { width: 100%; border-collapse: collapse; }
  table.grid th, table.grid td { border: 1px solid #000; padding: 1.5mm 2mm; vertical-align: top; }
  table.grid th { background: #f1f4f9; font-weight: bold; text-align: left; font-size: 8.5pt; }
  .c { text-align: center; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  ${letterheadBlock(input.erstelltVon)}
  ${referenceLineBlock(now)}
  <div class="kt">Namensliste – ${escHtml(LISTENART_LABEL[input.listenart])}</div>
  <div class="meta">Einsatz: ${escHtml(input.incidentTitel)} · Datum: ${datumText} · Protokollant: ${escHtml(input.erstelltVon)} · ${input.personen.length} Person(en)</div>
  <table class="grid"><thead>${head}</thead><tbody>${rows}</tbody></table>
</body></html>`
  openPrintHtml(html)
}
