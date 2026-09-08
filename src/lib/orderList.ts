import type { Order, OrderStatus } from './types'

export type OrderListLine = Omit<Order, 'products' | 'quarters'> & {
  products?: { name: string; category?: string; needs_tailoring?: boolean; sizes?: string[] } | null
  quarters?: { name: string; year?: number; quarter_num?: number } | null
}

export type OrderListGroup = {
  quarterId: string
  quarterName: string
  year: number
  quarterNum: number
  lines: OrderListLine[]
}

/** Benutzer dürfen eingereichte Positionen bis zur tatsächlichen Lieferantenbestellung ändern. */
export function isUserOrderEditable(status: OrderStatus): boolean {
  return status === 'approved' || status === 'pending_approval'
}

/** Eine Sammelliste pro Quartal; ausgegebene Zeilen bleiben in der Gruppe. */
export function groupOrdersByQuarter(orders: OrderListLine[]): OrderListGroup[] {
  const map = new Map<string, OrderListGroup>()
  for (const o of orders) {
    const id = o.quarter_id || 'ohne-quartal'
    let group = map.get(id)
    if (!group) {
      group = {
        quarterId: id,
        quarterName: o.quarters?.name ?? (id === 'ohne-quartal' ? 'Ohne Quartal' : 'Quartal'),
        year: o.quarters?.year ?? 0,
        quarterNum: o.quarters?.quarter_num ?? 0,
        lines: [],
      }
      map.set(id, group)
    }
    group.lines.push(o)
  }
  const groups = [...map.values()]
  groups.sort((a, b) => b.year - a.year || b.quarterNum - a.quarterNum || a.quarterName.localeCompare(b.quarterName, 'de'))
  for (const g of groups) {
    g.lines.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id))
  }
  return groups
}

/** Menge: bei Teilausgabe ausgegeben / bestellt, sonst die bestellte Menge. */
export function orderLineMengeLabel(
  quantity: number,
  quantityIssued: number | null | undefined,
  status: OrderStatus,
): string {
  if (status === 'partially_issued' && quantityIssued != null) {
    return `${quantityIssued} / ${quantity}`
  }
  return String(quantity)
}
