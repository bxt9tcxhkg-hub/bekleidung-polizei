import { groupSizes, sizeLabel } from './sizes'
import { receivedNextStatus } from './workflow'
import type { OrderStatus } from './types'

export type DbErrorLike = { code?: string | null; message?: string | null }

export function inventoryKey(productId: string, size: string): string {
  return `${productId}__${size}`
}

export function buildInventoryMap(rows: { product_id: string; size: string; quantity: number }[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const e of rows) map[inventoryKey(e.product_id, e.size)] = e.quantity
  return map
}

/** Bestand nach Buchung, nie negativ (wie adjust_inventory in der DB). */
export function applyInventoryDelta(currentQty: number, delta: number): number {
  return Math.max(0, currentQty + delta)
}

/** Ausgabe: Bestand um die ausgegebene Menge senken. */
export function inventoryDeltaOnIssue(issuedQty: number): number {
  return -Math.max(0, issuedQty)
}

/**
 * Massa-/Lager-Wareneingang: normale Artikel erhöhen den freien Bestand.
 * Schneider-pflichtige Artikel gehen nicht ins freie Lager.
 */
export function inventoryDeltaOnGoodsIn(receivedQty: number, needsTailoring: boolean): number {
  if (needsTailoring) return 0
  return Math.max(0, receivedQty)
}

/**
 * Shortcut approved → ready_for_issue nur bei echtem Bestand und ohne Schneiderpflicht.
 * Sonst Lieferanten-/Schneiderweg.
 */
export function canShortcutToReadyForIssue(
  stockQty: number,
  neededQty: number,
  needsTailoring: boolean,
): boolean {
  return !needsTailoring && neededQty > 0 && stockQty >= neededQty
}

export type WaitingRoute = 'ready_for_issue' | 'at_tailor' | 'keep_approved'

/** Nach physischem Wareneingang: Schneider-Artikel zum Schneider, sonst Ausgabe wenn Bestand reicht. */
export function routeWaitingOrder(
  stockQty: number,
  neededQty: number,
  needsTailoring: boolean,
): WaitingRoute {
  if (needsTailoring) return 'at_tailor'
  if (canShortcutToReadyForIssue(stockQty, neededQty, false)) return 'ready_for_issue'
  return 'keep_approved'
}

export type GoodsInPlan = {
  orderId: string
  status: Extract<OrderStatus, 'at_tailor' | 'ready_for_issue'>
  inventoryDelta: number
  quantityReceived: number
  needsTailorJob: boolean
}

export function planGoodsIn(input: {
  id: string
  quantity: number
  quantityReceived?: number | null
  needsTailoring: boolean
}): GoodsInPlan {
  const quantityReceived = input.quantityReceived != null ? input.quantityReceived : input.quantity
  const status = receivedNextStatus(input.needsTailoring)
  return {
    orderId: input.id,
    status,
    inventoryDelta: inventoryDeltaOnGoodsIn(quantityReceived, input.needsTailoring),
    quantityReceived,
    needsTailorJob: input.needsTailoring,
  }
}

/** Anzeige für einen Bestandseintrag (Artikel + Größe), wie in der Lagerverwaltung. */
export function inventoryLineLabel(
  name: string | null | undefined,
  size: string,
  productSizes?: string[] | null,
): string {
  const article = name?.trim() || 'Artikel'
  const sizes = productSizes && productSizes.length > 0 ? productSizes : [size]
  const grouped = groupSizes(sizes) !== null
  return `${article} · Gr. ${sizeLabel(size, grouped)}`
}

export function inventoryDeleteConfirm(
  name: string | null | undefined,
  size: string,
  quantity: number,
  productSizes?: string[] | null,
): string {
  const article = name?.trim() || 'Artikel'
  const sizes = productSizes && productSizes.length > 0 ? productSizes : [size]
  const grouped = groupSizes(sizes) !== null
  const qty = Number.isFinite(quantity) ? Math.max(0, quantity) : 0
  return `Soll «${article}» Gr. ${sizeLabel(size, grouped)} wirklich aus dem Bestand gelöscht werden? Aktueller Bestand: ${qty}×.`
}

export function isInventoryDeleteBlocked(
  error: DbErrorLike | string | null | undefined,
): boolean {
  const code = typeof error === 'string' ? '' : (error?.code ?? '')
  const message = typeof error === 'string' ? error : (error?.message ?? '')
  if (code === '23503') return true
  if (!message) return false
  if (/23503/.test(message)) return true
  return /foreign key|foreign_key|referential integrity/i.test(message)
}

export type InventoryDeleteKind = 'deleted' | 'zeroed' | 'blocked' | 'failed'

export function planInventoryDeleteResult(
  deleteError: DbErrorLike | string | null | undefined,
  label: string,
  zeroError?: DbErrorLike | string | null,
): {
  kind: InventoryDeleteKind
  error: string | null
  auditAction: string | null
} {
  if (!deleteError) {
    return { kind: 'deleted', error: null, auditAction: 'Bestand gelöscht' }
  }
  if (isInventoryDeleteBlocked(deleteError)) {
    if (!zeroError) {
      return {
        kind: 'zeroed',
        error: `«${label}» kann nicht vollständig entfernt werden, weil noch Buchungen oder Bestellungen darauf verweisen – der Bestand wurde auf 0 gesetzt.`,
        auditAction: 'Bestand auf 0 gesetzt',
      }
    }
    return {
      kind: 'blocked',
      error: `«${label}» kann nicht gelöscht werden.`,
      auditAction: null,
    }
  }
  const raw = (typeof deleteError === 'string' ? deleteError : deleteError.message)?.trim()
  return {
    kind: 'failed',
    error: raw || 'Löschen fehlgeschlagen.',
    auditAction: null,
  }
}
