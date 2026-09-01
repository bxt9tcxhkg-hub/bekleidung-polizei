import type { Order } from './types'

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

export type KurzbriefItem = { artNr: string; productName: string; size: string; totalQty: number }

export function generateKurzbrief(items: KurzbriefItem[], senderName: string, now = new Date()): void {
  const userName = escHtml(senderName || '–')
  const tableRows = items.map(g =>
    `<tr><td>${escHtml(g.artNr)}</td><td>${escHtml(g.productName)}</td><td class="b">${escHtml(g.size)}</td><td class="b c">${g.totalQty}</td></tr>`,
  ).join('\n')
  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Kurzbrief</title><style>
  @page{size:A4;margin:20mm 25mm 20mm 25mm}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Calibri,Arial,sans-serif;font-size:12pt;color:#000;line-height:1.4}
  .lh{font-size:8pt;line-height:1.6;margin-bottom:5mm}
  .lh strong{font-weight:bold}
  .ra{font-size:8pt;border-bottom:1px solid #666;padding-bottom:1mm;margin-bottom:4mm;color:#333}
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
<div class="lh">
  STADT DORNBIRN &nbsp;<strong>Polizei</strong><br>
  Rathausplatz 2 &nbsp;A 6850 Dornbirn<br>
  ${userName}<br>
  T +43 5572 222 00 &nbsp;&nbsp; F +43 5572 330 08 &nbsp;&nbsp; polizei@dornbirn.at
</div>
<div class="ra">STADT DORNBIRN Polizei, Rathausplatz 2, A-6850 Dornbirn</div>
<div class="ad">
  <div class="rc">An<br>Bundesministerium für Inneres<br>Bekleidungswirtschaftsfonds der Exekutive<br>Liesinger Flur-Gasse 8<br>1230 Wien</div>
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
    const dg = u.dienstnummer ? ` · DG ${u.dienstnummer}` : ''
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
