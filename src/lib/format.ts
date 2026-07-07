const EUR = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Formatiert einen Betrag deutsch: 1234.5 → "€ 1.234,50" */
export function fmtEUR(amount: number): string {
  return `€ ${EUR.format(amount)}`
}
