import { describe, it, expect } from 'vitest'
import {
  applyInventoryDelta,
  buildInventoryMap,
  inventoryKey,
  inventoryDeltaOnIssue,
  inventoryDeltaOnGoodsIn,
  canShortcutToReadyForIssue,
  routeWaitingOrder,
  planGoodsIn,
  inventoryLineLabel,
  inventoryDeleteConfirm,
  isInventoryDeleteBlocked,
  planInventoryDeleteResult,
} from './inventory'

describe('inventoryKey / buildInventoryMap', () => {
  it('baut die product+size-Map wie in Lager und Bestellungen', () => {
    expect(inventoryKey('p1', 'M')).toBe('p1__M')
    expect(buildInventoryMap([
      { product_id: 'p1', size: 'M', quantity: 4 },
      { product_id: 'p1', size: 'L', quantity: 1 },
    ])).toEqual({ p1__M: 4, p1__L: 1 })
  })
})

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

describe('Bestandseintrag löschen', () => {
  it('benennt Artikel und Größe für Bestätigung und Audit', () => {
    expect(inventoryLineLabel('Diensthose', '52', ['50', '52'])).toBe('Diensthose · Gr. 52')
    expect(inventoryLineLabel('  Hemd  ', 'M', ['S', 'M', 'L'])).toBe('Hemd · Gr. M')
    expect(inventoryLineLabel(null, '44I', ['44I', '44II'])).toBe('Artikel · Gr. 44')
    expect(inventoryDeleteConfirm('Diensthose', '52', 3, ['50', '52'])).toBe(
      'Soll «Diensthose» Gr. 52 wirklich aus dem Bestand gelöscht werden? Aktueller Bestand: 3×.',
    )
    expect(inventoryDeleteConfirm('', 'M', 0, ['M'])).toBe(
      'Soll «Artikel» Gr. M wirklich aus dem Bestand gelöscht werden? Aktueller Bestand: 0×.',
    )
  })

  it('erkennt Foreign-Key-Sperren und plant hartes Löschen oder Nullsetzen', () => {
    expect(isInventoryDeleteBlocked({ code: '23503', message: 'violates foreign key constraint' })).toBe(true)
    expect(isInventoryDeleteBlocked({
      code: 'PGRST116',
      message: 'update or delete on table "inventory" violates foreign key constraint on inventory_movements',
    })).toBe(true)
    expect(isInventoryDeleteBlocked({ code: '42501', message: 'permission denied' })).toBe(false)

    expect(planInventoryDeleteResult(null, 'Diensthose · Gr. 52')).toEqual({
      kind: 'deleted',
      error: null,
      auditAction: 'Bestand gelöscht',
    })
    expect(planInventoryDeleteResult({ code: '23503' }, 'Diensthose · Gr. 52')).toEqual({
      kind: 'zeroed',
      error: '«Diensthose · Gr. 52» kann nicht vollständig entfernt werden, weil noch Buchungen oder Bestellungen darauf verweisen – der Bestand wurde auf 0 gesetzt.',
      auditAction: 'Bestand auf 0 gesetzt',
    })
    expect(planInventoryDeleteResult({ code: '23503' }, 'Diensthose · Gr. 52', { message: 'denied' })).toEqual({
      kind: 'blocked',
      error: '«Diensthose · Gr. 52» kann nicht gelöscht werden.',
      auditAction: null,
    })
    expect(planInventoryDeleteResult({ code: '42501', message: 'permission denied' }, 'Diensthose · Gr. 52')).toEqual({
      kind: 'failed',
      error: 'permission denied',
      auditAction: null,
    })
  })
})
