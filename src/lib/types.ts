export type OrderStatus =
  | 'pending'
  | 'pending_approval'
  | 'approved'
  | 'ordered_supplier'
  | 'at_tailor'
  | 'ready_for_issue'
  | 'partially_issued'
  | 'issued'
  | 'cancelled'

export type QuarterStatus = 'planned' | 'active' | 'closed'

export interface Profile {
  id: string
  username: string
  name: string
  dienstnummer: string | null
  roles: string[]
  active: boolean
  created_at: string | null
}

export interface Product {
  id: string
  article_number: string
  name: string
  category: string
  sizes: string[]
  price: number
  needs_tailoring: boolean
  size_guide: string | null
  organisation: string | null
  active: boolean
  created_at: string | null
}

export interface Inventory {
  id: string
  product_id: string
  size: string
  quantity: number
  updated_at: string | null
}

export interface Quarter {
  id: string
  name: string
  year: number
  quarter_num: number
  status: QuarterStatus
  start_date: string
  end_date: string
  created_at: string | null
}

export interface Order {
  id: string
  user_id: string
  product_id: string
  quarter_id: string
  size: string
  quantity: number
  status: OrderStatus
  quantity_received: number | null
  quantity_issued: number | null
  proc_listed: boolean | null
  cancel_reason: string | null
  shifted_from: string | null
  tailor_job_id: string | null
  created_at: string | null
  updated_at: string | null
  profiles?: Profile
  products?: Product
  quarters?: Quarter
}

export interface TailorJob {
  id: string
  quarter_id: string
  status: 'open' | 'done'
  note: string | null
  created_at: string | null
  completed_at: string | null
  quarters?: Quarter
  orders?: Order[]
}

export interface ShoeRefund {
  id: string
  user_id: string
  amount: number
  approved_amount: number
  refund_date: string
  note: string | null
  created_by: string | null
  created_at: string | null
  profiles?: Profile
  creator?: Profile
}

export interface AuditLog {
  id: string
  action: string
  details: string | null
  user_id: string | null
  created_at: string | null
  profiles?: Profile
}

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at'>; Update: Partial<Profile> }
      products: { Row: Product; Insert: Omit<Product, 'id' | 'created_at'>; Update: Partial<Product> }
      inventory: { Row: Inventory; Insert: Omit<Inventory, 'id'>; Update: Partial<Inventory> }
      quarters: { Row: Quarter; Insert: Omit<Quarter, 'id' | 'created_at'>; Update: Partial<Quarter> }
      orders: { Row: Order; Insert: Omit<Order, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Order> }
      tailor_jobs: { Row: TailorJob; Insert: Omit<TailorJob, 'id' | 'created_at'>; Update: Partial<TailorJob> }
      shoe_refunds: { Row: ShoeRefund; Insert: Omit<ShoeRefund, 'id' | 'created_at'>; Update: Partial<ShoeRefund> }
      audit_log: { Row: AuditLog; Insert: Omit<AuditLog, 'id' | 'created_at'>; Update: Partial<AuditLog> }
    }
  }
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Im Warenkorb',
  pending_approval: 'Eingereicht',
  approved: 'Genehmigt',
  ordered_supplier: 'Beim Lieferanten',
  at_tailor: 'Beim Schneider',
  ready_for_issue: 'Bereit zur Ausgabe',
  partially_issued: 'Teilweise ausgegeben',
  issued: 'Ausgegeben',
  cancelled: 'Storniert',
}

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  pending_approval: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-teal-100 text-teal-700',
  ordered_supplier: 'bg-blue-100 text-blue-700',
  at_tailor: 'bg-purple-100 text-purple-700',
  ready_for_issue: 'bg-green-100 text-green-700',
  partially_issued: 'bg-orange-100 text-orange-700',
  issued: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
}

export const QUARTER_STATUS_LABELS: Record<QuarterStatus, string> = {
  planned: 'Geplant',
  active: 'Aktiv',
  closed: 'Abgeschlossen',
}

export const QUARTER_STATUS_COLORS: Record<QuarterStatus, string> = {
  planned: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-slate-100 text-slate-700',
}
