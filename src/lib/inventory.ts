import { receivedNextStatus } from './workflow'
import type { OrderStatus } from './types'

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
