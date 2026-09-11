import type { Verwahrungsort } from './verwahrungsort'

export type { Verwahrungsort }

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
  /** Korrektur zum Bestellverbrauch dieses Kalenderjahres. Rückstellung zum 01.01. */
  used_adjustment: number
  valid_from: string
  created_at: string | null
  updated_at: string | null
  profiles?: Profile
}

export const POLICE_RANKS = [
  'Aspirant',
  'Inspektor',
  'Revierinspektor',
  'Gruppeninspektor',
  'Bezirksinspektor',
  'Abteilungsinspektor',
  'Kontrollinspektor',
  'Chefinspektor',
] as const

export type PoliceRank = (typeof POLICE_RANKS)[number]

export interface Profile {
  id: string
  username: string | null
  name: string
  dienstnummer: string | null
  dienstgrad?: PoliceRank | null
  gender: 'male' | 'female'
  organisation: string
  roles: string[]
  active: boolean
  created_at: string | null
  size_preferences: Record<string, string> | null
  /** Erstlogin: PC-Anmeldename muss gesetzt/bestätigt werden. */
  force_username_set?: boolean
  /** Optionales Legacy-Flag; Portal-Admin auch über roles / gebundenes Konto. */
  admin?: boolean
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
  source?: 'client' | 'database'
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

export type PortalArea = 'bekleidung' | 'einsatz_mt' | 'schulungen' | 'fuhrpark' | 'zentrale'

export interface PortalAreaRole {
  user_id: string
  area: PortalArea
  roles: string[]
  created_at: string | null
  updated_at: string | null
}

export type PersonalEmCategory =
  | 'schutzweste'
  | 'glock_17'
  | 'munition'
  | 'pfefferspray'
  | 'schlagstock'
  | 'handfesseln'
  | 'taschenlampe_kelle'
  | 'leatherman'
  | 'warnweste'

export interface PersonalEinsatzmittel {
  id: string
  category: PersonalEmCategory
  officer_id: string | null
  verwahrungsort: Verwahrungsort | null
  groesse: string | null
  ablaufdatum: string | null
  schutzfristen: string | null
  waffennummer: string | null
  service: string | null
  magazinanzahl: number | null
  marke: string | null
  kaliber: string | null
  art: string | null
  patronen: number | null
  ablauf_mm_yyyy: string | null
  removed_at: string | null
  removed_by: string | null
  removal_reason: string | null
  created_at: string | null
  updated_at: string | null
  created_by: string | null
  officer?: Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active' | 'organisation' | 'roles'> & Pick<Partial<Profile>, 'admin'> | null
}

export type PersonalEmRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export interface PersonalEinsatzmittelRequest {
  id: string
  requester_id: string
  category: PersonalEmCategory
  verwahrungsort: Verwahrungsort | null
  groesse: string | null
  ablaufdatum: string | null
  schutzfristen: string | null
  waffennummer: string | null
  service: string | null
  magazinanzahl: number | null
  marke: string | null
  kaliber: string | null
  art: string | null
  patronen: number | null
  ablauf_mm_yyyy: string | null
  status: PersonalEmRequestStatus
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  requester?: Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username'> | null
}

export type PoolEmCategory =
  | 'langwaffe_stg77'
  | 'magazine'
  | 'munition'
  | 'pfefferspray_gross'
  | 'schild'
  | 'ballistischer_helm'
  | 'schwere_westen'
  | 'spuckschutzhaube'

export interface PoolEinsatzmittel {
  id: string
  category: PoolEmCategory
  verwahrungsort: Verwahrungsort
  lager_notiz: string | null
  marke: string | null
  typ: string | null
  waffennummer: string | null
  kaliber: string | null
  art: string | null
  anzahl: number | null
  groessen: string | null
  ablaufdatum: string | null
  removed_at: string | null
  removed_by: string | null
  removal_reason: string | null
  created_at: string | null
  updated_at: string | null
  created_by: string | null
}

export type TrainingKind = 'intern' | 'extern'
export type TrainingModuleType = 'pflicht_halbjahr' | 'zusatz'
export type TrainingAppliesTo = 'polizei' | 'parkaufsicht' | 'alle'
export type TrainingAttendanceStatus = 'present' | 'absent'
export type TrainingPeriodHalf = 1 | 2

export interface EinsatzTrainingModule {
  id: string
  name: string
  kind: TrainingKind
  module_type: TrainingModuleType
  schiesst: boolean
  applies_to: TrainingAppliesTo
  period_year: number | null
  period_half: TrainingPeriodHalf | null
  active: boolean
  created_at: string | null
  updated_at: string | null
  created_by: string | null
}

export interface EinsatzTrainingSession {
  id: string
  kind: TrainingKind
  session_date: string
  note: string | null
  module_id: string | null
  capacity: number | null
  announced: boolean
  munition_anzahl: number | null
  munition_marke: string | null
  munition_kaliber: string | null
  munition_art: string | null
  munition_pool_id: string | null
  munition_recorded_at: string | null
  munition_recorded_by: string | null
  created_at: string | null
  updated_at: string | null
  created_by: string | null
  module?: Pick<EinsatzTrainingModule, 'id' | 'name' | 'kind' | 'module_type' | 'schiesst' | 'applies_to' | 'period_year' | 'period_half' | 'active'>
}

export interface EinsatzTrainingAttendance {
  id: string
  session_id: string
  officer_id: string
  status: TrainingAttendanceStatus
  remark: string | null
  created_at: string | null
  updated_at: string | null
  officer?: Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active' | 'organisation' | 'roles'> & Pick<Partial<Profile>, 'admin'>
}

export type EinsatzMaterialArea = 'einsatzmittel' | 'einsatztraining' | 'schulungen'

export interface EinsatzMaterialTab {
  id: string
  area: EinsatzMaterialArea
  name: string
  description: string | null
  sort_order: number
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface EinsatzMaterial {
  id: string
  tab_id: string
  title: string
  description: string | null
  file_key: string | null
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  external_url: string | null
  published: boolean
  important: boolean
  archived_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type FleetVehicleKind = 'Dienstfahrzeug' | 'Motorrad'

export interface FleetVehicle {
  id: string
  name: string
  kind: FleetVehicleKind
  make: string | null
  model: string | null
  call_sign: string | null
  license_plate: string | null
  notes: string | null
  responsible_user_id: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  responsible_profile?: Pick<Profile, 'id' | 'name' | 'dienstnummer'> | null
}

export type ZentraleEntryCategory = 'lage' | 'kontrollauftrag' | 'verbot' | 'fahndung' | 'brief' | 'schluessel' | 'kontakt' | 'alarmierung' | 'uebergabe' | 'unterlage'
export type ZentraleEntryPriority = 'normal' | 'hoch' | 'kritisch'
export type ZentraleEntryStatus = 'offen' | 'in_bearbeitung' | 'erledigt'

export interface ZentraleEntry {
  id: string
  category: ZentraleEntryCategory
  title: string
  description: string | null
  priority: ZentraleEntryPriority
  status: ZentraleEntryStatus
  valid_from: string | null
  valid_until: string | null
  location: string | null
  responsible: string | null
  reference: string | null
  restricted: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type DutyFunction = string
export type DutyShift = 'tag' | 'nacht'

export interface DutyFunctionConfig {
  code: string
  label: string
  is_patrol: boolean
  standard_staffing: number | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DutyAssignment {
  id: string
  user_id: string
  duty_date: string
  shift: DutyShift
  function: DutyFunction
  vehicle: string | null
  vehicle_id: string | null
  created_at: string
  updated_at: string
  profiles?: Pick<Profile, 'id' | 'name' | 'dienstnummer'> | null
  fleet_vehicles?: Pick<FleetVehicle, 'id' | 'name' | 'call_sign' | 'license_plate'> | null
}

export type IncidentDisposition = 'jd' | 'vd' | 'bp' | 'keine_anfahrt'
export type IncidentStatus = 'offen' | 'erledigt' | 'weitergegeben'

export interface IncidentReport {
  id: string
  caller_phone: string | null
  caller_name: string | null
  reported_at: string
  location: string | null
  summary: string
  involved_person: string | null
  involved_birth_date: string | null
  disposition: IncidentDisposition
  note: string | null
  status: IncidentStatus
  created_by: string
  created_at: string
  updated_at: string
}

export type OperationalPersonNoteCategory = 'infektionsschutz' | 'aggressiv' | 'waffenverbot' | 'fluchtgefahr' | 'suizidgefahr' | 'sonstiges'

export interface OperationalPersonNote {
  id: string
  person_name: string
  birth_date: string | null
  phone: string | null
  category: OperationalPersonNoteCategory
  note: string
  action_guidance: string | null
  source_reference: string | null
  valid_until: string | null
  active: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface EinsatzTrainingParticipation {
  id: string
  session_id: string
  officer_id: string
  module_id: string
  interval_label: string | null
  created_at: string | null
  created_by: string | null
  module?: Pick<EinsatzTrainingModule, 'id' | 'name' | 'kind' | 'module_type' | 'schiesst' | 'applies_to' | 'active'>
  officer?: Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active' | 'organisation' | 'roles'> & Pick<Partial<Profile>, 'admin'>
}

export interface EinsatzTrainingCompletion {
  id: string
  officer_id: string
  module_id: string
  session_id: string
  participation_id: string
  completed_on: string
  created_at: string | null
  module?: Pick<EinsatzTrainingModule, 'id' | 'name' | 'kind' | 'module_type' | 'schiesst' | 'applies_to' | 'active'>
  officer?: Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active' | 'organisation' | 'roles'> & Pick<Partial<Profile>, 'admin'>
}

export interface EinsatzTrainingRegistration {
  id: string
  session_id: string
  officer_id: string
  created_at: string | null
  officer?: Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active' | 'organisation' | 'roles'> & Pick<Partial<Profile>, 'admin'>
  session?: Pick<EinsatzTrainingSession, 'id' | 'session_date' | 'module_id' | 'capacity' | 'announced' | 'note'>
}

export type SupportTicketStatus = 'open' | 'answered' | 'closed'
export type SupportTicketKind = 'help' | 'improvement' | 'idea'
export type SupportTicketTopic = 'general' | 'bekleidung' | 'einsatz_mt' | 'zentrale' | 'innendienst' | 'aussendienst' | 'schulungen' | 'fuhrpark' | 'ueberstunden'

export interface SupportTicket {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  subject: string
  kind: SupportTicketKind
  topic: SupportTicketTopic
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
type PersonalEinsatzmittelRow = Omit<PersonalEinsatzmittel, 'officer'>
type PersonalEinsatzmittelRequestRow = Omit<PersonalEinsatzmittelRequest, 'requester'>
type PoolEinsatzmittelRow = Omit<PoolEinsatzmittel, never>
type EinsatzTrainingModuleRow = Omit<EinsatzTrainingModule, never>
type EinsatzTrainingSessionRow = Omit<EinsatzTrainingSession, 'module'>
type EinsatzTrainingAttendanceRow = Omit<EinsatzTrainingAttendance, 'officer'>
type EinsatzTrainingParticipationRow = Omit<EinsatzTrainingParticipation, 'module' | 'officer'>
type EinsatzTrainingCompletionRow = Omit<EinsatzTrainingCompletion, 'module' | 'officer'>
type EinsatzTrainingRegistrationRow = Omit<EinsatzTrainingRegistration, 'officer' | 'session'>
type EinsatzMaterialTabRow = Omit<EinsatzMaterialTab, never>
type EinsatzMaterialRow = Omit<EinsatzMaterial, never>
type FleetVehicleRow = Omit<FleetVehicle, 'responsible_profile'>
type ZentraleEntryRow = Omit<ZentraleEntry, never>
type DutyAssignmentRow = Omit<DutyAssignment, 'profiles' | 'fleet_vehicles'>
type DutyFunctionConfigRow = DutyFunctionConfig
type IncidentReportRow = Omit<IncidentReport, never>
type OperationalPersonNoteRow = Omit<OperationalPersonNote, never>

/** View public.orders_full: orders.* plus Produkt-, Benutzer- und Quartalsfelder. */
export type OrdersFullRow = OrderRow & {
  product_name: string
  article_number: string
  category: string
  needs_tailoring: boolean
  user_name: string
  dienstnummer: string | null
  username: string | null
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
      user_budgets: { Row: UserBudgetRow; Insert: Omit<UserBudgetRow, 'id' | 'created_at' | 'updated_at' | 'used_adjustment'> & { used_adjustment?: number }; Update: Partial<UserBudgetRow>; Relationships: [
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
      personal_einsatzmittel: { Row: PersonalEinsatzmittelRow; Insert: Pick<PersonalEinsatzmittelRow, 'category'> & Partial<Omit<PersonalEinsatzmittelRow, 'category'>>; Update: Partial<Omit<PersonalEinsatzmittelRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'personal_einsatzmittel_officer_id_fkey'; columns: ['officer_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'personal_einsatzmittel_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'personal_einsatzmittel_removed_by_fkey'; columns: ['removed_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      personal_einsatzmittel_requests: { Row: PersonalEinsatzmittelRequestRow; Insert: Pick<PersonalEinsatzmittelRequestRow, 'requester_id' | 'category'> & Partial<Omit<PersonalEinsatzmittelRequestRow, 'id' | 'created_at' | 'updated_at' | 'requester_id' | 'category'>>; Update: Partial<Omit<PersonalEinsatzmittelRequestRow, 'id' | 'created_at' | 'requester_id'>>; Relationships: [
        { foreignKeyName: 'personal_einsatzmittel_requests_requester_id_fkey'; columns: ['requester_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'personal_einsatzmittel_requests_reviewed_by_fkey'; columns: ['reviewed_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      pool_einsatzmittel: { Row: PoolEinsatzmittelRow; Insert: Pick<PoolEinsatzmittelRow, 'category' | 'verwahrungsort'> & Partial<Omit<PoolEinsatzmittelRow, 'category' | 'verwahrungsort'>>; Update: Partial<Omit<PoolEinsatzmittelRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'pool_einsatzmittel_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'pool_einsatzmittel_removed_by_fkey'; columns: ['removed_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      einsatz_training_modules: { Row: EinsatzTrainingModuleRow; Insert: Pick<EinsatzTrainingModuleRow, 'name' | 'kind' | 'module_type'> & Partial<Omit<EinsatzTrainingModuleRow, 'name' | 'kind' | 'module_type'>>; Update: Partial<Omit<EinsatzTrainingModuleRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'einsatz_training_modules_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      einsatz_training_sessions: { Row: EinsatzTrainingSessionRow; Insert: Pick<EinsatzTrainingSessionRow, 'kind' | 'session_date'> & Partial<Omit<EinsatzTrainingSessionRow, 'kind' | 'session_date'>>; Update: Partial<Omit<EinsatzTrainingSessionRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'einsatz_training_sessions_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_training_sessions_module_id_fkey'; columns: ['module_id']; isOneToOne: false; referencedRelation: 'einsatz_training_modules'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_training_sessions_munition_pool_id_fkey'; columns: ['munition_pool_id']; isOneToOne: false; referencedRelation: 'pool_einsatzmittel'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_training_sessions_munition_recorded_by_fkey'; columns: ['munition_recorded_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      einsatz_training_attendance: { Row: EinsatzTrainingAttendanceRow; Insert: Pick<EinsatzTrainingAttendanceRow, 'session_id' | 'officer_id' | 'status'> & Partial<Omit<EinsatzTrainingAttendanceRow, 'session_id' | 'officer_id' | 'status'>>; Update: Partial<Omit<EinsatzTrainingAttendanceRow, 'id' | 'created_at' | 'session_id'>>; Relationships: [
        { foreignKeyName: 'einsatz_training_attendance_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'einsatz_training_sessions'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_training_attendance_officer_id_fkey'; columns: ['officer_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      einsatz_training_participations: { Row: EinsatzTrainingParticipationRow; Insert: Pick<EinsatzTrainingParticipationRow, 'session_id' | 'officer_id' | 'module_id'> & Partial<Omit<EinsatzTrainingParticipationRow, 'session_id' | 'officer_id' | 'module_id'>>; Update: Partial<Omit<EinsatzTrainingParticipationRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'einsatz_training_participations_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'einsatz_training_sessions'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_training_participations_officer_id_fkey'; columns: ['officer_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_training_participations_module_id_fkey'; columns: ['module_id']; isOneToOne: false; referencedRelation: 'einsatz_training_modules'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_training_participations_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      einsatz_training_completions: { Row: EinsatzTrainingCompletionRow; Insert: Pick<EinsatzTrainingCompletionRow, 'officer_id' | 'module_id' | 'session_id' | 'participation_id' | 'completed_on'> & Partial<Omit<EinsatzTrainingCompletionRow, 'officer_id' | 'module_id' | 'session_id' | 'participation_id' | 'completed_on'>>; Update: Partial<Omit<EinsatzTrainingCompletionRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'einsatz_training_completions_officer_id_fkey'; columns: ['officer_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_training_completions_module_id_fkey'; columns: ['module_id']; isOneToOne: false; referencedRelation: 'einsatz_training_modules'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_training_completions_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'einsatz_training_sessions'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_training_completions_participation_id_fkey'; columns: ['participation_id']; isOneToOne: false; referencedRelation: 'einsatz_training_participations'; referencedColumns: ['id'] },
      ] }
      einsatz_training_registrations: { Row: EinsatzTrainingRegistrationRow; Insert: Pick<EinsatzTrainingRegistrationRow, 'session_id' | 'officer_id'> & Partial<Omit<EinsatzTrainingRegistrationRow, 'session_id' | 'officer_id'>>; Update: Partial<Omit<EinsatzTrainingRegistrationRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'einsatz_training_registrations_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'einsatz_training_sessions'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_training_registrations_officer_id_fkey'; columns: ['officer_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      einsatz_material_tabs: { Row: EinsatzMaterialTabRow; Insert: Pick<EinsatzMaterialTabRow, 'area' | 'name'> & Partial<Omit<EinsatzMaterialTabRow, 'id' | 'created_at' | 'updated_at' | 'area' | 'name'>>; Update: Partial<Omit<EinsatzMaterialTabRow, 'id' | 'created_at'>>; Relationships: [] }
      einsatz_materials: { Row: EinsatzMaterialRow; Insert: Pick<EinsatzMaterialRow, 'tab_id' | 'title'> & Partial<Omit<EinsatzMaterialRow, 'id' | 'created_at' | 'updated_at' | 'tab_id' | 'title'>>; Update: Partial<Omit<EinsatzMaterialRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'einsatz_materials_tab_id_fkey'; columns: ['tab_id']; isOneToOne: false; referencedRelation: 'einsatz_material_tabs'; referencedColumns: ['id'] },
      ] }
      fleet_vehicles: { Row: FleetVehicleRow; Insert: Pick<FleetVehicleRow, 'name' | 'kind'> & Partial<Omit<FleetVehicleRow, 'id' | 'created_at' | 'updated_at' | 'name' | 'kind'>>; Update: Partial<Omit<FleetVehicleRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'fleet_vehicles_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'fleet_vehicles_responsible_user_id_fkey'; columns: ['responsible_user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      zentrale_entries: { Row: ZentraleEntryRow; Insert: Pick<ZentraleEntryRow, 'category' | 'title'> & Partial<Omit<ZentraleEntryRow, 'id' | 'created_at' | 'updated_at' | 'category' | 'title'>>; Update: Partial<Omit<ZentraleEntryRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'zentrale_entries_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      duty_assignments: { Row: DutyAssignmentRow; Insert: Pick<DutyAssignmentRow, 'user_id' | 'function'> & Partial<Omit<DutyAssignmentRow, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'function'>>; Update: Partial<Omit<DutyAssignmentRow, 'id' | 'created_at' | 'user_id'>>; Relationships: [
        { foreignKeyName: 'duty_assignments_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'duty_assignments_vehicle_id_fkey'; columns: ['vehicle_id']; isOneToOne: false; referencedRelation: 'fleet_vehicles'; referencedColumns: ['id'] },
      ] }
      duty_functions: { Row: DutyFunctionConfigRow; Insert: Pick<DutyFunctionConfigRow, 'code' | 'label'> & Partial<Omit<DutyFunctionConfigRow, 'created_at' | 'updated_at' | 'code' | 'label'>>; Update: Partial<Omit<DutyFunctionConfigRow, 'code' | 'created_at'>>; Relationships: [] }
      incident_reports: { Row: IncidentReportRow; Insert: Pick<IncidentReportRow, 'summary' | 'disposition' | 'created_by'> & Partial<Omit<IncidentReportRow, 'id' | 'created_at' | 'updated_at' | 'summary' | 'disposition' | 'created_by'>>; Update: Partial<Omit<IncidentReportRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'incident_reports_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      operational_person_notes: { Row: OperationalPersonNoteRow; Insert: Pick<OperationalPersonNoteRow, 'person_name' | 'category' | 'note' | 'created_by'> & Partial<Omit<OperationalPersonNoteRow, 'id' | 'created_at' | 'updated_at' | 'person_name' | 'category' | 'note' | 'created_by'>>; Update: Partial<Omit<OperationalPersonNoteRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'operational_person_notes_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
    }
    Views: {
      orders_full: { Row: OrdersFullRow; Relationships: [] }
      budget_usage: { Row: BudgetUsageRow; Relationships: [] }
    }
    Functions: {
      create_support_request: { Args: { p_subject: string; p_kind: string; p_topic: string; p_body: string }; Returns: string }
      move_einsatz_material: { Args: { p_material_id: string; p_target_tab_id: string }; Returns: undefined }
      save_portal_profile_v2: { Args: { p_user_id: string; p_patch: Record<string, unknown>; p_einsatz_roles: string[] | null; p_schulungen_roles: string[] | null }; Returns: undefined }
      save_portal_profile_v3: { Args: { p_user_id: string; p_patch: Record<string, unknown>; p_einsatz_roles: string[] | null; p_schulungen_roles: string[] | null; p_fuhrpark_roles: string[] | null }; Returns: undefined }
      save_portal_profile_v4: { Args: { p_user_id: string; p_patch: Record<string, unknown>; p_einsatz_roles: string[] | null; p_schulungen_roles: string[] | null; p_fuhrpark_roles: string[] | null; p_zentrale_roles: string[] | null }; Returns: undefined }
      can_manage_schulungen: { Args: Record<string, never>; Returns: boolean }
      can_manage_fuhrpark: { Args: Record<string, never>; Returns: boolean }
      can_manage_zentrale: { Args: Record<string, never>; Returns: boolean }
      is_zentralist_on_duty: { Args: Record<string, never>; Returns: boolean }
      remove_training_attendance: { Args: { p_attendance_id: string }; Returns: undefined }
      save_training_munition: { Args: { p_session_id: string; p_previous_pool_id: string | null; p_previous_quantity: number | null; p_pool_id: string | null; p_quantity: number | null; p_marke: string | null; p_kaliber: string | null; p_art: string | null }; Returns: undefined }
      save_portal_profile: { Args: { p_user_id: string; p_patch: Record<string, unknown>; p_einsatz_roles: string[] | null }; Returns: undefined }
      receive_stock_order: { Args: { p_order_id: string }; Returns: undefined }
      book_order_inventory: { Args: { p_order_id: string; p_expected_updated_at: string | null; p_action: 'issue' | 'receive' | 'step_back'; p_quantity?: number }; Returns: undefined }

      submit_cart: { Args: Record<string, never>; Returns: string | null }
      update_editable_order: { Args: { p_order_id: string; p_size: string; p_quantity: number }; Returns: string }
      adjust_inventory: { Args: { p_product: string; p_size: string; p_delta: number }; Returns: number }
      has_portal_area_role: { Args: { p_area: string; p_role: string }; Returns: boolean }
      has_portal_area_access: { Args: { p_area: string }; Returns: boolean }
      can_manage_einsatzmittel: { Args: Record<string, never>; Returns: boolean }
      review_personal_einsatzmittel_request: { Args: { p_request_id: string; p_approved: boolean; p_note?: string | null }; Returns: string | null }
      can_self_register_einsatztraining: { Args: { p_session_id: string }; Returns: boolean }
      lookup_login_email: { Args: { p_username: string }; Returns: string | null }
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
