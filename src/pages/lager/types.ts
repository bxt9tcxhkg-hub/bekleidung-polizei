import type { Order, Product } from '../../lib/types'

export type Tab = 'bestand' | 'bestellen' | 'historie'

export interface InventoryItem {
  id: string
  product_id: string
  size: string
  quantity: number
  updated_at: string | null
  products?: Product
}

export interface CartItem {
  product: Product
  size: string
  quantity: number
}

export interface SizeModal {
  product: Product
  size: string
  quantity: number
}

export type WaitingUserOrder = Pick<Order, 'id' | 'quantity' | 'size' | 'product_id' | 'quarter_id'> & {
  profiles?: { name: string } | null
  products?: { name: string; needs_tailoring?: boolean } | null
}
