import { describe, it, expect } from 'vitest'
import {
  applyInventoryDelta,
  inventoryDeltaOnIssue,
  inventoryDeltaOnGoodsIn,
  canShortcutToReadyForIssue,
  routeWaitingOrder,
  planGoodsIn,
} from './inventory'

describe('Ausgabe vor Nachbestellung (Massa noch unterwegs)', () => {
  it('senkt den Bestand bei Ausgabe, auch wenn eine Nachbestellung noch nicht da ist', () => {
    let stock = 10
    stock = applyInventoryDelta(stock, inventoryDeltaOnIssue(3))
    expect(stock).toBe(7)
    // Nachbestellung noch inbound — Bestand bleibt reduziert
    expect(inventoryDeltaOnGoodsIn(0, false)).toBe(0)
    expect(stock).toBe(7)
  })

  it('erhöht den Bestand wieder, wenn der Massa-Wareneingang für normale Artikel kommt', () => {
    let stock = 10
    stock = applyInventoryDelta(stock, inventoryDeltaOnIssue(3))
    expect(stock).toBe(7)
    stock = applyInventoryDelta(stock, inventoryDeltaOnGoodsIn(5, false))
    expect(stock).toBe(12)
  })
})

describe('Schneider-pflichtiges Oberteil', () => {
  it('geht beim Wareneingang zum Schneider, nicht ins freie Lager', () => {
    const stockBefore = 4
    const plan = planGoodsIn({
      id: 'jacke-1',
      quantity: 1,
      needsTailoring: true,
    })
    expect(plan.status).toBe('at_tailor')
    expect(plan.needsTailorJob).toBe(true)
    expect(plan.inventoryDelta).toBe(0)
    expect(applyInventoryDelta(stockBefore, plan.inventoryDelta)).toBe(4)
  })

  it('normale Artikel gehen nach Wareneingang ins Lager und zur Ausgabe', () => {
    const plan = planGoodsIn({
      id: 'hose-1',
      quantity: 2,
      needsTailoring: false,
    })
    expect(plan.status).toBe('ready_for_issue')
    expect(plan.needsTailorJob).toBe(false)
    expect(plan.inventoryDelta).toBe(2)
    expect(applyInventoryDelta(8, plan.inventoryDelta)).toBe(10)
  })
})

describe('Shortcut approved → ready_for_issue', () => {
  it('nur bei verfügbarem Bestand und ohne Schneiderpflicht', () => {
    expect(canShortcutToReadyForIssue(5, 2, false)).toBe(true)
    expect(canShortcutToReadyForIssue(2, 2, false)).toBe(true)
    expect(canShortcutToReadyForIssue(1, 2, false)).toBe(false)
    expect(canShortcutToReadyForIssue(10, 1, true)).toBe(false)
    expect(canShortcutToReadyForIssue(0, 1, false)).toBe(false)
  })

  it('leitet wartende Bestellungen nach Wareneingang fachlich weiter', () => {
    expect(routeWaitingOrder(5, 1, true)).toBe('at_tailor')
    expect(routeWaitingOrder(5, 1, false)).toBe('ready_for_issue')
    expect(routeWaitingOrder(0, 1, false)).toBe('keep_approved')
  })
})
