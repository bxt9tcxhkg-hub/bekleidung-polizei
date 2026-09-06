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
  size_preferences: Record<string, string> | null
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
  min_quantity: number
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
  delivery_id: string | null
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

export interface VorrechnungAnalysis {
  rechnungsnummer: string | null
  gesamtbetrag: number | null
  positionen: { artikelnummer: string; bezeichnung: string; menge: number; einzelpreis: number }[]
}

export type DeliveryStatus = 'ordered' | 'partially_received' | 'received'

export interface Delivery {
  id: string
  created_at: string
  created_by: string | null
  vorrechnung_url: string | null
  vorrechnung_name: string | null
  vorrechnung_number: string | null
  vorrechnung_amount: number | null
  vorrechnung_analysis: VorrechnungAnalysis | null
  paid: boolean
  paid_at: string | null
  status: DeliveryStatus
  orders?: Order[]
}

export interface Grundausstattung {
  id: string
  organisation: string
  product_id: string
  quantity: number
  created_by: string | null
  updated_at: string | null
  products?: Product
}

export type PortalArea = 'bekleidung' | 'einsatz_mt'

export interface PortalAreaRole {
  user_id: string
  area: PortalArea
  roles: string[]
  created_at: string | null
  updated_at: string | null
}

export type SupportTicketStatus = 'open' | 'answered' | 'closed'

export interface SupportTicket {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  subject: string
  status: SupportTicketStatus
  last_message_at: string
  profiles?: Profile
}

export interface SupportMessage {
  id: string
  created_at: string
  ticket_id: string
  author_id: string
  body: string
  from_admin: boolean
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
type DeliveryRow = Omit<Delivery, 'orders'>
type GrundausstattungRow = Omit<Grundausstattung, 'products'>
type SupportTicketRow = Omit<SupportTicket, 'profiles'>
type SupportMessageRow = Omit<SupportMessage, 'profiles'>
type PortalAreaRoleRow = Omit<PortalAreaRole, 'profiles'>

/** View public.orders_full: orders.* plus Produkt-, Benutzer- und Quartalsfelder. */
export type OrdersFullRow = OrderRow & {
  product_name: string
  article_number: string
  category: string
  needs_tailoring: boolean
  user_name: string
  dienstnummer: string | null
  username: string
  quarter_name: string
}

/** View public.budget_usage: Verbrauch je Benutzer und Kalenderjahr. */
export type BudgetUsageRow = {
  user_id: string
  year: number
  used: number
}

export type Database = {
  public: {
    Tables: {
      profiles: { Row: ProfileRow; Insert: Omit<ProfileRow, 'created_at'>; Update: Partial<ProfileRow>; Relationships: [] }
      products: { Row: ProductRow; Insert: Omit<ProductRow, 'id' | 'created_at'>; Update: Partial<ProductRow>; Relationships: [] }
      inventory: { Row: InventoryRow; Insert: Omit<InventoryRow, 'id'>; Update: Partial<InventoryRow>; Relationships: [
        { foreignKeyName: 'inventory_product_id_fkey'; columns: ['product_id']; isOneToOne: false; referencedRelation: 'products'; referencedColumns: ['id'] },
      ] }
      quarters: { Row: QuarterRow; Insert: Omit<QuarterRow, 'id' | 'created_at'>; Update: Partial<QuarterRow>; Relationships: [] }
      orders: { Row: OrderRow; Insert: Pick<OrderRow, 'user_id' | 'product_id' | 'quarter_id' | 'size' | 'quantity' | 'status'> & Partial<Omit<OrderRow, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'product_id' | 'quarter_id' | 'size' | 'quantity' | 'status'>>; Update: Partial<OrderRow>; Relationships: [
        { foreignKeyName: 'orders_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'orders_product_id_fkey'; columns: ['product_id']; isOneToOne: false; referencedRelation: 'products'; referencedColumns: ['id'] },
        { foreignKeyName: 'orders_quarter_id_fkey'; columns: ['quarter_id']; isOneToOne: false; referencedRelation: 'quarters'; referencedColumns: ['id'] },
        { foreignKeyName: 'orders_delivery_id_fkey'; columns: ['delivery_id']; isOneToOne: false; referencedRelation: 'deliveries'; referencedColumns: ['id'] },
        { foreignKeyName: 'orders_tailor_job_id_fkey'; columns: ['tailor_job_id']; isOneToOne: false; referencedRelation: 'tailor_jobs'; referencedColumns: ['id'] },
      ] }
      tailor_jobs: { Row: TailorJobRow; Insert: Pick<TailorJobRow, 'quarter_id' | 'status'> & Partial<Omit<TailorJobRow, 'id' | 'created_at' | 'quarter_id' | 'status'>>; Update: Partial<TailorJobRow>; Relationships: [
        { foreignKeyName: 'tailor_jobs_quarter_id_fkey'; columns: ['quarter_id']; isOneToOne: false; referencedRelation: 'quarters'; referencedColumns: ['id'] },
      ] }
      shoe_refunds: { Row: ShoeRefundRow; Insert: Omit<ShoeRefundRow, 'id' | 'created_at'>; Update: Partial<ShoeRefundRow>; Relationships: [
        { foreignKeyName: 'shoe_refunds_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'shoe_refunds_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'shoe_refunds_reviewed_by_fkey'; columns: ['reviewed_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      audit_log: { Row: AuditLogRow; Insert: Omit<AuditLogRow, 'id' | 'created_at'>; Update: Partial<AuditLogRow>; Relationships: [
        { foreignKeyName: 'audit_log_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      user_budgets: { Row: UserBudgetRow; Insert: Omit<UserBudgetRow, 'id' | 'created_at' | 'updated_at'>; Update: Partial<UserBudgetRow>; Relationships: [
        { foreignKeyName: 'user_budgets_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      shoe_refund_caps: { Row: ShoeRefundCapRow; Insert: Omit<ShoeRefundCapRow, 'id' | 'created_at'>; Update: Partial<ShoeRefundCapRow>; Relationships: [
        { foreignKeyName: 'shoe_refund_caps_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      stock_orders: { Row: StockOrderRow; Insert: Omit<StockOrderRow, 'id' | 'created_at' | 'updated_at'>; Update: Partial<StockOrderRow>; Relationships: [
        { foreignKeyName: 'stock_orders_product_id_fkey'; columns: ['product_id']; isOneToOne: false; referencedRelation: 'products'; referencedColumns: ['id'] },
        { foreignKeyName: 'stock_orders_requested_by_fkey'; columns: ['requested_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'stock_orders_approved_by_fkey'; columns: ['approved_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      deliveries: { Row: DeliveryRow; Insert: Partial<Omit<DeliveryRow, 'id'>> & { status?: DeliveryStatus }; Update: Partial<DeliveryRow>; Relationships: [
        { foreignKeyName: 'deliveries_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      grundausstattung: { Row: GrundausstattungRow; Insert: Omit<GrundausstattungRow, 'id' | 'updated_at'> & Partial<Pick<GrundausstattungRow, 'id' | 'updated_at'>>; Update: Partial<GrundausstattungRow>; Relationships: [
        { foreignKeyName: 'grundausstattung_product_id_fkey'; columns: ['product_id']; isOneToOne: false; referencedRelation: 'products'; referencedColumns: ['id'] },
        { foreignKeyName: 'grundausstattung_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      support_tickets: { Row: SupportTicketRow; Insert: Pick<SupportTicketRow, 'user_id' | 'subject'> & Partial<Omit<SupportTicketRow, 'user_id' | 'subject'>>; Update: Partial<Pick<SupportTicketRow, 'status' | 'updated_at' | 'last_message_at'>>; Relationships: [
        { foreignKeyName: 'support_tickets_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      support_messages: { Row: SupportMessageRow; Insert: Pick<SupportMessageRow, 'ticket_id' | 'author_id' | 'body'> & Partial<Omit<SupportMessageRow, 'ticket_id' | 'author_id' | 'body'>>; Update: Partial<SupportMessageRow>; Relationships: [
        { foreignKeyName: 'support_messages_ticket_id_fkey'; columns: ['ticket_id']; isOneToOne: false; referencedRelation: 'support_tickets'; referencedColumns: ['id'] },
        { foreignKeyName: 'support_messages_author_id_fkey'; columns: ['author_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      portal_area_roles: { Row: PortalAreaRoleRow; Insert: Pick<PortalAreaRoleRow, 'user_id' | 'area' | 'roles'> & Partial<Omit<PortalAreaRoleRow, 'user_id' | 'area' | 'roles'>>; Update: Partial<Pick<PortalAreaRoleRow, 'roles' | 'updated_at'>>; Relationships: [
        { foreignKeyName: 'portal_area_roles_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
    }
    Views: {
      orders_full: { Row: OrdersFullRow; Relationships: [] }
      budget_usage: { Row: BudgetUsageRow; Relationships: [] }
    }
    Functions: {
      submit_cart: { Args: Record<string, never>; Returns: string | null }
      adjust_inventory: { Args: { p_product: string; p_size: string; p_delta: number }; Returns: number }
    }
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
