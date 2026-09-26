/**
 * Dienstplan-Planung, Druck-/Exportansicht für einen veröffentlichten
 * Monat - bewusst dieselbe Darstellung wie das Planer-Grid
 * (DienstplanPlanung.tsx): Personen als Spalten (gruppiert nach
 * Kommando/Dienstführung/Beamte, dicke Trennlinie zwischen Gruppen, dünne
 * zwischen einzelnen Beamten), Tage als Zeilen mit je einer Tag- und
 * einer Nachtzeile. Farblich: Wochenende/Feiertag in der eingestellten
 * System-Markierungsfarbe (Standard Orange), Urlaub/Krank/
 * Sonderurlaub/Karenz/Stundenersatz durchgehend über Tag+Nacht (auch über
 * ein durchgehend abwesenes Wochenende hinweg, siehe
 * effektiveAbwesenheitJeTag) mit kräftigerer Nacht-Nuance, fehlende
 * Grundbesetzung (Z/ID/JD) rot, freie Markierungen (lib/
 * dienstplanMarkierungen.ts) in ihrer definierten Farbe. Darunter dieselbe
 * Auswertung wie im Planer-Grid (Stunden, Grund-/Zusatzdienste Tag/Nacht
 * je Person). Als eigenständiges A4-Querformat-Dokument über
 * openPrintHtml() (Drucken oder als PDF speichern über den
 * Systemdialog des Browsers) statt eines echten PDF-Exports - dasselbe
 * Muster wie lib/ueberstundenPdf.ts::generateUeberstundenSammelPdf.
 *
 * Live-Editing-Hinweise, die im Planer-Grid nur beim Bearbeiten Sinn
 * ergeben (Dienstwunsch-Punkt, Ruheverletzung, Auswahl/Vorschlag), sind
 * hier bewusst NICHT enthalten - das ist die Druckansicht des fertigen,
 * veröffentlichten Standes, kein Planungswerkzeug.
 */
import { isAustrianHoliday } from './austrianHolidays'
import { LETTERHEAD_CSS, escHtml, letterheadBlock, openPrintHtml, referenceLineBlock } from './printDocs'
import { formatStunden } from './ueberstunden'
import { abwesenheitsStunden, persoenlicheStundenUebersicht, zaehleDienstarten } from './dienstplanAuswertung'
import { abschnittFuerAnzeige, effektiveAbwesenheitJeTag, fehlendeGrundbesetzung } from './dienstplanBesetzung'
import { formatDienstAnzeige } from './dienstplanImport'
import { besondererTagFarbe, besondererTagFarbKlassen, kategorieFarbenMap, kategorieFarbKlassen, markierungFarbKlassen } from './dienstplanMarkierungen'
import { DIENSTPLAN_GRUPPE_LABEL, type DienstplanGruppe } from './dienstplanRoster'
import type { DienstplanKategorieDb, DienstplanMarkierungKategorie } from './dienstplanSupabase'

export interface DienstplanDruckPerson { id: string; name: string; kurzname: string; dienstnummer: string | null; gruppe: DienstplanGruppe }
export interface DienstplanDruckZeile { beamter_id: string; datum: string; zeile: 1 | 2; rohtext: string; von_zeit: string | null; bis_zeit: string | null; kategorie: DienstplanKategorieDb; markierung_id: string | null }
export interface DienstplanDruckMarkierung { id: string; name: string; farbe: string; kategorie: DienstplanMarkierungKategorie | null }

export interface DienstplanDruckInput {
  monatLabel: string
  bearbeiterName: string
  personen: readonly DienstplanDruckPerson[]
  tage: readonly string[]
  dienste: readonly DienstplanDruckZeile[]
  markierungen: readonly DienstplanDruckMarkierung[]
  /** Für die "Stunden"-Zeile der Auswertung - siehe abwesenheitsStunden in lib/dienstplanAuswertung.ts. */
  stundenProWerktag: number
}

const WOCHENTAG_LABEL: Record<number, string> = { 0: 'So', 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa' }
const ABSCHNITT_LABEL = { tag: 'T', nacht: 'N' } as const

/** Wie kategorieFarbKlassen()/markierungFarbKlassen() (Tailwind-Klassennamen der Live-Ansicht) als konkrete Hex-Werte fürs eigenständige Druck-HTML (kein Tailwind dort verfügbar). */
const FARBE_HEX: Record<string, string> = {
  'bg-yellow-50': '#fefce8', 'bg-yellow-100': '#fef9c3', 'bg-yellow-200': '#fef08a', 'text-yellow-700': '#a16207', 'text-yellow-800': '#854d0e', 'text-yellow-900': '#713f12',
  'bg-green-50': '#f0fdf4', 'bg-green-100': '#dcfce7', 'bg-green-200': '#bbf7d0', 'text-green-700': '#15803d', 'text-green-800': '#166534', 'text-green-900': '#14532d',
  'bg-pink-50': '#fdf2f8', 'bg-pink-100': '#fce7f3', 'bg-pink-200': '#fbcfe8', 'text-pink-700': '#be185d', 'text-pink-800': '#9d174d', 'text-pink-900': '#831843',
  'bg-blue-50': '#eff6ff', 'bg-blue-100': '#dbeafe', 'bg-blue-200': '#bfdbfe', 'text-blue-700': '#1d4ed8', 'text-blue-800': '#1e40af', 'text-blue-900': '#1e3a8a',
  'bg-purple-50': '#faf5ff', 'bg-purple-100': '#f3e8ff', 'bg-purple-200': '#e9d5ff', 'text-purple-700': '#7e22ce', 'text-purple-800': '#6b21a8', 'text-purple-900': '#581c87',
  'bg-orange-50': '#fff7ed', 'bg-orange-100': '#ffedd5', 'bg-orange-200': '#fed7aa', 'text-orange-700': '#c2410c', 'text-orange-800': '#9a3412', 'text-orange-900': '#7c2d12',
  'bg-teal-50': '#f0fdfa', 'bg-teal-100': '#ccfbf1', 'bg-teal-200': '#99f6e4', 'text-teal-700': '#0f766e', 'text-teal-800': '#115e59', 'text-teal-900': '#134e4a',
  'bg-gray-50': '#f9fafb', 'bg-gray-100': '#f3f4f6', 'bg-gray-200': '#e5e7eb', 'bg-gray-300': '#d1d5db', 'text-gray-700': '#374151', 'text-gray-800': '#1f2937', 'text-gray-900': '#111827',
}
function hex(klasse: string): string { return FARBE_HEX[klasse] ?? '#e5e7eb' }

/** 'YYYY-MM-DD' als lokales Datum (nicht UTC). */
function datumAusIso(datumIso: string): Date {
  const [jahr, monat, tag] = datumIso.split('-').map(Number)
  return new Date(jahr, monat - 1, tag)
}

export function buildDienstplanDruckHtml(input: DienstplanDruckInput): string {
  const { personen, tage, dienste, markierungen, stundenProWerktag } = input

  // Dicke Trennlinie zwischen Personen-Gruppen (Kommando/Dienstführung/
  // Beamte, personen ist bereits danach sortiert), dünne zwischen
  // einzelnen Beamten-Spalten - wie spaltenBorderKlasse in
  // DienstplanPlanung.tsx, hier als CSS-Fragment je Person.
  const spaltenRand = new Map<string, string>()
  personen.forEach((person, index) => {
    const istLetzte = index === personen.length - 1
    const istGruppenEnde = !istLetzte && personen[index + 1].gruppe !== person.gruppe
    spaltenRand.set(person.id, istLetzte ? '' : istGruppenEnde ? 'border-right:1.5pt solid #333;' : 'border-right:0.5pt solid #bbb;')
  })
  const gruppenSpans: { gruppe: DienstplanGruppe; span: number }[] = []
  for (const person of personen) {
    const letzter = gruppenSpans[gruppenSpans.length - 1]
    if (letzter && letzter.gruppe === person.gruppe) letzter.span++
    else gruppenSpans.push({ gruppe: person.gruppe, span: 1 })
  }

  const zeilenProPersonUndAbschnitt = new Map<string, DienstplanDruckZeile[]>()
  const zeilenProPersonUndTag = new Map<string, DienstplanDruckZeile[]>()
  for (const zeile of dienste) {
    const schluesselAbschnitt = `${zeile.beamter_id}|${zeile.datum}|${abschnittFuerAnzeige(zeile)}`
    const listeAbschnitt = zeilenProPersonUndAbschnitt.get(schluesselAbschnitt) ?? []
    listeAbschnitt.push(zeile)
    zeilenProPersonUndAbschnitt.set(schluesselAbschnitt, listeAbschnitt)

    const schluesselTag = `${zeile.beamter_id}|${zeile.datum}`
    const listeTag = zeilenProPersonUndTag.get(schluesselTag) ?? []
    listeTag.push(zeile)
    zeilenProPersonUndTag.set(schluesselTag, listeTag)
  }
  const markierungenById = new Map(markierungen.map(markierung => [markierung.id, markierung]))
  const kategorieFarben = kategorieFarbenMap(markierungen)
  const besondererTagFarben = besondererTagFarbKlassen(besondererTagFarbe(markierungen))
  const effektiveAbwesenheit = effektiveAbwesenheitJeTag(dienste, personen.map(person => person.id), tage)
  const fehlendeGrund = fehlendeGrundbesetzung(dienste, tage)
  // Tag/Nacht optisch unterscheidbar wie im Planer-Grid (Sonne amber/Mond
  // indigo, siehe DienstplanPlanung.tsx) - hier als Textfarbe des T/N-Kürzels
  // plus leichter Hintergrundtönung der Nachtzeile.
  const ABSCHNITT_FARBE = { tag: { text: '#b45309', bg: '#fff' }, nacht: { text: '#4338ca', bg: '#f9fafb' } } as const

  const gruppenKopfZellen = gruppenSpans.map(({ gruppe, span }, index) => {
    const letzteGruppe = index === gruppenSpans.length - 1
    return `<th colspan="${span}" class="person-kopf" style="${letzteGruppe ? '' : 'border-right:1.5pt solid #333;'}">${escHtml(DIENSTPLAN_GRUPPE_LABEL[gruppe])}</th>`
  }).join('')
  const personenKopfZellen = personen.map(person => `<th class="person-kopf" style="${spaltenRand.get(person.id)}">${escHtml(person.kurzname)}</th>`).join('')

  const tageZeilen = tage.map(datum => {
    const [, , tagText] = datum.split('-')
    const datumObjekt = datumAusIso(datum)
    const wochentag = datumObjekt.getDay()
    const besondererTag = wochentag === 0 || wochentag === 6 || isAustrianHoliday(datumObjekt)
    return (['tag', 'nacht'] as const).map(abschnitt => {
      const fehlend = (fehlendeGrund.get(datum) ?? []).some(text => text.endsWith(abschnitt === 'tag' ? '(Tag)' : '(Nacht)'))
      const zeilenHintergrund = besondererTag ? hex(abschnitt === 'tag' ? besondererTagFarben.bg : besondererTagFarben.bgNacht) : ABSCHNITT_FARBE[abschnitt].bg
      const datumZelle = abschnitt === 'tag' ? `<td rowspan="2" class="datum">${WOCHENTAG_LABEL[wochentag]} ${tagText}.</td>` : ''
      const abschnittZelle = `<td class="abschnitt" style="${fehlend ? 'background:#fecaca;color:#991b1b;' : `color:${ABSCHNITT_FARBE[abschnitt].text};`}">${ABSCHNITT_LABEL[abschnitt]}</td>`
      const personenZellen = personen.map(person => {
        const zeilen = (zeilenProPersonUndAbschnitt.get(`${person.id}|${datum}|${abschnitt}`) ?? []).slice().sort((a, b) => a.zeile - b.zeile)
        const absenzKategorie = (zeilenProPersonUndTag.get(`${person.id}|${datum}`) ?? []).find(zeile => zeile.kategorie !== 'dienst')?.kategorie
          ?? effektiveAbwesenheit.get(`${person.id}|${datum}`)
        const absenzFarben = absenzKategorie ? kategorieFarbKlassen(absenzKategorie, kategorieFarben) : null
        const markierterZeile = zeilen.find(zeile => zeile.markierung_id)
          ?? (zeilenProPersonUndTag.get(`${person.id}|${datum}`) ?? []).find(zeile => zeile.kategorie !== 'dienst' && zeile.markierung_id)
        const markierung = markierterZeile?.markierung_id ? markierungenById.get(markierterZeile.markierung_id) : undefined
        const markierungFarben = markierung ? markierungFarbKlassen(markierung.farbe) : null
        const farben = absenzFarben ?? markierungFarben
        const hintergrund = farben ? hex(abschnitt === 'tag' ? farben.bg : farben.bgNacht) : zeilenHintergrund
        const textfarbe = farben ? hex(farben.text) : '#000'
        const text = zeilen.map(zeile => escHtml(formatDienstAnzeige(zeile))).join('<br>')
        return `<td style="background:${hintergrund};color:${textfarbe};${spaltenRand.get(person.id)}">${text}</td>`
      }).join('')
      return `<tr>${datumZelle}${abschnittZelle}${personenZellen}</tr>`
    }).join('')
  }).join('')

  const auswertungZeilen = (() => {
    const dienstePerPerson = new Map<string, DienstplanDruckZeile[]>()
    for (const zeile of dienste) {
      const liste = dienstePerPerson.get(zeile.beamter_id) ?? []
      liste.push(zeile)
      dienstePerPerson.set(zeile.beamter_id, liste)
    }
    const ueberstundenMarkierungId = markierungen.find(markierung => markierung.kategorie === 'ueberstunden')?.id ?? null
    const auswertungByPersonId = new Map(personen.map(person => {
      const zeilen = dienstePerPerson.get(person.id) ?? []
      const stunden = persoenlicheStundenUebersicht(zeilen).gesamt + abwesenheitsStunden(zeilen, stundenProWerktag)
      return [person.id, { stunden, arten: zaehleDienstarten(zeilen, ueberstundenMarkierungId) }] as const
    }))
    const zeilenDefinition = [
      { label: 'Stunden', wert: (personId: string) => formatStunden(auswertungByPersonId.get(personId)?.stunden ?? 0) },
      { label: 'Grund Tag', wert: (personId: string) => String(auswertungByPersonId.get(personId)?.arten.grundTag ?? 0) },
      { label: 'Grund Nacht', wert: (personId: string) => String(auswertungByPersonId.get(personId)?.arten.grundNacht ?? 0) },
      { label: 'Zusatz Tag', wert: (personId: string) => String(auswertungByPersonId.get(personId)?.arten.zusatzTag ?? 0) },
      { label: 'Zusatz Nacht', wert: (personId: string) => String(auswertungByPersonId.get(personId)?.arten.zusatzNacht ?? 0) },
      { label: 'Überstunden', wert: (personId: string) => String(auswertungByPersonId.get(personId)?.arten.ueberstunden ?? 0) },
      {
        label: 'Gesamt', wert: (personId: string) => {
          const arten = auswertungByPersonId.get(personId)?.arten
          return String(arten ? arten.grundTag + arten.grundNacht + arten.zusatzTag + arten.zusatzNacht : 0)
        },
      },
    ]
    return zeilenDefinition.map(({ label, wert }, index) => {
      const zellen = personen.map(person => `<td style="${spaltenRand.get(person.id)}">${wert(person.id)}</td>`).join('')
      return `<tr${index === 0 ? ' style="border-top:1.5pt solid #333;"' : ''}><td colspan="2" class="auswertung-label">${label}</td>${zellen}</tr>`
    }).join('')
  })()

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Dienstplan ${escHtml(input.monatLabel)}</title><style>
  @page { size: A4 landscape; margin: 10mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Calibri, sans-serif; font-size: 6pt; color: #000; line-height: 1.2; }
  ${LETTERHEAD_CSS}
  .kt { font-size: 14pt; font-weight: bold; margin-bottom: 4mm; }
  table.plan { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.plan th, table.plan td { border: 0.5pt solid #ccc; padding: 0.6mm 0.4mm; text-align: center; overflow: hidden; white-space: nowrap; }
  table.plan th { background: #f2f2f2; font-weight: bold; }
  table.plan th.person-kopf { white-space: normal; word-break: break-word; overflow: visible; line-height: 1.05; vertical-align: bottom; font-size: 5.5pt; }
  table.plan td.datum { width: 13mm; text-align: left; font-weight: bold; white-space: nowrap; }
  table.plan td.abschnitt { width: 5mm; font-weight: bold; color: #78716c; }
  table.plan td.auswertung-label { text-align: left; font-weight: bold; background: #f2f2f2; }
  .foot { margin-top: 6mm; font-size: 7pt; color: #444; display: flex; justify-content: space-between; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  ${letterheadBlock(input.bearbeiterName)}
  ${referenceLineBlock()}
  <div class="kt">Dienstplan ${escHtml(input.monatLabel)}</div>
  <table class="plan">
    <thead>
      <tr><th colspan="2"></th>${gruppenKopfZellen}</tr>
      <tr><th colspan="2">Datum</th>${personenKopfZellen}</tr>
    </thead>
    <tbody>${personen.length === 0 ? `<tr><td colspan="2">Keine Diensteinträge in diesem Monat.</td></tr>` : tageZeilen}</tbody>
    ${personen.length > 0 ? `<tfoot>${auswertungZeilen}</tfoot>` : ''}
  </table>
  <div class="foot"><span>Dienstplan · Ausdruck</span><span>DVR 0036030</span></div>
</body></html>`
}

export function generateDienstplanDruckPdf(input: DienstplanDruckInput): void {
  openPrintHtml(buildDienstplanDruckHtml(input))
}
