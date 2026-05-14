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

export interface ShoeRefundCap {
  id: string
  cap_amount: number
  valid_from: string
  note: string | null
  created_by: string | null
  created_at: string | null
}

export interface UserBudget {
  id: string
  user_id: string
  year: number
  total_budget: number
  valid_from: string
  created_at: string | null
  updated_at: string | null
  profiles?: Profile
}

export interface Profile {
  id: string
  username: string
  name: string
  dienstnummer: string | null
  gender: 'male' | 'female'
  organisation: string
  roles: string[]
  active: boolean
  created_at: string | null
}

export interface Product {
  id: string
  article_number: string
  name: string
  category: string
  sub_category: string | null
  gender: 'male' | 'female' | 'unisex'
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
  unit_price: number
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

export type ShoeRefundStatus = 'pending' | 'approved' | 'rejected'

export interface ShoeRefund {
  id: string
  user_id: string
  amount: number
  approved_amount: number
  refund_date: string
  note: string | null
  status: ShoeRefundStatus
  reviewed_by: string | null
  reviewed_at: string | null
  created_by: string | null
  created_at: string | null
  profiles?: Profile
  creator?: Profile
  reviewer?: Profile
}

export type StockOrderStatus = 'pending_approval' | 'approved' | 'rejected' | 'received'

export interface StockOrder {
  id: string
  product_id: string
  size: string
  quantity: number
  status: StockOrderStatus
  note: string | null
  requested_by: string
  approved_by: string | null
  approved_at: string | null
  received_at: string | null
  created_at: string
  updated_at: string
  products?: Product
  requester?: Profile
  approver?: Profile
}

export interface AuditLog {
  id: string
  action: string
  details: string | null
  user_id: string | null
  created_at: string | null
  profiles?: Profile
}

type ProfileRow = Omit<Profile, 'profiles' | 'products' | 'quarters' | 'orders' | 'creator'>
type ProductRow = Omit<Product, 'profiles' | 'products' | 'quarters' | 'orders' | 'creator'>
type InventoryRow = Omit<Inventory, 'profiles' | 'products' | 'quarters' | 'orders' | 'creator'>
type QuarterRow = Omit<Quarter, 'profiles' | 'products' | 'orders' | 'creator'>
type OrderRow = Omit<Order, 'profiles' | 'products' | 'quarters' | 'creator'>
type UserBudgetRow = Omit<UserBudget, 'profiles'>
type ShoeRefundCapRow = Omit<ShoeRefundCap, 'profiles' | 'creator'>
type TailorJobRow = Omit<TailorJob, 'profiles' | 'quarters' | 'orders' | 'creator'>
type ShoeRefundRow = Omit<ShoeRefund, 'profiles' | 'creator'>
type AuditLogRow = Omit<AuditLog, 'profiles' | 'creator'>
type StockOrderRow = Omit<StockOrder, 'products' | 'requester' | 'approver'>

export type Database = {
  public: {
    Tables: {
      profiles: { Row: ProfileRow; Insert: Omit<ProfileRow, 'created_at'>; Update: Partial<ProfileRow>; Relationships: [] }
      products: { Row: ProductRow; Insert: Omit<ProductRow, 'id' | 'created_at'>; Update: Partial<ProductRow>; Relationships: [] }
      inventory: { Row: InventoryRow; Insert: Omit<InventoryRow, 'id'>; Update: Partial<InventoryRow>; Relationships: [] }
      quarters: { Row: QuarterRow; Insert: Omit<QuarterRow, 'id' | 'created_at'>; Update: Partial<QuarterRow>; Relationships: [] }
      orders: { Row: OrderRow; Insert: Pick<OrderRow, 'user_id' | 'product_id' | 'quarter_id' | 'size' | 'quantity' | 'status'> & Partial<Omit<OrderRow, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'product_id' | 'quarter_id' | 'size' | 'quantity' | 'status'>>; Update: Partial<OrderRow>; Relationships: [] }
      tailor_jobs: { Row: TailorJobRow; Insert: Pick<TailorJobRow, 'quarter_id' | 'status'> & Partial<Omit<TailorJobRow, 'id' | 'created_at' | 'quarter_id' | 'status'>>; Update: Partial<TailorJobRow>; Relationships: [] }
      shoe_refunds: { Row: ShoeRefundRow; Insert: Omit<ShoeRefundRow, 'id' | 'created_at'>; Update: Partial<ShoeRefundRow>; Relationships: [] }
      audit_log: { Row: AuditLogRow; Insert: Omit<AuditLogRow, 'id' | 'created_at'>; Update: Partial<AuditLogRow>; Relationships: [] }
      user_budgets: { Row: UserBudgetRow; Insert: Omit<UserBudgetRow, 'id' | 'created_at' | 'updated_at'>; Update: Partial<UserBudgetRow>; Relationships: [] }
      shoe_refund_caps: { Row: ShoeRefundCapRow; Insert: Omit<ShoeRefundCapRow, 'id' | 'created_at'>; Update: Partial<ShoeRefundCapRow>; Relationships: [] }
      stock_orders: { Row: StockOrderRow; Insert: Omit<StockOrderRow, 'id' | 'created_at' | 'updated_at'>; Update: Partial<StockOrderRow>; Relationships: [] }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
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

export const STOCK_ORDER_STATUS_LABELS: Record<StockOrderStatus, string> = {
  pending_approval: 'Wartet auf Freigabe',
  approved: 'Freigegeben',
  rejected: 'Abgelehnt',
  received: 'Wareneingang',
}

export const STOCK_ORDER_STATUS_COLORS: Record<StockOrderStatus, string> = {
  pending_approval: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  received: 'bg-emerald-100 text-emerald-700',
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
