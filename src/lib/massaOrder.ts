export type MassaOrderLine = {
  articleNumber: string
  name: string
  size: string
  quantity: number
}

export type MassaOrderDraft = {
  subject: string
  csv: string
  html: string
  textBody: string
  lineCount: number
}

export type MassaSendResult =
  | { mode: 'simulated'; draft: MassaOrderDraft }
  | { mode: 'mailto'; href: string; draft: MassaOrderDraft }

const CSV_HEADER = 'Artikelnummer;Artikel;Größe;Anzahl'

export function buildMassaCsv(lines: MassaOrderLine[]): string {
  const rows = lines.map(l =>
    [l.articleNumber, l.name, l.size, String(l.quantity)].map(csvCell).join(';'),
  )
  return [CSV_HEADER, ...rows].join('\n')
}

function csvCell(value: string): string {
  if (/[;"\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function aggregateMassaLines(lines: MassaOrderLine[]): MassaOrderLine[] {
  const map = new Map<string, MassaOrderLine>()
  for (const line of lines) {
    const key = `${line.articleNumber}__${line.size}__${line.name}`
    const existing = map.get(key)
    if (existing) existing.quantity += line.quantity
    else map.set(key, { ...line })
  }
  return [...map.values()]
}

export function buildMassaDraft(
  lines: MassaOrderLine[],
  options: { now?: Date; senderName?: string } = {},
): MassaOrderDraft {
  const aggregated = aggregateMassaLines(lines)
  const now = options.now ?? new Date()
  const dateShort = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`
  const subject = `Sammelbestellung Stadtpolizei Dornbirn ${dateShort}`
  const csv = buildMassaCsv(aggregated)
  const sender = options.senderName ?? 'Stadtpolizei Dornbirn'
  const rows = aggregated.map(l =>
    `<tr><td>${esc(l.articleNumber)}</td><td>${esc(l.name)}</td><td>${esc(l.size)}</td><td>${l.quantity}</td></tr>`,
  ).join('')
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${esc(subject)}</title></head><body>
<p>Sammelbestellung an Massa Wien</p>
<p>Absender: ${esc(sender)} · ${esc(dateShort)}</p>
<table border="1" cellpadding="4" cellspacing="0">
<thead><tr><th>Artikelnummer</th><th>Artikel</th><th>Größe</th><th>Anzahl</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`
  const textBody = `${subject}\n\n${csv}\n`
  return { subject, csv, html, textBody, lineCount: aggregated.length }
}

/**
 * Kein SMTP. Ohne mailto-Adresse nur Simulation (Payload prüfbar).
 * Mit Adresse: mailto-Entwurf, den der Sachbearbeiter absendet.
 */
export function sendMassaOrder(
  draft: MassaOrderDraft,
  mailto: string | null | undefined,
): MassaSendResult {
  const to = (mailto ?? '').trim()
  if (!to) return { mode: 'simulated', draft }
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.textBody)}`
  return { mode: 'mailto', href, draft }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
