/**
 * Bescheid Straßenmusik/Straßenkunst als Druckvorlage - bildet die offizielle
 * Dornbirn-Vorlage nach (Spruch, Auflagen, Kostenaufstellung, Begründung,
 * Rechtsmittelbelehrung). Auflagen/Begründung/Rechtsmittelbelehrung sind
 * feste Textbausteine je Bescheid-Art (identisch mit der offiziellen
 * Vorlage) - nur die tatsächlich variablen Angaben (Person, Standplätze,
 * Zeitfenster, Kosten) kommen aus dem jeweiligen innendienst_records-Eintrag.
 * Optional wird als letzte Seite die Planbeilage (Luftbild + Katasterplan
 * der Marktplatz-Standplätze a)/b)) angehängt - nur wenn planbeilage=true
 * gesetzt ist (explizite Auswahl im Formular, da nicht jeder Bescheid diese
 * Location betrifft; aktuell die einzige mit Planbeilage hinterlegte
 * Location, bei künftig weiteren Standorten muss das erweitert werden).
 */
import { LETTERHEAD_CSS, escHtml, letterheadBlock, openPrintHtml } from './printDocs'
import { fmtEUR } from './format'
import { PLANBEILAGE_KATASTER, PLANBEILAGE_LUFTBILD } from './planbeilageAssets'
import type { InnendienstRecordKind } from './types'

export type BescheidKind = Extract<InnendienstRecordKind, 'bescheid_strassenmusik' | 'bescheid_strassenkunst'>

export interface BescheidPdfInput {
  kind: BescheidKind
  aktenzahl: string | null
  bearbeiterName: string
  personName: string
  personBirthDate: string | null
  personAddress: string | null
  standplaetze: string[]
  /** "HH:MM", nur bei Straßenkunst genutzt. */
  zeitVon: string | null
  zeitBis: string | null
  kostenPositionen: { name: string; betrag: number }[]
  /** Ausstellungsdatum (YYYY-MM-DD) - dient zugleich als Bewilligungsdatum bei Straßenkunst. */
  issuedDate: string
  /** Planbeilage (Luftbild+Kataster Marktplatz-Standplätze a)/b)) als letzte Seite anhängen - nur wenn die Standplätze tatsächlich diese Location betreffen. */
  planbeilage: boolean
  now?: Date
}

function formatDateShort(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  return `${day}.${month}.${year}`
}

const DE_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
function dateLong(now: Date): string {
  return `${String(now.getDate()).padStart(2, '0')}. ${DE_MONTHS[now.getMonth()]} ${now.getFullYear()}`
}

function standplaetzeList(items: readonly string[]): string {
  const filled = items.map(item => item.trim()).filter(Boolean)
  if (filled.length === 0) return '<p>–</p>'
  const letter = (i: number) => String.fromCharCode(97 + i) // a, b, c, ...
  return `<ol class="standplaetze">${filled.map((item, i) => `<li><span class="letter">${letter(i)})</span> ${escHtml(item)}</li>`).join('')}</ol>`
}

const TITEL: Record<BescheidKind, { untertitel: string; paragraf: string }> = {
  bescheid_strassenmusik: { untertitel: 'Zuweisung eines Platzes zur Ausübung von Straßenmusik gemäß § 85 StVO', paragraf: '85' },
  bescheid_strassenkunst: { untertitel: 'Benützung von Straßen zu verkehrsfremden Zwecken gemäß § 82 Abs. 1 StVO 1960 &middot; Bewilligung für die Ausübung von Schaustellungen und Darbietungen', paragraf: '82' },
}

function spruch(input: BescheidPdfInput): string {
  const list = standplaetzeList(input.standplaetze)
  if (input.kind === 'bescheid_strassenmusik') {
    return `<p>Dem/Der Antragsteller/Antragstellerin werden gemäß § 85 Abs. 3 StVO folgende Standplätze zur Ausübung von Straßenmusik zugewiesen:</p>
      ${list}`
  }
  const zeit = input.zeitVon && input.zeitBis ? `in der Zeit von ${escHtml(input.zeitVon)} Uhr bis ${escHtml(input.zeitBis)} Uhr ` : ''
  return `<p>Dem/Der <strong>${escHtml(input.personName)}</strong>, geb. ${input.personBirthDate ? formatDateShort(input.personBirthDate) : '–'}, whft. ${escHtml(input.personAddress ?? '–')}, wird gemäß § 82 StVO die Bewilligung zur Ausübung von Schaustellungen und Darbietungen in der Fußgängerzone in Dornbirn am ${formatDateShort(input.issuedDate)} ${zeit}an folgenden Standplätzen erteilt:</p>
    ${list}
    <p>Die Bewilligung gilt für jeden Standplatz und Tag maximal für die Dauer von 2 Stunden.</p>
    <p>Die Bewilligung wird für stille Straßenkunst in Form einer lautlosen darstellerischen Darbietung (z.&nbsp;B. &bdquo;lebende Statue&ldquo;) erteilt.</p>`
}

const BEDINGUNGEN: Record<BescheidKind, string[]> = {
  bescheid_strassenmusik: [
    'Das Musizieren ist Einzelpersonen sowie Gruppen bis maximal 6 Personen gestattet. Die Mitwirkung von Kindern unter 14 Jahren ist nicht gestattet.',
    'An jedem Standplatz darf nur einmal täglich für die Dauer von höchstens einer Stunde musiziert werden. Das Musizieren ist außerdem nur zu folgenden Zeiten gestattet: Montag bis Freitag 9.00 Uhr bis 12.00 Uhr und 14.00 Uhr bis 19.00 Uhr, Samstag 9.00 Uhr bis 12.00 Uhr.',
    'Es dürfen keine Verstärkeranlagen, Lautsprecher udgl. verwendet und keine Aufbauten (Podien, Stühle dgl.) aufgestellt werden.',
    'Die Darbietung muss unentgeltlich erfolgen. Das Annehmen von freiwilligen und ohne Aufforderung übergebener Spenden ist erlaubt. Es ist hingegen nicht zulässig, von Passanten aktiv Geld einzufordern, und zwar weder durch Mimik noch Gestik (zB Hände entgegenstrecken/aufhalten, Herumreichen eines Sammelbehälters udgl.). Jeder Verkauf ist verboten. Ein solches Verhalten führt zum sofortigen Widerruf der Bewilligung ohne Anspruch auf Rückerstattung der geleisteten Gebühren.',
  ],
  bescheid_strassenkunst: [
    'Der Fußgängerverkehr darf nicht beeinträchtigt und Passanten dürfen nicht belästigt werden.',
    'Der Antragsteller ist dafür verantwortlich, dass durch seine Aktion keine Gefahren für Personen oder Sachen entstehen.',
    'Die Mitwirkung von Tieren ist nicht gestattet.',
    'Die Darbietung muss unentgeltlich erfolgen. Das Annehmen von freiwilligen Spenden ist erlaubt. Es ist hingegen nicht zulässig, von Passanten aktiv Geld einzufordern, und zwar weder durch Mimik, Gestik (zB Hände entgegenstrecken/aufhalten, Herumreichen eines Sammelbehälters udgl.) noch durch sprachliche Äußerungen oder durch sonstiges Verhalten. Jeder Verkauf ist verboten. Die Nichtbeachtung dieser Vorschreibungen führt zum sofortigen Widerruf der Bewilligung ohne Anspruch auf Rückerstattung der geleisteten Gebühren.',
  ],
}

function kostenSection(positionen: readonly { name: string; betrag: number }[]): string {
  if (positionen.length === 0) return '<p>Kein Gebührensatz hinterlegt – Kostenaufstellung siehe Gebührenordnung.</p>'
  const rows = positionen.map(item => `<tr><td>${escHtml(item.name)}</td><td class="r">${fmtEUR(item.betrag)}</td></tr>`).join('')
  const total = positionen.reduce((sum, item) => sum + item.betrag, 0)
  return `<table class="kosten"><tbody>${rows}<tr class="total"><td>Gesamtkosten:</td><td class="r">${fmtEUR(total)}</td></tr></tbody></table>`
}

export function buildBescheidPdfHtml(input: BescheidPdfInput): string {
  const now = input.now ?? new Date()
  const titel = TITEL[input.kind]
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Bescheid ${input.kind === 'bescheid_strassenmusik' ? 'Straßenmusik' : 'Straßenkunst'}</title><style>
  @page { size: A4; margin: 20mm 20mm 20mm 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Calibri, sans-serif; font-size: 10pt; color: #000; line-height: 1.45; }
  ${LETTERHEAD_CSS}
  .ra { font-size: 8pt; border-bottom: 1px solid #666; padding-bottom: 1mm; margin-bottom: 6mm; color: #333; }
  .meta { margin-bottom: 6mm; }
  .meta p { margin-bottom: 1mm; }
  .kt { font-size: 14pt; font-weight: bold; margin-bottom: 1mm; }
  .ut { font-size: 10pt; margin-bottom: 6mm; }
  .sp { font-size: 12pt; font-weight: bold; margin: 6mm 0 2mm; }
  h2 { font-size: 11pt; font-weight: bold; margin: 6mm 0 2mm; }
  p { margin-bottom: 2mm; }
  ol.standplaetze { list-style: none; margin: 2mm 0 3mm 4mm; }
  ol.standplaetze li { margin-bottom: 1mm; }
  ol.standplaetze .letter { font-weight: bold; margin-right: 4px; }
  ol.bedingungen { margin: 2mm 0 3mm 6mm; }
  ol.bedingungen li { margin-bottom: 2mm; }
  table.kosten { border-collapse: collapse; margin: 3mm 0 5mm; min-width: 100mm; }
  table.kosten td { padding: 1mm 3mm 1mm 0; }
  table.kosten td.r { text-align: right; font-variant-numeric: tabular-nums; }
  table.kosten tr.total td { border-top: 1px solid #000; font-weight: bold; padding-top: 2mm; }
  .unterschrift { margin-top: 12mm; }
  .unterschrift p { margin-bottom: 1mm; }
  .foot { margin-top: 16mm; font-size: 8pt; color: #444; display: flex; justify-content: space-between; }
  .planbeilage { page-break-before: always; }
  .planbeilage h2 { margin-bottom: 4mm; }
  .planbeilage img { width: 100%; max-height: 110mm; object-fit: contain; border: 1px solid #999; margin-bottom: 3mm; }
  .planbeilage .bildtitel { font-size: 8.5pt; color: #444; margin: -2mm 0 5mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  ${letterheadBlock(input.bearbeiterName)}
  <div class="ra">Stadt Dornbirn Rathausplatz 2 A 6850 Dornbirn</div>
  <div class="meta">
    <p>Dornbirn, ${escHtml(dateLong(now))}</p>
    <p>Aktenzahl: ${escHtml(input.aktenzahl?.trim() || '–')}</p>
  </div>
  <div class="kt">BESCHEID</div>
  <div class="ut">${titel.untertitel}</div>

  <div class="sp">Spruch</div>
  <p><strong>I.</strong></p>
  ${spruch(input)}

  <p><strong>II.</strong></p>
  <p>Aufgrund § 3 Abs. 1 Veranstaltungsgesetz werden für die Ausübung ${input.kind === 'bescheid_strassenmusik' ? 'der Straßenmusik' : 'von Darbietungen und Schaustellungen auf öffentlicher Verkehrsfläche'} folgende Bedingungen vorgeschrieben:</p>
  <ol class="bedingungen">${BEDINGUNGEN[input.kind].map(text => `<li>${text}</li>`).join('')}</ol>

  <p>Dieser Bescheid ist am Tag der Ausstellung gültig und vom Antragsteller mitzuführen und auf Verlangen den Organen der öffentlichen Aufsicht vorzuweisen. Die Missachtung der Bedingungen bildet eine Verwaltungsübertretung und wird bestraft. (Ohne Bewilligung Code 28211, Auflagen im Bescheid missachtet Code 29931)</p>
  <p>Die Organe der Straßenaufsicht sind befugt, verkehrsfremde Tätigkeiten auf und an der Straße, auch wenn für sie eine Bewilligung vorliegt, vorübergehende zu untersagen, wenn es die Verkehrssicherheit erfordert.</p>

  <h2>III. Kosten</h2>
  <p>Für diese Bewilligung fallen folgende Kosten an:</p>
  ${kostenSection(input.kostenPositionen)}

  <h2>Begründung</h2>
  <p>Gemäß § ${titel.paragraf} StVO 1960 bedarf die Benützung von Straßen zu anderen Zwecken als die des Straßenverkehrs einer Bewilligung. Die Bewilligung ist zu erteilen, wenn die Sicherheit, Leichtigkeit und Flüssigkeit des Verkehrs nicht wesentlich beeinträchtigt wird oder eine über das gewöhnliche Maß hinaus gehende Lärmentwicklung nicht zu erwarten ist. Wenn es die Sicherheit, Leichtigkeit oder Flüssigkeit des Verkehrs erfordert, ist die Bewilligung bedingt, befristet oder mit Auflagen zu erteilen. Die Prüfung hat ergeben, dass bei Einhaltung der im Spruch angeführten Auflagen keine der in der zitierten Gesetzesbestimmung genannten geschützten Interessen verletzt werden. Die Bewilligung ist daher zu erteilen.</p>

  <h2>Rechtsmittelbelehrung</h2>
  <p>Gegen diesen Bescheid ist die Berufung zulässig, die binnen zwei Wochen vom Tage der Zustellung an beim Amt der Stadt Dornbirn schriftlich in jeder technisch möglichen Weise einzubringen ist. Die Berufung hat den Bescheid zu bezeichnen, gegen den sie sich richtet und einen begründeten Berufungsantrag zu enthalten.</p>

  <div class="unterschrift">
    <p>Der Bürgermeister:</p>
    <p>i.A.</p>
    <p>&nbsp;</p>
    <p>${escHtml(input.bearbeiterName || 'Sachbearbeiter/in')}</p>
  </div>

  <div class="foot">
    <span>${input.kind === 'bescheid_strassenmusik' ? 'Straßenmusik' : 'Straßenkunst'}</span>
    <span>DVR 0036030</span>
  </div>

  ${input.planbeilage ? `<div class="planbeilage">
    <h2>Planbeilage – Standplätze a) und b), Marktplatz</h2>
    <img src="${PLANBEILAGE_LUFTBILD}" alt="Planbeilage Luftbild">
    <p class="bildtitel">Luftbild mit markierten Standplätzen a) und b)</p>
    <img src="${PLANBEILAGE_KATASTER}" alt="Planbeilage Katasterplan">
    <p class="bildtitel">Katasterplan mit markierten Standplätzen a) und b)</p>
  </div>` : ''}
</body></html>`
}

export function generateBescheidPdf(input: BescheidPdfInput): void {
  openPrintHtml(buildBescheidPdfHtml(input))
}
