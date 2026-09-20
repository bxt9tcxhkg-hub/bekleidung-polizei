import type { Order, PoliceRank } from './types'

const RANK_ABBREV: Record<PoliceRank, string> = {
  Aspirant: 'Asp',
  Inspektor: 'Insp',
  Revierinspektor: 'RevInsp',
  Gruppeninspektor: 'GrInsp',
  Bezirksinspektor: 'BezInsp',
  Abteilungsinspektor: 'AbtInsp',
  Kontrollinspektor: 'KontrInsp',
  Chefinspektor: 'ChefInsp',
}

/** Name auf Ausdrucken/Formularen: "<Dienstgrad-Abkürzung> <NACHNAME>" statt des vollen Anzeigenamens - ohne hinterlegten Dienstgrad (z. B. Systemkonten) bleibt der Name unverändert. */
export function officerPrintName(person: { name?: string | null; dienstgrad?: PoliceRank | null } | null | undefined): string {
  const name = person?.name?.trim()
  if (!name) return '–'
  if (!person?.dienstgrad) return name
  const nachname = name.split(/\s+/).pop()
  if (!nachname) return name
  return `${RANK_ABBREV[person.dienstgrad]} ${nachname.toUpperCase()}`
}

export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function openPrintHtml(html: string): void {
  const win = window.open('', '_blank')
  if (!win) {
    alert('Popup wurde blockiert – bitte Popup-Blocker deaktivieren.')
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}

const DE_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

function dateLong(now: Date): string {
  return `${String(now.getDate()).padStart(2, '0')}. ${DE_MONTHS[now.getMonth()]} ${now.getFullYear()}`
}

function dateShort(now: Date): string {
  return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`
}

// Das "DORNBIRN"-Wortmarken-Logo aus dem Briefkopf - 1:1 aus dem in den
// offiziellen Word-Vorlagen (Straßenzustandsbericht/Überstundenmeldung-
// Automation, .dotm) eingebetteten Vektor-Logo (word/media/image1.wmf)
// extrahiert (wmf2svg), nicht nachgezeichnet. Zwei Objekte im Original: die
// Buchstaben (schwarz) und ein separates Rechteck exakt an der Stelle des
// "I" - dessen Farbe ging bei der WMF→SVG-Konvertierung verloren, hier auf
// das Rot des Stadtwappens (public/wappen-dornbirn.svg, #da121a) gesetzt,
// das dem "I"-Akzent der echten Dornbirn-Wortmarke entspricht.
const DORNBIRN_LOGO_SVG = `<svg class="lh-logo" viewBox="0 0 768 118" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dornbirn">
  <path d="M692.987915,116.156250L711.723083,116.156250 711.723083,42.689903 713.142395,42.689903 737.554871,116.156250 767.076904,116.156250 767.076904,23.401442 748.625610,23.401442 748.625610,96.867783 747.206299,96.867783 723.361572,23.401442 692.987915,23.401442 692.987915,116.156250 ZM637.917969,54.319710L637.917969,54.319710 637.634094,57.439903 637.066406,60.276443 635.930908,62.829327 634.511597,64.814903 632.524475,66.516823 630.253601,67.935089 627.698792,68.786057 624.860107,69.069710 608.963623,69.069710 608.963623,40.420673 624.576294,40.420673 624.576294,40.420673 627.414917,40.704327 629.969666,41.271633 632.240662,42.406250 634.227722,44.108170 635.647034,46.093750 636.782532,48.362980 637.634094,51.199520 637.917969,54.319710 ZM625.427856,85.521629L636.214722,116.156250 656.369202,116.156250 643.595276,80.699524 643.595276,80.699524 646.433899,78.713936 649.272583,76.444710 651.543518,73.608170 653.246704,70.487984 654.949890,67.084129 656.085327,63.396633 656.653137,59.141830 656.937012,54.036057 656.937012,54.036057 656.653137,50.064899 656.369202,46.661057 655.801514,43.257210 654.666016,40.137016 653.530579,37.300480 652.111267,34.747593 650.408081,32.478363 648.420959,30.492788 646.433899,28.790865 643.879150,27.372595 641.324341,25.954327 638.201843,25.103365 635.363159,24.252403 631.956787,23.685097 628.266541,23.401442 624.576294,23.401442 590.796265,23.401442 590.796265,116.156250 608.963623,116.156250 608.963623,85.521629 622.589172,85.521629 625.427856,85.521629 ZM465.327576,39.853363L465.327576,39.853363 467.314606,40.137016 469.301666,40.420673 471.004852,41.271633 472.708069,42.406250 473.843506,43.824516 474.979004,45.526440 475.546722,47.795673 475.830597,50.348557 475.830597,50.348557 475.546722,52.901440 474.979004,55.170670 474.127380,57.156250 472.708069,58.574516 471.288696,59.992790 469.585541,60.843750 467.598450,61.411057 465.327576,61.694710 449.998779,61.694710 449.998779,39.853363 465.327576,39.853363 ZM465.611420,77.579323L465.611420,77.579323 467.882324,77.579323 470.153259,78.146629 472.140350,78.997589 473.843506,80.132202 475.262878,81.834137 476.398315,83.536057 476.966034,85.805283 477.249908,88.358170 477.249908,88.358170 476.966034,91.194710 476.398315,93.463943 475.262878,95.449516 473.843506,96.867783 472.140350,98.002403 470.153259,98.853363 468.166168,99.420670 465.611420,99.704323 449.998779,99.704323 449.998779,77.579323 465.611420,77.579323 ZM431.831360,23.401442L431.831360,116.156250 466.746857,116.156250 466.746857,116.156250 469.869385,116.156250 472.708069,115.872597 475.830597,115.305290 478.385376,114.737976 481.223999,113.603363 483.494965,112.752403 485.765900,111.334129 488.036835,109.915863 489.739990,108.213936 491.443207,106.228363 492.862518,104.242790 494.281830,101.689896 495.133484,99.137016 495.985046,96.300476 496.268921,93.180290 496.552765,90.060089 496.552765,90.060089 496.268921,85.805283 495.701202,82.117790 494.849609,78.713936 493.714111,76.161057 492.010956,73.891823 490.023865,71.906250 487.469055,70.204330 484.630402,68.786057 484.630402,68.786057 487.185211,66.800476 489.172272,65.098557 490.875458,62.829327 492.294800,60.560097 493.430267,58.007210 493.997986,54.603363 494.565704,51.199520 494.565704,46.944710 494.565704,46.944710 494.565704,43.824516 493.997986,40.987980 493.430267,38.435093 492.294800,36.165867 491.159302,33.896633 489.739990,31.911057 488.036835,30.209135 486.333618,28.790865 484.062683,27.372595 482.075653,26.237980 479.520844,25.387018 477.249908,24.536057 474.411224,23.968750 471.856476,23.685097 466.179138,23.401442 431.831360,23.401442 ZM317.717316,116.156250L336.452454,116.156250 336.452454,42.689903 337.871796,42.689903 362.284271,116.156250 392.090149,116.156250 392.090149,23.401442 373.355042,23.401442 373.355042,96.867783 371.935699,96.867783 348.374817,23.401442 317.717316,23.401442 317.717316,116.156250 ZM260.092560,54.319710L260.092560,54.319710 259.808716,57.439903 258.957092,60.276443 258.105499,62.829327 256.402313,64.814903 254.699112,66.516823 252.428177,67.935089 249.873398,68.786057 247.034729,69.069710 231.138245,69.069710 231.138245,40.420673 246.750870,40.420673 246.750870,40.420673 249.305649,40.704327 251.860458,41.271633 254.131378,42.406250 256.118439,44.108170 257.821655,46.093750 258.957092,48.362980 259.808716,51.199520 260.092560,54.319710 ZM247.602463,85.521629L258.389374,116.156250 278.543823,116.156250 265.769867,80.699524 265.769867,80.699524 268.608521,78.713936 271.163330,76.444710 273.434265,73.608170 275.421326,70.771637 276.840637,67.084129 277.976105,63.396633 278.827698,59.141830 279.111572,54.036057 279.111572,54.036057 278.827698,50.064899 278.543823,46.661057 277.692261,43.257210 276.840637,40.137016 275.705170,37.300480 274.285858,34.747593 272.582672,32.478363 270.595581,30.492788 268.324677,28.790865 266.053741,27.372595 263.215088,25.954327 260.376434,25.103365 257.253906,24.252403 253.847504,23.685097 250.441116,23.401442 246.750870,23.401442 212.686966,23.401442 212.686966,116.156250 231.138245,116.156250 231.138245,85.521629 244.763809,85.521629 247.602463,85.521629 ZM139.165726,117.858170L139.165726,117.858170 143.991440,117.574516 148.533295,117.007210 152.791290,116.156250 156.481537,114.737976 159.887939,113.036057 163.010452,111.050476 165.565247,108.497589 168.120041,105.661057 170.107101,102.540863 171.810303,99.137016 173.229630,95.165863 174.365082,90.911049 175.216690,86.372597 176.068283,81.266830 176.352142,76.161057 176.352142,70.487984 176.352142,70.487984 176.352142,64.814903 176.068283,59.425484 175.216690,54.319710 174.365082,49.781246 173.229630,45.242786 171.810303,41.271633 170.107101,37.584133 168.120041,34.463940 165.565247,31.343750 163.010452,28.790865 159.887939,26.805288 156.481537,24.819710 152.791290,23.685097 148.533295,22.550480 143.991440,21.983171 139.165726,21.699518 139.165726,21.699518 134.056137,21.983171 129.514297,22.550480 125.540169,23.685097 121.849907,24.819710 118.443520,26.805288 115.321007,28.790865 112.482338,31.343750 110.211411,34.463940 108.224358,37.584133 106.521156,41.271633 104.817963,45.242786 103.682495,49.781246 102.830894,54.319710 102.263176,59.425484 101.979301,64.814903 101.979301,70.487984 101.979301,70.487984 101.979301,76.161057 102.263176,81.266830 102.830894,86.372597 103.682495,90.911049 104.817963,95.165863 106.521156,99.137016 108.224358,102.540863 110.211411,105.661057 112.482338,108.497589 115.321007,111.050476 118.443520,113.036057 121.849907,114.737976 125.540169,116.156250 129.514297,117.007210 134.056137,117.574516 139.165726,117.858170 ZM139.165726,100.555283L139.165726,100.555283 136.610931,100.555283 134.340012,100.271629 132.352951,99.704323 130.365891,98.853363 128.946564,98.002403 127.243362,96.867783 126.107903,95.165863 124.972435,93.463943 123.836975,91.478363 122.985374,89.492783 122.417641,86.939903 121.849907,84.103363 121.282181,77.862976 120.998306,70.487984 120.998306,70.487984 121.282181,62.829327 121.849907,56.588943 122.417641,53.468750 122.985374,50.915863 123.836975,48.646633 124.972435,46.661057 126.107903,44.675480 127.243362,43.257210 128.946564,41.838943 130.365891,40.704327 132.352951,39.853363 134.340012,39.286057 136.610931,39.002403 139.165726,38.718750 139.165726,38.718750 141.720520,39.002403 143.707581,39.286057 145.978516,39.853363 147.681702,40.704327 149.384903,41.838943 150.804230,43.257210 152.223557,44.675480 153.359024,46.661057 154.210617,48.646633 155.062210,50.915863 155.913818,53.468750 156.481537,56.588943 157.049271,62.829327 157.333130,70.487984 157.333130,70.487984 157.049271,77.862976 156.481537,84.103363 155.913818,86.939903 155.062210,89.492783 154.210617,91.478363 153.359024,93.463943 152.223557,95.165863 150.804230,96.867783 149.384903,98.002403 147.681702,98.853363 145.978516,99.704323 143.707581,100.271629 141.720520,100.555283 139.165726,100.555283 ZM49.747993,67.935089L49.747993,67.935089 49.747993,74.742790 49.180264,80.983177 48.612534,83.536057 48.044800,86.088936 47.477070,88.641823 46.625473,90.627396 45.490009,92.612984 44.070679,94.314903 42.651352,95.733170 40.664291,96.867783 38.677231,97.718750 36.406303,98.569710 33.567646,98.853363 30.728987,99.137016 19.090488,99.137016 19.090488,40.420673 30.728987,40.420673 30.728987,40.420673 33.567646,40.420673 36.406303,40.704327 38.677231,41.271633 40.664291,42.122597 42.651352,42.973557 44.070679,44.108170 45.490009,45.526440 46.625473,47.228363 47.477070,48.930286 48.044800,50.915863 48.612534,53.185097 49.180264,55.737976 49.747993,61.411057 49.747993,67.935089 ZM30.728987,116.156250L30.728987,116.156250 36.406303,115.872597 41.232021,115.305290 45.773872,114.454323 50.031864,113.036057 53.438251,111.334129 56.560776,109.064896 59.399437,106.795670 61.670361,103.959137 63.657421,100.555283 65.076744,97.151436 66.496078,93.180290 67.347679,88.925476 68.199272,84.103363 68.483139,78.997589 68.767006,73.608170 69.050873,67.935089 69.050873,67.935089 68.767006,62.545673 68.483139,57.156250 67.915405,52.617786 67.347679,48.079327 66.212212,44.108170 64.792885,40.420673 63.373554,37.016827 61.386494,34.180286 58.831699,31.627403 56.276909,29.358171 53.154388,27.656248 49.464134,25.954327 45.490009,24.819710 41.232021,23.968750 36.122440,23.401442 30.728987,23.401442 0.923077,23.401442 0.923077,116.156250 30.728987,116.156250 Z" fill="#000"/>
  <path d="M529.481201,92.896637L550.203430,92.896637 550.203430,0.141827 529.481201,0.141827 529.481201,92.896637 Z" fill="#da121a"/>
</svg>`

// Gemeinsamer Briefkopf aller Dornbirn-Polizei-Dokumente (Kurzbrief,
// Straßenzustandsbericht, Bescheide, Überstundenmeldung, ...) - Adresse
// linksbündig mit je einer Angabe pro Zeile, "Polizei" und (falls angegeben)
// die Sachbearbeiter/in-Zeile fett, das Dornbirn-Logo rechts daneben - exakt
// wie im offiziellen Briefkopf. Jedes generierte Dokument ist ein
// eigenständiges HTML (siehe openPrintHtml), daher muss auch das CSS pro
// Dokument mitgegeben werden - LETTERHEAD_CSS dort einbinden.
export const LETTERHEAD_CSS = `.lh{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;margin-bottom:6mm}.lh-address{font-size:8pt;line-height:1.15}.lh-address strong{font-weight:bold}.lh-logo{width:34mm;height:auto;flex-shrink:0}.ra{font-size:8pt;text-align:right;border-bottom:1px solid #666;padding-bottom:1mm;margin-bottom:6mm;color:#333}`
export function letterheadBlock(sachbearbeiter?: string | null): string {
  return `<div class="lh">
  <div class="lh-address">
    STADT DORNBIRN<br>
    <strong>Polizei</strong><br>
    Rathausplatz 2 &nbsp;A 6850 Dornbirn<br>
    ${sachbearbeiter ? `<strong>${escHtml(sachbearbeiter)}</strong><br>` : ''}
    T +43 5572 222 00<br>
    F +43 5572 330 08<br>
    polizei@dornbirn.at
  </div>
  ${DORNBIRN_LOGO_SVG}
</div>`
}

/** Ersetzt die frühere, redundante Adresswiederholung unter dem Briefkopf: rechtsbündiges Erstellungsdatum des Ausdrucks. */
export function referenceLineBlock(now = new Date()): string {
  return `<div class="ra">${escHtml(dateShort(now))}</div>`
}

export type KurzbriefItem = { artNr: string; productName: string; size: string; totalQty: number }

const MASSA_ADDRESSEE = ['Bundesministerium für Inneres', 'Bekleidungswirtschaftsfonds der Exekutive', 'Liesinger Flur-Gasse 8', '1230 Wien']
export const EIGENBESCHAFFUNG_ADDRESSEE = ['Eigenbeschaffung', '(Lieferant bitte händisch eintragen)']

export function generateKurzbrief(
  items: KurzbriefItem[],
  senderName: string,
  now = new Date(),
  options: { addressee?: string[] } = {},
): void {
  const userName = escHtml(senderName || '–')
  const addressee = options.addressee ?? MASSA_ADDRESSEE
  const tableRows = items.map(g =>
    `<tr><td>${escHtml(g.artNr)}</td><td>${escHtml(g.productName)}</td><td class="b">${escHtml(g.size || '–')}</td><td class="b c">${g.totalQty}</td></tr>`,
  ).join('\n')
  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Kurzbrief</title><style>
  @page{size:A4;margin:20mm 25mm 20mm 25mm}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Calibri,Arial,sans-serif;font-size:12pt;color:#000;line-height:1.4}
  ${LETTERHEAD_CSS}
  .ad{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6mm}
  .rc{font-size:12pt;line-height:1.7}
  .dt{font-size:12pt;white-space:nowrap}
  .kt{font-size:18pt;font-weight:bold;margin-bottom:4mm}
  .mt{border-collapse:collapse;margin-bottom:5mm}
  .mt td{font-size:11pt;padding:1px 0;vertical-align:top}
  .mt td:first-child{min-width:60pt;padding-right:8px}
  .bt{font-size:12pt;margin-bottom:3mm}
  .sl{font-size:12pt;font-weight:bold;margin-bottom:2mm}
  .at{width:100%;border-collapse:collapse;margin-bottom:7mm}
  .at th,.at td{border:1px solid #000;padding:2px 5px;font-size:12pt;vertical-align:middle}
  .at th{font-weight:normal;text-align:left}
  .c1{width:22%}.c2{width:47%}.c3{width:14%}.c4{width:17%}
  .b{font-weight:bold}.c{text-align:center}
  .tk{font-size:12pt;margin-bottom:10mm}
  .st{width:100%;border-collapse:collapse}
  .sh td{font-size:11pt;border-top:1px solid #000;padding-top:2mm;width:50%}
  .se td{height:18mm}
  .sn td{font-size:11pt}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
${letterheadBlock(senderName || '–')}
<div class="ad">
  <div class="rc">An<br>${addressee.map(escHtml).join('<br>')}</div>
  <div class="dt">Dornbirn, ${dateLong(now)}</div>
</div>
<div class="kt">Kurzbrief</div>
<table class="mt">
  <tr><td>Betreff:</td><td>Auftrag / Bestellung</td></tr>
  <tr><td>&nbsp;</td><td>&nbsp;</td></tr>
  <tr><td>Bezug:</td><td>---</td></tr>
</table>
<p class="bt">Die ho. Dienststelle der Stadtpolizei Dornbirn übermittelt höflichst den Bestellauftrag vom ${dateShort(now)} für folgende ug. Artikel:</p>
<p class="sl">Standardmannschaft</p>
<table class="at">
  <thead><tr><th class="c1">Artikelnummer</th><th class="c2">Artikel</th><th class="c3">Größe</th><th class="c4 c">Anzahl</th></tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<p class="tk">Vielen herzlichen Dank im Voraus</p>
<table class="st">
  <tr class="sh"><td>Bearbeiter/in:</td><td>Kommandant:</td></tr>
  <tr class="se"><td></td><td></td></tr>
  <tr class="sn"><td>${userName}</td><td>ChefInsp Hans Peter SCHWENDINGER</td></tr>
</table>
</body></html>`
  openPrintHtml(html)
}

export function generateAusgabeliste(orders: Order[], now = new Date()): void {
  const ausgabeOrders = orders
    .filter(o => o.status === 'ready_for_issue' || o.status === 'partially_issued')
    .sort((a, b) => (a.profiles?.name ?? '').localeCompare(b.profiles?.name ?? ''))

  if (ausgabeOrders.length === 0) return

  const byUser: Record<string, { name: string; dienstnummer: string | null; orders: Order[] }> = {}
  ausgabeOrders.forEach(o => {
    const uid = o.user_id
    if (!byUser[uid]) {
      byUser[uid] = {
        name: escHtml(o.profiles?.name ?? '–'),
        dienstnummer: o.profiles?.dienstnummer ? escHtml(o.profiles.dienstnummer) : null,
        orders: [],
      }
    }
    byUser[uid].orders.push(o)
  })

  const userBlocks = Object.values(byUser).map(u => {
    const rows = u.orders.map(o => {
      const avail = o.quantity_received ?? o.quantity
      const issued = o.quantity_issued ?? 0
      const outstanding = avail - issued
      return `<tr>
          <td>${escHtml(o.products?.name ?? '–')}</td>
          <td>${escHtml(o.products?.category ?? '')}</td>
          <td class="center">${escHtml(o.size)}</td>
          <td class="center">${o.quantity}</td>
          <td class="center">${avail}</td>
          <td class="center highlight">${outstanding}</td>
          <td class="sig-col"></td>
        </tr>`
    }).join('\n')
    const dg = u.dienstnummer ? ` · DNr. ${u.dienstnummer}` : ''
    return `<div class="user-block">
        <div class="user-header">${u.name}${dg}</div>
        <table class="items-table">
          <thead><tr>
            <th>Artikel</th>
            <th>Kategorie</th>
            <th class="center">Gr.</th>
            <th class="center">Bestellt</th>
            <th class="center">Verfügbar</th>
            <th class="center">Auszufolgen</th>
            <th class="center">Unterschrift</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
  }).join('\n')

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Ausgabeliste</title><style>
  @page { size: A4; margin: 15mm 18mm 18mm 18mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000; line-height: 1.4; }
  .page-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 14px; }
  .page-title { font-size: 16pt; font-weight: bold; }
  .page-meta { font-size: 9pt; color: #444; text-align: right; }
  .user-block { margin-bottom: 18px; break-inside: avoid; }
  .user-header { font-size: 11pt; font-weight: bold; background: #e8edf5; padding: 4px 8px; border-left: 4px solid #1e40af; margin-bottom: 0; }
  .items-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  .items-table th { background: #f1f4f9; font-weight: semibold; padding: 3px 6px; border: 1px solid #ccc; text-align: left; }
  .items-table td { padding: 4px 6px; border: 1px solid #ccc; }
  .center { text-align: center; }
  .highlight { font-weight: bold; background: #fef9c3; }
  .sig-col { min-width: 80px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <div class="page-header">
    <div>
      <div class="page-title">Ausgabeliste – Bereit zur Ausgabe</div>
      <div style="font-size:9pt;color:#555;margin-top:2px">Stadtpolizei Dornbirn</div>
    </div>
    <div class="page-meta">Erstellt: ${dateLong(now)}<br>Einträge: ${ausgabeOrders.length}</div>
  </div>
  ${userBlocks}
</body></html>`
  openPrintHtml(html)
}
