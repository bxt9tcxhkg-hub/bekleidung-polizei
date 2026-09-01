import { describe, it, expect } from 'vitest'
import { groupOrdersByQuarter, orderLineMengeLabel } from './orderList'
import type { OrderListLine } from './orderList'
import { ORDER_STATUS_LABELS } from './types'

function line(partial: Partial<OrderListLine> & Pick<OrderListLine, 'id' | 'quarter_id' | 'status'>): OrderListLine {
  return {
    user_id: 'u1',
    product_id: 'p1',
    size: 'M',
    quantity: 1,
    unit_price: 10,
    quantity_received: null,
    quantity_issued: null,
    proc_listed: null,
    cancel_reason: null,
    shifted_from: null,
    tailor_job_id: null,
    delivery_id: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: null,
    ...partial,
  }
}

describe('groupOrdersByQuarter', () => {
  it('liefert leere Liste ohne Bestellungen', () => {
    expect(groupOrdersByQuarter([])).toEqual([])
  })

  it('fasst Zeilen desselben Quartals zusammen und lässt Ausgegeben in der Gruppe', () => {
    const groups = groupOrdersByQuarter([
      line({
        id: '1',
        quarter_id: 'q1',
        status: 'ready_for_issue',
        quarters: { name: 'Q3 2026', year: 2026, quarter_num: 3 },
        products: { name: 'Hemd' },
      }),
      line({
        id: '2',
        quarter_id: 'q1',
        status: 'issued',
        created_at: '2026-09-01T11:00:00Z',
        quarters: { name: 'Q3 2026', year: 2026, quarter_num: 3 },
        products: { name: 'Hose' },
      }),
      line({
        id: '3',
        quarter_id: 'q2',
        status: 'approved',
        quarters: { name: 'Q2 2026', year: 2026, quarter_num: 2 },
        products: { name: 'Jacke' },
      }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].quarterName).toBe('Q3 2026')
    expect(groups[0].lines.map(l => l.id)).toEqual(['1', '2'])
    expect(groups[0].lines[1].status).toBe('issued')
    expect(groups[1].quarterName).toBe('Q2 2026')
  })

  it('ordnet Zeilen ohne Quartal in eine eigene Gruppe', () => {
    const groups = groupOrdersByQuarter([
      line({ id: 'x', quarter_id: '', status: 'approved' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].quarterId).toBe('ohne-quartal')
    expect(groups[0].quarterName).toBe('Ohne Quartal')
  })
})

describe('orderLineMengeLabel', () => {
  it('zeigt die Bestellmenge', () => {
    expect(orderLineMengeLabel(3, null, 'approved')).toBe('3')
    expect(orderLineMengeLabel(2, 2, 'issued')).toBe('2')
  })

  it('zeigt bei Teilausgabe ausgegeben / bestellt', () => {
    expect(orderLineMengeLabel(3, 1, 'partially_issued')).toBe('1 / 3')
  })
})

describe('Zeilenstatus für die Sammelliste', () => {
  it('zeigt issued als Ausgegeben (gleiche Zeile wie die SB-Ausgabe)', () => {
    expect(ORDER_STATUS_LABELS.issued).toBe('Ausgegeben')
    expect(ORDER_STATUS_LABELS.partially_issued).toBe('Teilweise ausgegeben')
  })
})
