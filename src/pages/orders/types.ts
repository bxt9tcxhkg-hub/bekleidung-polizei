import type { OrderStatus } from '../../lib/types'

export type AdminTab = 'eingereicht' | 'lieferant' | 'schneider' | 'ausgabe' | 'ausgegeben' | 'storniert' | 'lieferungen'

export const PAGE_SIZE = 50

export const ADMIN_TABS: { key: AdminTab; label: string; status?: OrderStatus }[] = [
  { key: 'eingereicht', label: 'Eingereicht',        status: 'approved' },
  { key: 'lieferant',   label: 'In Bestellung',      status: 'ordered_supplier' },
  { key: 'schneider',   label: 'Beim Schneider',     status: 'at_tailor' },
  { key: 'ausgabe',     label: 'Bereit zur Ausgabe', status: 'ready_for_issue' },
  { key: 'ausgegeben',  label: 'Ausgegeben',          status: 'issued' },
  { key: 'storniert',   label: 'Storniert',           status: 'cancelled' },
  { key: 'lieferungen', label: 'Lieferungen' },
]
