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
  /** Test-/Demo-Account (Konvention: username `test_…`, name `[TEST] …`). Siehe docs/TESTDATEN.md. */
  is_test?: boolean
}

export type ProductBezugsart = 'massa' | 'eigenbeschaffung'
export type ProductSizeMode = 'sizes' | 'universal' | 'none'

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
  bezugsart: ProductBezugsart
  size_mode: ProductSizeMode
  orderable_in_shop: boolean
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

export type PortalArea = 'bekleidung' | 'einsatz_mt' | 'schulungen' | 'fuhrpark' | 'zentrale' | 'datenpflege'

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
  | 'pfefferspray_klein'
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

/** Beschaffungsantrag für Pool-Einsatzmittel: Sachbearbeiter meldet Bedarf, Genehmiger entscheidet. */
export type PoolEinsatzmittelRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'
export interface PoolEinsatzmittelRequest {
  id: string
  requested_by: string
  category: PoolEmCategory
  verwahrungsort: Verwahrungsort
  anzahl: number
  begruendung: string
  status: PoolEinsatzmittelRequestStatus
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  requester?: Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username'> | null
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
  /** Übergeordneter Ordner, null = oberste Ebene - beliebig tief verschachtelbar. */
  parent_id: string | null
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
  operational_status: 'verfuegbar' | 'werkstatt' | 'ausser_dienst'
  operational_status_note: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  responsible_profile?: Pick<Profile, 'id' | 'name' | 'dienstnummer'> | null
}

export interface FleetEquipmentItem {
  id: string
  vehicle_id: string
  name: string
  soll_menge: number
  unit: string
  sort_order: number
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type FleetEquipmentStatusValue = 'vollstaendig' | 'fehlend' | 'beschaedigt' | 'abgelaufen'

/** Aktueller Ist-Zustand je Position; fehlt die Zeile, gilt die Position als ungeprüft. */
export interface FleetEquipmentStatus {
  item_id: string
  vehicle_id: string
  ist_menge: number | null
  status: FleetEquipmentStatusValue
  note: string | null
  checked_by: string
  checked_at: string
  updated_at: string
  checker?: Pick<Profile, 'id' | 'name' | 'dienstnummer'>
  /** Nur für die fahrzeugübergreifende Mängel-Seite (FleetMaengel.tsx). */
  item?: Pick<FleetEquipmentItem, 'id' | 'name' | 'soll_menge' | 'unit' | 'vehicle_id'>
  vehicle?: Pick<FleetVehicle, 'id' | 'name' | 'kind' | 'call_sign' | 'license_plate' | 'responsible_user_id'>
}

// Fahrzeugcheck: eigene, verwaltbare Checkliste für den Fahrzeugzustand
// (Reifen, Beleuchtung, Ölstand, Sauberkeit, ...) - unabhängig von den
// Ausstattungs-Positionen der Füllliste. Ergänzt die bestehende schnelle
// Tages-/Schicht-Kontrolle (vehicle_checks, auch von Außendienst genutzt),
// ersetzt sie nicht.
export interface FleetCheckItem {
  id: string
  vehicle_id: string
  name: string
  sort_order: number
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Aktueller Ist-Zustand je Fahrzeugcheck-Position; fehlt die Zeile, gilt die Position als ungeprüft. */
export interface FleetCheckItemStatus {
  item_id: string
  vehicle_id: string
  status: VehicleCheckStatus
  note: string | null
  checked_by: string
  checked_at: string
  updated_at: string
  checker?: Pick<Profile, 'id' | 'name' | 'dienstnummer'>
}

export type FleetCareTaskKind = 'innenreinigung' | 'aussenreinigung' | 'pflege' | 'sonstiges'
export type FleetTaskStatus = 'offen' | 'erledigt'

export interface FleetCareTask {
  id: string
  vehicle_id: string
  kind: FleetCareTaskKind
  subject: string
  note: string | null
  status: FleetTaskStatus
  created_by: string
  created_at: string
  resolved_by: string | null
  resolved_at: string | null
  updated_at: string
  /** Nur für die fahrzeugübergreifende Pflege-Seite (FleetPflege.tsx). */
  vehicle?: Pick<FleetVehicle, 'id' | 'name' | 'kind' | 'call_sign' | 'license_plate' | 'responsible_user_id'>
}

export type FleetAppointmentCategory = 'werkstatt' | 'frist'
export type FleetAppointmentStatus = 'offen' | 'erledigt' | 'storniert'

export interface FleetAppointment {
  id: string
  vehicle_id: string
  category: FleetAppointmentCategory
  subject: string
  due_date: string | null
  note: string | null
  status: FleetAppointmentStatus
  created_by: string
  created_at: string
  resolved_by: string | null
  resolved_at: string | null
  updated_at: string
  /** Nur für die fahrzeugübergreifenden Werkstatt-/Fristen-Seiten (FleetWerkstatt.tsx, FleetFristen.tsx). */
  vehicle?: Pick<FleetVehicle, 'id' | 'name' | 'kind' | 'call_sign' | 'license_plate' | 'responsible_user_id'>
}

/** Fahrzeuggebundene Dokumente (Zulassung, Serviceheft, ...). */
export interface FleetDocument {
  id: string
  vehicle_id: string
  title: string
  file_key: string
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  uploaded_by: string | null
  created_at: string
  uploader?: Pick<Profile, 'id' | 'name' | 'dienstnummer'> | null
  /** Nur für die fahrzeugübergreifende Dokumente-Seite (FleetDokumente.tsx). */
  vehicle?: Pick<FleetVehicle, 'id' | 'name' | 'kind' | 'call_sign' | 'license_plate' | 'responsible_user_id'>
}

// verbot/fahndung/schluessel/kontakt/alarmierung/unterlage haben eigene
// Tabellen mit passenden Feldern (siehe ZentraleAvBv, ZentraleFahndung,
// ZentraleSchluessel, ZentraleKontakt, ZentraleAlarmierung, ZentraleUnterlage
// weiter unten) - hier nur die weiterhin generischen Kategorien. uebergabe
// wird nur noch von Innendienst als eigener, manuell gepflegter Übergabepunkt
// genutzt - in der Zentrale-Übersicht ergibt sich die Schichtübergabe
// stattdessen aus den noch offenen Einsatzmeldungen (siehe Zentrale.tsx).
export type ZentraleEntryCategory = 'lage' | 'kontrollauftrag' | 'brief' | 'uebergabe'
export type ZentraleEntryPriority = 'normal' | 'hoch' | 'kritisch'
export type ZentraleEntryStatus = 'offen' | 'in_bearbeitung' | 'erledigt'
export type KontrollauftragZielfunktion = 'jd' | 'vd' | 'beide'

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
  location_lat: number | null
  location_lng: number | null
  /** Freitext für eine zeitliche Eingrenzung innerhalb der Gültigkeit, z. B. "ab 19:00 Uhr". */
  zeitfenster: string | null
  responsible: string | null
  reference: string | null
  restricted: boolean
  target_function: KontrollauftragZielfunktion | null
  /** Nur für category 'lage' gesetzt (Pflicht) - die auslösende Einsatzmeldung. */
  incident_id: string | null
  /** Nur für einen bewusst aus einem Schutzfall (BV/AV, EV) erzeugten Kontrollauftrag gesetzt. */
  schutzfall_id: string | null
  /** Erledigungsfrist. Nicht auf category 'kontrollauftrag' beschränkt, aktuell aber nirgends im Frontend gesetzt oder gelesen. */
  due_at: string | null
  /** Zeitpunkt des Erledigt-Klicks bei einem Kontrollauftrag - reine Gedankenstütze für die spätere Protokollierung im PAD, kein Nachweis. */
  erledigt_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ZentraleRegisterStatus = 'offen' | 'erledigt'

export type AvBvArt = 'amtsverbot' | 'betretungsverbot' | 'einreiseverbot'
export interface ZentraleAvBv {
  id: string
  art: AvBvArt
  person_id: string | null
  object_id: string | null
  gebiet: string | null
  grund: string
  ausstellende_behoerde: string | null
  aktenzeichen: string | null
  gueltig_von: string | null
  gueltig_bis: string | null
  note: string | null
  priority: ZentraleEntryPriority
  status: ZentraleRegisterStatus
  restricted: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  person?: Pick<OperationalPerson, 'id' | 'vorname' | 'nachname' | 'birth_date'> | null
  object?: Pick<OperationalObject, 'id' | 'address' | 'label'> | null
}

export type FahndungArt = 'person' | 'fahrzeug' | 'objekt' | 'sonstiges'
export interface ZentraleFahndung {
  id: string
  art: FahndungArt
  person_id: string | null
  object_id: string | null
  beschreibung: string
  aktenzeichen: string | null
  ausschreibende_dienststelle: string | null
  gueltig_bis: string | null
  note: string | null
  priority: ZentraleEntryPriority
  status: ZentraleRegisterStatus
  restricted: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  person?: Pick<OperationalPerson, 'id' | 'vorname' | 'nachname' | 'birth_date'> | null
  object?: Pick<OperationalObject, 'id' | 'address' | 'label'> | null
}

export type SchluesselStatus = 'verfuegbar' | 'ausgegeben'
export interface ZentraleSchluessel {
  id: string
  schluessel_nummer: string
  object_id: string | null
  verwahrort: string | null
  held_by: string | null
  note: string | null
  status: SchluesselStatus
  restricted: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  object?: Pick<OperationalObject, 'id' | 'address' | 'label'> | null
  held_by_profile?: Pick<Profile, 'id' | 'name' | 'dienstnummer'> | null
}

export interface ZentraleKontakt {
  id: string
  name: string
  institution: string | null
  funktion: string | null
  telefon: string | null
  email: string | null
  erreichbarkeit: string | null
  object_id: string | null
  note: string | null
  restricted: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  object?: Pick<OperationalObject, 'id' | 'address' | 'label'> | null
}

export type TelefonnummerKategorie = 'intern' | 'extern'

export interface WichtigeTelefonnummer {
  id: string
  kategorie: TelefonnummerKategorie
  bezeichnung: string
  nummer: string
  hinweis: string | null
  sortierung: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type AlarmierungBereich = 'polizei' | 'staedtisch' | 'beide'

export interface ZentraleAlarmierung {
  id: string
  anlass: string
  ablauf: string | null
  /** Die auslösende Operative Lage (zentrale_entries mit category 'lage'), sofern bekannt - Grundgerüst, bis das vollständige Alarmierungsschema vorliegt. */
  lage_id: string | null
  bereich: AlarmierungBereich | null
  stadtfuehrung_informiert: boolean
  stadtfuehrung_informiert_am: string | null
  gueltig_bis: string | null
  note: string | null
  restricted: boolean
  created_by: string | null
  created_at: string
  lage?: Pick<ZentraleEntry, 'id' | 'title' | 'incident_id'> | null
  updated_at: string
}

export type UnterlagenBereich = 'zentrale' | 'aussendienst' | 'innendienst'

export interface ZentraleUnterlage {
  id: string
  titel: string
  typ: string | null
  fundort: string | null
  gueltig_bis: string | null
  note: string | null
  restricted: boolean
  bereich: UnterlagenBereich
  created_by: string | null
  created_at: string
  updated_at: string
}

// Baustellen-Markierung auf der Zentrale-Karte (Streckenabschnitt, keine
// Verbindung zum Straßenzustandsbericht). 'gemeldet' = von einem Benutzer
// wahrgenommen und noch nicht bestätigt; 'offen' = bestätigt/aktiv;
// 'erledigt' = Baustelle beendet.
export type ZentraleBaustelleStatus = 'gemeldet' | 'offen' | 'erledigt'

export interface ZentraleBaustelle {
  id: string
  titel: string
  start_lat: number
  start_lng: number
  end_lat: number
  end_lng: number
  // Abgeleiteter Streckenverlauf entlang des Straßennetzes (Routing-Dienst,
  // siehe lib/routing.ts) - null, falls die Route nicht berechnet werden
  // konnte; dann wird ersatzweise die Luftlinie zwischen Start/Ende gezeigt.
  path: [number, number][] | null
  note: string | null
  status: ZentraleBaustelleStatus
  gueltig_bis: string | null
  restricted: boolean
  created_by: string | null
  confirmed_by: string | null
  confirmed_at: string | null
  created_at: string
  updated_at: string
}

export type StrassenzustandZustand = 'frei_befahrbar' | 'gesperrt' | 'sonstige'
export type StrassenzustandMeldungsart = 'neuzugang' | 'aenderung' | 'widerruf'

export interface StrassenzustandStammdatum {
  id: string
  name: string
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// Nur strassenzustand_strassen hat zusätzlich eine optionale Kartengeometrie
// (strassenzustand_auftraggeber/_melder nicht) - siehe ZentraleStrassenzustand.tsx.
// Ohne Geometrie erscheint eine aktive Sperre dieser Straße nicht automatisch auf der Karte.
export interface StrassenzustandStrasse extends StrassenzustandStammdatum {
  start_lat: number | null
  start_lng: number | null
  end_lat: number | null
  end_lng: number | null
  path: [number, number][] | null
}

export interface StrassenzustandBericht {
  id: string
  nummer: number
  bearbeiter: string
  anmerkung: string | null
  pdf_file_key: string | null
  pdf_file_name: string | null
  pdf_uploaded_at: string | null
  pdf_uploaded_by: string | null
  created_at: string
  updated_at: string
  profiles?: { name: string | null; dienstnummer: string | null; dienstgrad?: PoliceRank | null } | null
}

export interface StrassenzustandBerichtzeile {
  id: string
  bericht_id: string
  strasse_id: string | null
  strasse_freitext: string | null
  zustand: StrassenzustandZustand
  zustand_freitext: string | null
  auftraggeber_id: string | null
  auftraggeber_freitext: string | null
  melder_id: string | null
  melder_freitext: string | null
  gueltig_von: string
  gueltig_bis: string | null
  meldungsart: StrassenzustandMeldungsart
  created_at: string
  // Geometriefelder nur geladen, wo für die Kartendarstellung benötigt (siehe
  // ZentraleShell.tsx) - dort explizit mitselektiert statt immer, weil die
  // meisten Verwendungen (Berichte-Archiv, Stammdaten) nur den Namen brauchen.
  strassenzustand_strassen?: { name: string; start_lat?: number | null; start_lng?: number | null; end_lat?: number | null; end_lng?: number | null; path?: [number, number][] | null } | null
  strassenzustand_auftraggeber?: { name: string } | null
  strassenzustand_melder?: { name: string } | null
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
  /** Abwärtskompatible Anzeige - beim Speichern aus caller_person abgeleitet, sofern verknüpft. */
  caller_name: string | null
  /** Echte Verknüpfung zum Personen-Register statt Namens-Freitext. */
  caller_person_id: string | null
  reported_at: string
  location: string | null
  location_lat: number | null
  location_lng: number | null
  summary: string
  /** Abwärtskompatible Anzeige - beim Speichern aus involved_person_id abgeleitet, sofern verknüpft. */
  involved_person: string | null
  involved_birth_date: string | null
  /** Echte Verknüpfung zum Personen-Register statt Namens-/Geburtsdatum-Freitext. */
  involved_person_id: string | null
  disposition: IncidentDisposition
  note: string | null
  status: IncidentStatus
  /** Von der Zentrale zugewiesene Streife (Fahrzeug), zusätzlich zur groben Disposition (JD/VD/BP). */
  assigned_vehicle_id: string | null
  /** Beamter/in, der/die die Meldung im Außendienst selbst übernommen hat. */
  taken_over_by: string | null
  taken_over_at: string | null
  taken_over_vehicle_id: string | null
  completed_by: string | null
  completed_at: string | null
  created_by: string
  created_at: string
  updated_at: string
  caller_person?: Pick<OperationalPerson, 'id' | 'vorname' | 'nachname' | 'birth_date'> | null
  involved_person_ref?: Pick<OperationalPerson, 'id' | 'vorname' | 'nachname' | 'birth_date'> | null
  assigned_vehicle?: Pick<FleetVehicle, 'id' | 'name' | 'call_sign' | 'license_plate'> | null
  taken_over_by_profile?: Pick<Profile, 'id' | 'name'> | null
}

export interface IncidentSupport {
  id: string
  incident_id: string
  vehicle_id: string
  started_by: string
  started_at: string
  ended_by: string | null
  ended_at: string | null
  vehicle?: Pick<FleetVehicle, 'id' | 'name' | 'call_sign' | 'license_plate'> | null
}

export type EinsatzParteiRolle = 'beschuldigter' | 'opfer' | 'zeuge' | 'sonstige'

/** Beteiligte Partei eines Einsatzes - getrennt vom Melder, erfasst beim Weiterarbeiten mit dem Einsatz. */
export interface EinsatzPartei {
  id: string
  incident_id: string
  person_id: string
  rolle: EinsatzParteiRolle
  note: string | null
  created_by: string
  created_at: string
  person?: Pick<OperationalPerson, 'id' | 'vorname' | 'nachname' | 'birth_date'> | null
}

export type EinsatzChecklisteName = 'erstmeldung' | 'notunterkunft'

/** Ein Punkt der digitalen "Checkliste Notfall/Katastrophe" bzw. "Checkliste
 * Notunterkunft" (Stadt Dornbirn) - geteilter Server-Zustand statt
 * localStorage, damit Zentrale UND Streife denselben Bearbeitungsstand sehen. */
export interface EinsatzChecklistPunkt {
  id: string
  incident_id: string
  checkliste: EinsatzChecklisteName
  punkt_key: string
  erledigt: boolean
  wer: string | null
  erledigt_at: string | null
  erledigt_von: string | null
  updated_at: string
}

export type NamenslisteArt = 'haus' | 'kontrolle' | 'evakuierung' | 'befragung' | 'unterbringung'
export type NamenslistePersonStatus = 'offen' | 'erledigt' | 'im_haus' | 'draussen' | 'unbekannt'

/** Personenliste eines Einsatzes (ZMR-Auszug-Erkennung, Kontrollen, Evakuierung,
 * Befragung, Notunterkunft-Namensliste) - geteilter Server-Zustand statt
 * localStorage, damit Zentrale UND Streife dieselbe Liste sehen/bearbeiten. */
export interface NamenslistePerson {
  id: string
  incident_id: string
  listenart: NamenslisteArt
  name: string
  geboren: string | null
  wohnung: string | null
  alter: number | null
  geschlecht: 'm' | 'w' | 'd' | null
  sprache: string | null
  familie: string | null
  telefon: string | null
  ort_unterkunft: string | null
  anmerkungen: string | null
  status: NamenslistePersonStatus
  created_at: string
  created_by: string | null
}

/** Zentrales Personen-Register - Verknüpfungspunkt für Personenhinweise, RSa/RSb, AV/BV & EV und Fahndungen. */
export interface OperationalPerson {
  id: string
  /** Nachname und Vorname sind beide optional (am Telefon oft erst eines bekannt), mindestens eines ist gesetzt - siehe personDisplayName(). */
  nachname: string | null
  vorname: string | null
  birth_date: string | null
  phone: string | null
  /** Anschrift als echte Verknüpfung zum Objekte-Register statt erneuter Freitext-Eingabe. */
  home_object_id: string | null
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  home_object?: Pick<OperationalObject, 'id' | 'address' | 'label' | 'strasse' | 'hausnummer' | 'plz' | 'ort'> | null
}

/** Zentrales Objekte-Register (Adressen/Gebäude) - Verknüpfungspunkt für AV/BV & EV, Fahndungen, Schlüssel, Kontakte und (über home_object_id) Personen. */
export interface OperationalObject {
  id: string
  /** Freitext-Adresse - bleibt nutzbar, bis ein Objekt auf die strukturierten Felder umgestellt wird. */
  address: string
  /** Strukturierte Adressfelder - Voraussetzung für eine eindeutige Verknüpfung (z. B. Personen-Anschrift) statt Text-Abgleich. Optional, solange nicht jedes Objekt umgestellt ist. */
  strasse: string | null
  hausnummer: string | null
  plz: string | null
  ort: string | null
  label: string | null
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Telefonnummern-Register - verknüpfbar mit Person und/oder Objekt, wie bei AV/BV & EV und Fahndungen. */
export interface OperationalPhoneNumber {
  id: string
  number: string
  label: string | null
  person_id: string | null
  object_id: string | null
  /** Wann diese Nummer erhoben wurde - kann vom Erfassungsdatum (created_at) abweichen, z. B. bei einer nacherfassten älteren Vernehmung. */
  erhoben_am: string
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  person?: Pick<OperationalPerson, 'id' | 'vorname' | 'nachname' | 'birth_date'> | null
  object?: Pick<OperationalObject, 'id' | 'address' | 'label'> | null
}

export type OperationalPersonNoteCategory = 'infektionsschutz' | 'aggressiv' | 'waffenverbot' | 'fluchtgefahr' | 'suizidgefahr' | 'sonstiges'

export interface OperationalPersonNote {
  id: string
  person_id: string
  location: string | null
  category: OperationalPersonNoteCategory
  note: string
  action_guidance: string | null
  source_reference: string | null
  valid_until: string | null
  active: boolean
  created_by: string
  created_at: string
  updated_at: string
  person?: Pick<OperationalPerson, 'id' | 'vorname' | 'nachname' | 'birth_date' | 'phone'> | null
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

/** Trainingsvorschlag: Sachbearbeiter/Beamter schlägt vor, der Genehmiger teilt ein (oder lehnt ab). */
export type EinsatzTrainingAssignmentStatus = 'vorschlag' | 'eingeteilt' | 'abgelehnt'
export interface EinsatzTrainingAssignment {
  id: string
  officer_id: string
  module_id: string
  session_id: string | null
  status: EinsatzTrainingAssignmentStatus
  proposed_by: string
  proposed_at: string
  decided_by: string | null
  decided_at: string | null
  note: string | null
  created_at: string
  updated_at: string
  officer?: Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active' | 'organisation' | 'roles'> & Pick<Partial<Profile>, 'admin'>
  module?: Pick<EinsatzTrainingModule, 'id' | 'name' | 'kind' | 'module_type' | 'schiesst' | 'applies_to' | 'period_year' | 'period_half' | 'active'>
  session?: Pick<EinsatzTrainingSession, 'id' | 'session_date' | 'module_id' | 'capacity' | 'announced' | 'note'>
}

export type VehicleCheckStatus = 'ok' | 'mangel'

export interface VehicleCheck {
  id: string
  vehicle_id: string
  duty_date: string
  shift: DutyShift
  status: VehicleCheckStatus
  note: string | null
  checked_by: string
  created_at: string | null
  updated_at: string | null
  fleet_vehicles?: Pick<FleetVehicle, 'id' | 'name' | 'call_sign' | 'license_plate'>
  checker?: Pick<Profile, 'id' | 'name' | 'dienstnummer'>
}

export type MailDeliveryKind = 'rsa' | 'rsb' | 'vernehmung'
export type MailDeliveryStatus = 'offen' | 'zugestellt' | 'schriftlich_in_kenntnis' | 'nicht_angetroffen' | 'spaeter_erneut' | 'durchgefuehrt'

export interface MailDelivery {
  id: string
  person_id: string
  kind: MailDeliveryKind
  behoerden_aktenzahl: string | null
  eigene_geschaeftszahl: string | null
  status: MailDeliveryStatus
  note: string | null
  /** Automatisch = created_by; keine manuelle Auswahl. */
  akteneigentuemer_id: string | null
  last_action_by: string | null
  last_action_at: string | null
  owner_notified: boolean
  /** Gesetzt, sobald der Akteneigentümer den Akt endgültig geschlossen hat (verschwindet dann aus der Übersicht). */
  closed_at: string | null
  closed_by: string | null
  created_by: string
  created_at: string
  updated_at: string
  akteneigentuemer?: Pick<Profile, 'id' | 'name' | 'dienstnummer'> | null
  person?: Pick<OperationalPerson, 'id' | 'vorname' | 'nachname' | 'birth_date'> | null
}

/** Stückelungen als {"<Cent-Wert>": Anzahl}, z. B. {"5000":2,"500":3} für 2× 50 € und 3× 5 €. */
export type CashDenominations = Record<string, number>

export interface InnendienstShiftTask {
  id: string
  user_id: string
  duty_date: string
  shift: DutyShift
  kasse_confirmed_at: string | null
  /** Fixer Kassen-Grundbestand (Wechselgeld) zu Schichtbeginn, Standard 500 €. */
  float_amount: number
  /** Vom Bediensteten abgelesener erwarteter Erlös laut Kasse. */
  expected_revenue: number | null
  cash_denominations: CashDenominations | null
  /** Aus cash_denominations berechnete Summe zum Zeitpunkt der Bestätigung. */
  counted_total: number | null
  created_at: string | null
  updated_at: string | null
}

export type InnendienstRecordKind = 'bescheid_strassenmusik' | 'bescheid_strassenkunst' | 'verstoss'
/** 'entzogen' nur bei einem Bescheid, dem automatisch ein Verstoß entgegensteht (siehe Trigger revoke_bescheid_on_verstoss). */
export type InnendienstRecordStatus = 'offen' | 'erledigt' | 'entzogen'

export interface InnendienstRecord {
  id: string
  kind: InnendienstRecordKind
  reference: string | null
  subject: string
  /** Bei einem Bescheid die Person, für die er ausgestellt wurde - eine echte Verknüpfung zum Personen-Register statt Namens-Freitext, damit Verstöße je Person eindeutig zählbar sind. Ein Verstoß übernimmt automatisch dieselbe Person von seinem Bescheid. */
  person_id: string | null
  note: string | null
  status: InnendienstRecordStatus
  issued_date: string
  /** Nur bei kind='verstoss': der Bescheid (Straßenmusik/-kunst), gegen dessen Auflagen verstoßen wurde. Pflichtfeld für Verstöße. */
  related_bescheid_id: string | null
  /** Nur bei Bescheiden: zugewiesene Standplätze (a), b), ... in der Vorlage) - für den PDF-Export, siehe lib/innendienstBescheidPdf.ts. */
  standplaetze: string[] | null
  /** Nur bei Bescheiden mit Zeitfenster (z. B. Straßenkunst) - bei Straßenmusik ungenutzt (feste Zeittabelle in der Textvorlage). */
  zeit_von: string | null
  zeit_bis: string | null
  /** Nur bei Bescheiden: Kostenaufstellung im PDF wird live aus diesem Gebührensatz nachgeschlagen, kein gespeicherter Betrag. */
  gebuehrensatz_id: string | null
  /** Nur bei Bescheiden: Planbeilage (Luftbild+Kataster Marktplatz-Standplätze a)/b)) an das PDF anhängen - explizite Auswahl, da nicht jeder Bescheid diese Location betrifft. */
  planbeilage: boolean
  created_by: string
  created_at: string
  updated_at: string
  creator?: Pick<Profile, 'id' | 'name' | 'dienstnummer'>
  person?: Pick<OperationalPerson, 'id' | 'vorname' | 'nachname' | 'birth_date'> & { home_object?: Pick<OperationalObject, 'address' | 'strasse' | 'hausnummer' | 'plz' | 'ort'> | null } | null
  related_bescheid?: Pick<InnendienstRecord, 'id' | 'kind' | 'subject' | 'reference'> | null
  gebuehrensatz?: Pick<InnendienstGebuehrensatz, 'id' | 'name'> | null
}

/**
 * Gebührenordnung Innendienst: reine Referenztabelle, vom Genehmiger gepflegt.
 * Positionen (z. B. Bundesabgabe, Verwaltungsgebühr) werden zu benannten
 * Sätzen (z. B. "Bescheid Straßenmusik") zusammengesetzt; kein Bezug zu
 * konkreten innendienst_records-Einträgen.
 */
export interface InnendienstGebuehrenposition {
  id: string
  name: string
  betrag: number
  active: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface InnendienstGebuehrensatz {
  id: string
  name: string
  active: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface InnendienstGebuehrensatzPosition {
  id: string
  gebuehrensatz_id: string
  position_id: string
  created_at: string
  position?: Pick<InnendienstGebuehrenposition, 'id' | 'name' | 'betrag' | 'active'>
}

// Überstundenmeldung: self-service - jede/r Bedienstete erfasst die eigenen
// Überstunden und reicht sie ein, der Genehmiger entscheidet (siehe
// enforce_ueberstunden_update() für die Feld-Einschränkung je Rolle).
export type UeberstundenStatus = 'entwurf' | 'eingereicht' | 'genehmigt' | 'abgelehnt' | 'rueckfrage'
export type UeberstundenVerguetung = 'auszahlung' | 'stundenersatz'

export interface UeberstundenMeldung {
  id: string
  beamter_id: string
  /** Beginn des Zeitraums, aus dem die Lohnarten-Aufschlüsselung automatisch berechnet wird (siehe lib/ueberstunden.ts berechneAufschluesselung()). */
  von_datum: string
  von_zeit: string
  /** Ende des Zeitraums - kann an einem späteren Tag liegen als von_datum (mehrtägiger Dienst). */
  bis_datum: string
  bis_zeit: string
  grund: string
  verguetung: UeberstundenVerguetung
  /** Werktage Mo 06-19 Uhr, 50 % (LA 3250). */
  std_werktag_50: number
  /** Sonn-/Feiertage bis 8 Std, 100 % (LA 3520). */
  std_sonn_100: number
  /** Zeit 19-22 Uhr, 50 % (LA 3500). */
  std_19_22: number
  /** Zeit 22-06 Uhr, 100 % (LA 3510). */
  std_22_06: number
  /** Sonn-/Feiertage ab 8 Std, 200 % (LA 3530). */
  std_sonn_200: number
  status: UeberstundenStatus
  eingereicht_at: string | null
  genehmiger_id: string | null
  genehmigt_at: string | null
  genehmiger_note: string | null
  /** Vom Ersteller gewählter, voraussichtlicher Genehmiger (siehe lib/einsatzSchema-artige Genehmiger-Kette) - rein informativ, keine Entscheidung. */
  genehmiger_wahl_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  beamter?: Pick<Profile, 'id' | 'name' | 'dienstnummer'>
  genehmiger?: Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'dienstgrad'> | null
}

/**
 * Schulungen: Modul-/Termin-Tracking, analog zu Einsatztraining (Paket 5),
 * aber bewusst einfacher (kein kind/module_type/period, keine Halbjahres-
 * pflicht). Anmeldung/Zuteilung läuft über schulungen_assignments (Vorschlag
 * → Genehmiger-Entscheidung), genau wie bei EinsatzTrainingAssignment.
 */
export interface SchulungModule {
  id: string
  name: string
  active: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface SchulungSession {
  id: string
  module_id: string
  session_date: string
  note: string | null
  capacity: number | null
  announced: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  module?: Pick<SchulungModule, 'id' | 'name' | 'active'>
}

export interface SchulungRegistration {
  id: string
  session_id: string
  officer_id: string
  created_at: string
  officer?: Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active' | 'organisation' | 'roles'> & Pick<Partial<Profile>, 'admin'>
  session?: Pick<SchulungSession, 'id' | 'session_date' | 'module_id' | 'capacity' | 'announced' | 'note'>
}

export interface SchulungCompletion {
  id: string
  officer_id: string
  module_id: string
  session_id: string | null
  completed_on: string
  created_at: string
  created_by: string | null
  officer?: Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active' | 'organisation' | 'roles'> & Pick<Partial<Profile>, 'admin'>
}

export type SchulungAssignmentStatus = 'vorschlag' | 'eingeteilt' | 'abgelehnt'
export interface SchulungAssignment {
  id: string
  officer_id: string
  module_id: string
  session_id: string | null
  status: SchulungAssignmentStatus
  proposed_by: string
  proposed_at: string
  decided_by: string | null
  decided_at: string | null
  note: string | null
  created_at: string
  updated_at: string
  officer?: Pick<Profile, 'id' | 'name' | 'dienstnummer' | 'username' | 'active' | 'organisation' | 'roles'> & Pick<Partial<Profile>, 'admin'>
  module?: Pick<SchulungModule, 'id' | 'name' | 'active'>
  session?: Pick<SchulungSession, 'id' | 'session_date' | 'module_id' | 'capacity' | 'announced' | 'note'>
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
type SchulungModuleRow = Omit<SchulungModule, never>
type SchulungSessionRow = Omit<SchulungSession, 'module'>
type SchulungRegistrationRow = Omit<SchulungRegistration, 'officer' | 'session'>
type SchulungCompletionRow = Omit<SchulungCompletion, 'officer'>
type SchulungAssignmentRow = Omit<SchulungAssignment, 'officer' | 'module' | 'session'>
type InnendienstGebuehrenpositionRow = Omit<InnendienstGebuehrenposition, never>
type InnendienstGebuehrensatzRow = Omit<InnendienstGebuehrensatz, never>
type InnendienstGebuehrensatzPositionRow = Omit<InnendienstGebuehrensatzPosition, 'position'>
type UeberstundenMeldungRow = Omit<UeberstundenMeldung, 'beamter' | 'genehmiger'>
type PersonalEinsatzmittelRequestRow = Omit<PersonalEinsatzmittelRequest, 'requester'>
type PoolEinsatzmittelRow = Omit<PoolEinsatzmittel, never>
type PoolEinsatzmittelRequestRow = Omit<PoolEinsatzmittelRequest, 'requester'>
type EinsatzTrainingModuleRow = Omit<EinsatzTrainingModule, never>
type EinsatzTrainingSessionRow = Omit<EinsatzTrainingSession, 'module'>
type EinsatzTrainingAttendanceRow = Omit<EinsatzTrainingAttendance, 'officer'>
type EinsatzTrainingParticipationRow = Omit<EinsatzTrainingParticipation, 'module' | 'officer'>
type EinsatzTrainingCompletionRow = Omit<EinsatzTrainingCompletion, 'module' | 'officer'>
type EinsatzTrainingRegistrationRow = Omit<EinsatzTrainingRegistration, 'officer' | 'session'>
type EinsatzTrainingAssignmentRow = Omit<EinsatzTrainingAssignment, 'officer' | 'module' | 'session'>
type EinsatzMaterialTabRow = Omit<EinsatzMaterialTab, never>
type EinsatzMaterialRow = Omit<EinsatzMaterial, never>
type FleetVehicleRow = Omit<FleetVehicle, 'responsible_profile'>
type FleetEquipmentItemRow = Omit<FleetEquipmentItem, never>
type FleetEquipmentStatusRow = Omit<FleetEquipmentStatus, 'checker' | 'item' | 'vehicle'>
type FleetCheckItemRow = Omit<FleetCheckItem, never>
type FleetCheckItemStatusRow = Omit<FleetCheckItemStatus, 'checker'>
type FleetCareTaskRow = Omit<FleetCareTask, 'vehicle'>
type FleetAppointmentRow = Omit<FleetAppointment, 'vehicle'>
type FleetDocumentRow = Omit<FleetDocument, 'uploader' | 'vehicle'>
type ZentraleEntryRow = Omit<ZentraleEntry, never>
type DutyAssignmentRow = Omit<DutyAssignment, 'profiles' | 'fleet_vehicles'>
type DutyFunctionConfigRow = Omit<DutyFunctionConfig, never>
type IncidentReportRow = Omit<IncidentReport, 'caller_person' | 'involved_person_ref' | 'assigned_vehicle' | 'taken_over_by_profile'>
type EinsatzParteiRow = Omit<EinsatzPartei, 'person'>
type EinsatzChecklistPunktRow = Omit<EinsatzChecklistPunkt, never>
type NamenslistePersonRow = Omit<NamenslistePerson, never>
type OperationalPersonRow = Omit<OperationalPerson, 'home_object'>
type OperationalObjectRow = Omit<OperationalObject, never>
type OperationalPhoneNumberRow = Omit<OperationalPhoneNumber, 'person' | 'object'>
type OperationalPersonNoteRow = Omit<OperationalPersonNote, 'person'>
type VehicleCheckRow = Omit<VehicleCheck, 'fleet_vehicles' | 'checker'>
type MailDeliveryRow = Omit<MailDelivery, 'akteneigentuemer' | 'person'>
type ZentraleAvBvRow = Omit<ZentraleAvBv, 'person' | 'object'>
type SchutzfallRow = {
  id: string
  massnahme: 'bv_av' | 'ev'
  ev_rechtsgrundlage: '382b' | '382c' | 'kombiniert' | null
  gefaehrder_id: string
  pad_aktenzahl: string
  externe_aktenzahl: string | null
  ausstellende_stelle: string | null
  beginn: string
  ende: string
  status: 'aktiv' | 'aufgehoben' | 'abgelaufen'
  waffenverbot: boolean
  schluessel_status: 'nicht_erfasst' | 'abgenommen' | 'verwahrt' | 'gericht' | 'ausgefolgt'
  schluessel_verwahrort: string | null
  ausnahmen: string | null
  hinweise: string | null
  created_by: string
  created_at: string
  updated_at: string
}
type SchutzfallPersonRow = { schutzfall_id: string; person_id: string; created_at: string }
type SchutzbereichRow = { id: string; schutzfall_id: string; art: 'wohnung' | 'ort'; object_id: string | null; bezeichnung: string; lat: number; lng: number; radius_m: number; position_bestaetigt: boolean; sort_order: number; created_at: string; updated_at: string }
type SchutzkontrolleRow = { id: string; schutzfall_id: string; kontrolliert_am: string; notiz: string | null; created_by: string; created_at: string; updated_at: string }
type ZentraleFahndungRow = Omit<ZentraleFahndung, 'person' | 'object'>
type ZentraleSchluesselRow = Omit<ZentraleSchluessel, 'object' | 'held_by_profile'>
type ZentraleKontaktRow = Omit<ZentraleKontakt, 'object'>
type WichtigeTelefonnummerRow = Omit<WichtigeTelefonnummer, never>
type ZentraleAlarmierungRow = Omit<ZentraleAlarmierung, 'lage'>
type ZentraleBaustelleRow = Omit<ZentraleBaustelle, never>
type ZentraleUnterlageRow = Omit<ZentraleUnterlage, never>
type InnendienstShiftTaskRow = Omit<InnendienstShiftTask, never>
type InnendienstRecordRow = Omit<InnendienstRecord, 'creator' | 'person' | 'related_bescheid' | 'gebuehrensatz'>
type StrassenzustandStammdatumRow = Omit<StrassenzustandStammdatum, never>
type StrassenzustandStrasseRow = Omit<StrassenzustandStrasse, never>
type StrassenzustandBerichtRow = Omit<StrassenzustandBericht, 'profiles'>
type StrassenzustandBerichtzeileRow = Omit<StrassenzustandBerichtzeile, 'strassenzustand_strassen' | 'strassenzustand_auftraggeber' | 'strassenzustand_melder'>

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
      pool_einsatzmittel_requests: { Row: PoolEinsatzmittelRequestRow; Insert: Pick<PoolEinsatzmittelRequestRow, 'requested_by' | 'category' | 'verwahrungsort' | 'anzahl' | 'begruendung'> & Partial<Omit<PoolEinsatzmittelRequestRow, 'id' | 'created_at' | 'updated_at' | 'requested_by' | 'category' | 'verwahrungsort' | 'anzahl' | 'begruendung'>>; Update: Partial<Omit<PoolEinsatzmittelRequestRow, 'id' | 'created_at' | 'requested_by'>>; Relationships: [
        { foreignKeyName: 'pool_einsatzmittel_requests_requested_by_fkey'; columns: ['requested_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'pool_einsatzmittel_requests_reviewed_by_fkey'; columns: ['reviewed_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
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
      einsatz_training_assignments: { Row: EinsatzTrainingAssignmentRow; Insert: Pick<EinsatzTrainingAssignmentRow, 'officer_id' | 'module_id' | 'proposed_by'> & Partial<Omit<EinsatzTrainingAssignmentRow, 'id' | 'created_at' | 'updated_at' | 'officer_id' | 'module_id' | 'proposed_by'>>; Update: Partial<Omit<EinsatzTrainingAssignmentRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'einsatz_training_assignments_officer_id_fkey'; columns: ['officer_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_training_assignments_module_id_fkey'; columns: ['module_id']; isOneToOne: false; referencedRelation: 'einsatz_training_modules'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_training_assignments_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'einsatz_training_sessions'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_training_assignments_proposed_by_fkey'; columns: ['proposed_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_training_assignments_decided_by_fkey'; columns: ['decided_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      einsatz_material_tabs: { Row: EinsatzMaterialTabRow; Insert: Pick<EinsatzMaterialTabRow, 'area' | 'name'> & Partial<Omit<EinsatzMaterialTabRow, 'id' | 'created_at' | 'updated_at' | 'area' | 'name'>>; Update: Partial<Omit<EinsatzMaterialTabRow, 'id' | 'created_at'>>; Relationships: [] }
      einsatz_materials: { Row: EinsatzMaterialRow; Insert: Pick<EinsatzMaterialRow, 'tab_id' | 'title'> & Partial<Omit<EinsatzMaterialRow, 'id' | 'created_at' | 'updated_at' | 'tab_id' | 'title'>>; Update: Partial<Omit<EinsatzMaterialRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'einsatz_materials_tab_id_fkey'; columns: ['tab_id']; isOneToOne: false; referencedRelation: 'einsatz_material_tabs'; referencedColumns: ['id'] },
      ] }
      fleet_vehicles: { Row: FleetVehicleRow; Insert: Pick<FleetVehicleRow, 'name' | 'kind'> & Partial<Omit<FleetVehicleRow, 'id' | 'created_at' | 'updated_at' | 'name' | 'kind'>>; Update: Partial<Omit<FleetVehicleRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'fleet_vehicles_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'fleet_vehicles_responsible_user_id_fkey'; columns: ['responsible_user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      fleet_equipment_items: { Row: FleetEquipmentItemRow; Insert: Pick<FleetEquipmentItemRow, 'vehicle_id' | 'name'> & Partial<Omit<FleetEquipmentItemRow, 'id' | 'created_at' | 'updated_at' | 'vehicle_id' | 'name'>>; Update: Partial<Omit<FleetEquipmentItemRow, 'id' | 'created_at' | 'vehicle_id'>>; Relationships: [
        { foreignKeyName: 'fleet_equipment_items_vehicle_id_fkey'; columns: ['vehicle_id']; isOneToOne: false; referencedRelation: 'fleet_vehicles'; referencedColumns: ['id'] },
      ] }
      fleet_equipment_status: { Row: FleetEquipmentStatusRow; Insert: Pick<FleetEquipmentStatusRow, 'item_id' | 'vehicle_id' | 'checked_by'> & Partial<Omit<FleetEquipmentStatusRow, 'item_id' | 'vehicle_id' | 'checked_by'>>; Update: Partial<Omit<FleetEquipmentStatusRow, 'item_id' | 'vehicle_id'>>; Relationships: [
        { foreignKeyName: 'fleet_equipment_status_item_id_fkey'; columns: ['item_id']; isOneToOne: true; referencedRelation: 'fleet_equipment_items'; referencedColumns: ['id'] },
        { foreignKeyName: 'fleet_equipment_status_vehicle_id_fkey'; columns: ['vehicle_id']; isOneToOne: false; referencedRelation: 'fleet_vehicles'; referencedColumns: ['id'] },
      ] }
      fleet_check_items: { Row: FleetCheckItemRow; Insert: Pick<FleetCheckItemRow, 'vehicle_id' | 'name'> & Partial<Omit<FleetCheckItemRow, 'id' | 'created_at' | 'updated_at' | 'vehicle_id' | 'name'>>; Update: Partial<Omit<FleetCheckItemRow, 'id' | 'created_at' | 'vehicle_id'>>; Relationships: [
        { foreignKeyName: 'fleet_check_items_vehicle_id_fkey'; columns: ['vehicle_id']; isOneToOne: false; referencedRelation: 'fleet_vehicles'; referencedColumns: ['id'] },
      ] }
      fleet_check_item_status: { Row: FleetCheckItemStatusRow; Insert: Pick<FleetCheckItemStatusRow, 'item_id' | 'vehicle_id' | 'checked_by'> & Partial<Omit<FleetCheckItemStatusRow, 'item_id' | 'vehicle_id' | 'checked_by'>>; Update: Partial<Omit<FleetCheckItemStatusRow, 'item_id' | 'vehicle_id'>>; Relationships: [
        { foreignKeyName: 'fleet_check_item_status_item_id_fkey'; columns: ['item_id']; isOneToOne: true; referencedRelation: 'fleet_check_items'; referencedColumns: ['id'] },
        { foreignKeyName: 'fleet_check_item_status_vehicle_id_fkey'; columns: ['vehicle_id']; isOneToOne: false; referencedRelation: 'fleet_vehicles'; referencedColumns: ['id'] },
      ] }
      fleet_care_tasks: { Row: FleetCareTaskRow; Insert: Pick<FleetCareTaskRow, 'vehicle_id' | 'subject' | 'created_by'> & Partial<Omit<FleetCareTaskRow, 'id' | 'created_at' | 'updated_at' | 'vehicle_id' | 'subject' | 'created_by'>>; Update: Partial<Omit<FleetCareTaskRow, 'id' | 'created_at' | 'vehicle_id' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'fleet_care_tasks_vehicle_id_fkey'; columns: ['vehicle_id']; isOneToOne: false; referencedRelation: 'fleet_vehicles'; referencedColumns: ['id'] },
      ] }
      fleet_appointments: { Row: FleetAppointmentRow; Insert: Pick<FleetAppointmentRow, 'vehicle_id' | 'category' | 'subject' | 'created_by'> & Partial<Omit<FleetAppointmentRow, 'id' | 'created_at' | 'updated_at' | 'vehicle_id' | 'category' | 'subject' | 'created_by'>>; Update: Partial<Omit<FleetAppointmentRow, 'id' | 'created_at' | 'vehicle_id' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'fleet_appointments_vehicle_id_fkey'; columns: ['vehicle_id']; isOneToOne: false; referencedRelation: 'fleet_vehicles'; referencedColumns: ['id'] },
      ] }
      fleet_documents: { Row: FleetDocumentRow; Insert: Pick<FleetDocumentRow, 'vehicle_id' | 'title' | 'file_key'> & Partial<Omit<FleetDocumentRow, 'id' | 'created_at' | 'vehicle_id' | 'title' | 'file_key'>>; Update: Partial<Pick<FleetDocumentRow, 'title'>>; Relationships: [
        { foreignKeyName: 'fleet_documents_vehicle_id_fkey'; columns: ['vehicle_id']; isOneToOne: false; referencedRelation: 'fleet_vehicles'; referencedColumns: ['id'] },
        { foreignKeyName: 'fleet_documents_uploaded_by_fkey'; columns: ['uploaded_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      zentrale_entries: { Row: ZentraleEntryRow; Insert: Pick<ZentraleEntryRow, 'category' | 'title'> & Partial<Omit<ZentraleEntryRow, 'id' | 'created_at' | 'updated_at' | 'category' | 'title'>>; Update: Partial<Omit<ZentraleEntryRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'zentrale_entries_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      strassenzustand_strassen: { Row: StrassenzustandStrasseRow; Insert: Pick<StrassenzustandStrasseRow, 'name'> & Partial<Omit<StrassenzustandStrasseRow, 'id' | 'created_at' | 'updated_at' | 'name'>>; Update: Partial<Omit<StrassenzustandStrasseRow, 'id' | 'created_at'>>; Relationships: [] }
      strassenzustand_auftraggeber: { Row: StrassenzustandStammdatumRow; Insert: Pick<StrassenzustandStammdatumRow, 'name'> & Partial<Omit<StrassenzustandStammdatumRow, 'id' | 'created_at' | 'updated_at' | 'name'>>; Update: Partial<Omit<StrassenzustandStammdatumRow, 'id' | 'created_at'>>; Relationships: [] }
      strassenzustand_melder: { Row: StrassenzustandStammdatumRow; Insert: Pick<StrassenzustandStammdatumRow, 'name'> & Partial<Omit<StrassenzustandStammdatumRow, 'id' | 'created_at' | 'updated_at' | 'name'>>; Update: Partial<Omit<StrassenzustandStammdatumRow, 'id' | 'created_at'>>; Relationships: [] }
      strassenzustand_berichte: { Row: StrassenzustandBerichtRow; Insert: Pick<StrassenzustandBerichtRow, 'bearbeiter'> & Partial<Omit<StrassenzustandBerichtRow, 'id' | 'nummer' | 'created_at' | 'updated_at' | 'bearbeiter'>>; Update: Partial<Omit<StrassenzustandBerichtRow, 'id' | 'nummer' | 'created_at' | 'bearbeiter'>>; Relationships: [
        { foreignKeyName: 'strassenzustand_berichte_bearbeiter_fkey'; columns: ['bearbeiter']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      strassenzustand_berichtzeilen: { Row: StrassenzustandBerichtzeileRow; Insert: Pick<StrassenzustandBerichtzeileRow, 'bericht_id' | 'zustand'> & Partial<Omit<StrassenzustandBerichtzeileRow, 'id' | 'meldungsart' | 'bericht_id' | 'zustand'>>; Update: Partial<Omit<StrassenzustandBerichtzeileRow, 'id' | 'created_at' | 'bericht_id'>>; Relationships: [
        { foreignKeyName: 'strassenzustand_berichtzeilen_bericht_id_fkey'; columns: ['bericht_id']; isOneToOne: false; referencedRelation: 'strassenzustand_berichte'; referencedColumns: ['id'] },
        { foreignKeyName: 'strassenzustand_berichtzeilen_strasse_id_fkey'; columns: ['strasse_id']; isOneToOne: false; referencedRelation: 'strassenzustand_strassen'; referencedColumns: ['id'] },
        { foreignKeyName: 'strassenzustand_berichtzeilen_auftraggeber_id_fkey'; columns: ['auftraggeber_id']; isOneToOne: false; referencedRelation: 'strassenzustand_auftraggeber'; referencedColumns: ['id'] },
        { foreignKeyName: 'strassenzustand_berichtzeilen_melder_id_fkey'; columns: ['melder_id']; isOneToOne: false; referencedRelation: 'strassenzustand_melder'; referencedColumns: ['id'] },
      ] }
      duty_assignments: { Row: DutyAssignmentRow; Insert: Pick<DutyAssignmentRow, 'user_id' | 'function'> & Partial<Omit<DutyAssignmentRow, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'function'>>; Update: Partial<Omit<DutyAssignmentRow, 'id' | 'created_at' | 'user_id'>>; Relationships: [
        { foreignKeyName: 'duty_assignments_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'duty_assignments_vehicle_id_fkey'; columns: ['vehicle_id']; isOneToOne: false; referencedRelation: 'fleet_vehicles'; referencedColumns: ['id'] },
      ] }
      duty_functions: { Row: DutyFunctionConfigRow; Insert: Pick<DutyFunctionConfigRow, 'code' | 'label'> & Partial<Omit<DutyFunctionConfigRow, 'created_at' | 'updated_at' | 'code' | 'label'>>; Update: Partial<Omit<DutyFunctionConfigRow, 'code' | 'created_at'>>; Relationships: [] }
      incident_reports: { Row: IncidentReportRow; Insert: Pick<IncidentReportRow, 'summary' | 'disposition' | 'created_by'> & Partial<Omit<IncidentReportRow, 'id' | 'created_at' | 'updated_at' | 'summary' | 'disposition' | 'created_by'>>; Update: Partial<Omit<IncidentReportRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'incident_reports_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'incident_reports_caller_person_id_fkey'; columns: ['caller_person_id']; isOneToOne: false; referencedRelation: 'operational_persons'; referencedColumns: ['id'] },
        { foreignKeyName: 'incident_reports_involved_person_id_fkey'; columns: ['involved_person_id']; isOneToOne: false; referencedRelation: 'operational_persons'; referencedColumns: ['id'] },
        { foreignKeyName: 'incident_reports_assigned_vehicle_id_fkey'; columns: ['assigned_vehicle_id']; isOneToOne: false; referencedRelation: 'fleet_vehicles'; referencedColumns: ['id'] },
        { foreignKeyName: 'incident_reports_taken_over_by_fkey'; columns: ['taken_over_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      incident_supports: { Row: IncidentSupport; Insert: Pick<IncidentSupport, 'incident_id' | 'vehicle_id' | 'started_by'> & Partial<Omit<IncidentSupport, 'id' | 'started_at' | 'incident_id' | 'vehicle_id' | 'started_by'>>; Update: Partial<Omit<IncidentSupport, 'id' | 'incident_id' | 'vehicle_id' | 'started_by' | 'started_at'>>; Relationships: [
        { foreignKeyName: 'incident_supports_incident_id_fkey'; columns: ['incident_id']; isOneToOne: false; referencedRelation: 'incident_reports'; referencedColumns: ['id'] },
        { foreignKeyName: 'incident_supports_vehicle_id_fkey'; columns: ['vehicle_id']; isOneToOne: false; referencedRelation: 'fleet_vehicles'; referencedColumns: ['id'] },
        { foreignKeyName: 'incident_supports_started_by_fkey'; columns: ['started_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'incident_supports_ended_by_fkey'; columns: ['ended_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      einsatz_parteien: { Row: EinsatzParteiRow; Insert: Pick<EinsatzParteiRow, 'incident_id' | 'person_id' | 'rolle' | 'created_by'> & Partial<Omit<EinsatzParteiRow, 'id' | 'created_at' | 'incident_id' | 'person_id' | 'rolle' | 'created_by'>>; Update: Partial<Omit<EinsatzParteiRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'einsatz_parteien_incident_id_fkey'; columns: ['incident_id']; isOneToOne: false; referencedRelation: 'incident_reports'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_parteien_person_id_fkey'; columns: ['person_id']; isOneToOne: false; referencedRelation: 'operational_persons'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_parteien_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      einsatz_checklist_punkte: { Row: EinsatzChecklistPunktRow; Insert: Pick<EinsatzChecklistPunktRow, 'incident_id' | 'checkliste' | 'punkt_key'> & Partial<Omit<EinsatzChecklistPunktRow, 'id' | 'incident_id' | 'checkliste' | 'punkt_key'>>; Update: Partial<Omit<EinsatzChecklistPunktRow, 'id' | 'incident_id' | 'checkliste' | 'punkt_key'>>; Relationships: [
        { foreignKeyName: 'einsatz_checklist_punkte_incident_id_fkey'; columns: ['incident_id']; isOneToOne: false; referencedRelation: 'incident_reports'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_checklist_punkte_erledigt_von_fkey'; columns: ['erledigt_von']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      einsatz_namensliste: { Row: NamenslistePersonRow; Insert: Pick<NamenslistePersonRow, 'incident_id' | 'listenart' | 'name'> & Partial<Omit<NamenslistePersonRow, 'id' | 'incident_id' | 'listenart' | 'name' | 'created_at'>>; Update: Partial<Omit<NamenslistePersonRow, 'id' | 'incident_id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'einsatz_namensliste_incident_id_fkey'; columns: ['incident_id']; isOneToOne: false; referencedRelation: 'incident_reports'; referencedColumns: ['id'] },
        { foreignKeyName: 'einsatz_namensliste_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      operational_persons: { Row: OperationalPersonRow; Insert: Partial<Omit<OperationalPersonRow, 'id' | 'created_at' | 'updated_at'>>; Update: Partial<Omit<OperationalPersonRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'operational_persons_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'operational_persons_home_object_id_fkey'; columns: ['home_object_id']; isOneToOne: false; referencedRelation: 'operational_objects'; referencedColumns: ['id'] },
      ] }
      operational_objects: { Row: OperationalObjectRow; Insert: Pick<OperationalObjectRow, 'address'> & Partial<Omit<OperationalObjectRow, 'id' | 'created_at' | 'updated_at' | 'address'>>; Update: Partial<Omit<OperationalObjectRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'operational_objects_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      operational_phone_numbers: { Row: OperationalPhoneNumberRow; Insert: Pick<OperationalPhoneNumberRow, 'number'> & Partial<Omit<OperationalPhoneNumberRow, 'id' | 'created_at' | 'updated_at' | 'number'>>; Update: Partial<Omit<OperationalPhoneNumberRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'operational_phone_numbers_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'operational_phone_numbers_person_id_fkey'; columns: ['person_id']; isOneToOne: false; referencedRelation: 'operational_persons'; referencedColumns: ['id'] },
        { foreignKeyName: 'operational_phone_numbers_object_id_fkey'; columns: ['object_id']; isOneToOne: false; referencedRelation: 'operational_objects'; referencedColumns: ['id'] },
      ] }
      operational_person_notes: { Row: OperationalPersonNoteRow; Insert: Pick<OperationalPersonNoteRow, 'person_id' | 'category' | 'note' | 'created_by'> & Partial<Omit<OperationalPersonNoteRow, 'id' | 'created_at' | 'updated_at' | 'person_id' | 'category' | 'note' | 'created_by'>>; Update: Partial<Omit<OperationalPersonNoteRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'operational_person_notes_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'operational_person_notes_person_id_fkey'; columns: ['person_id']; isOneToOne: false; referencedRelation: 'operational_persons'; referencedColumns: ['id'] },
      ] }
      schutzfaelle: { Row: SchutzfallRow; Insert: Pick<SchutzfallRow, 'massnahme' | 'gefaehrder_id' | 'pad_aktenzahl' | 'beginn' | 'ende' | 'created_by'> & Partial<Omit<SchutzfallRow, 'id' | 'created_at' | 'updated_at' | 'massnahme' | 'gefaehrder_id' | 'pad_aktenzahl' | 'beginn' | 'ende' | 'created_by'>>; Update: Partial<Omit<SchutzfallRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'schutzfaelle_gefaehrder_id_fkey'; columns: ['gefaehrder_id']; isOneToOne: false; referencedRelation: 'operational_persons'; referencedColumns: ['id'] },
        { foreignKeyName: 'schutzfaelle_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      schutzfall_personen: { Row: SchutzfallPersonRow; Insert: Pick<SchutzfallPersonRow, 'schutzfall_id' | 'person_id'> & Partial<Pick<SchutzfallPersonRow, 'created_at'>>; Update: Partial<SchutzfallPersonRow>; Relationships: [
        { foreignKeyName: 'schutzfall_personen_schutzfall_id_fkey'; columns: ['schutzfall_id']; isOneToOne: false; referencedRelation: 'schutzfaelle'; referencedColumns: ['id'] },
        { foreignKeyName: 'schutzfall_personen_person_id_fkey'; columns: ['person_id']; isOneToOne: false; referencedRelation: 'operational_persons'; referencedColumns: ['id'] },
      ] }
      schutzbereiche: { Row: SchutzbereichRow; Insert: Pick<SchutzbereichRow, 'schutzfall_id' | 'art' | 'bezeichnung' | 'lat' | 'lng' | 'radius_m'> & Partial<Omit<SchutzbereichRow, 'id' | 'created_at' | 'updated_at' | 'schutzfall_id' | 'art' | 'bezeichnung' | 'lat' | 'lng' | 'radius_m'>>; Update: Partial<Omit<SchutzbereichRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'schutzbereiche_schutzfall_id_fkey'; columns: ['schutzfall_id']; isOneToOne: false; referencedRelation: 'schutzfaelle'; referencedColumns: ['id'] },
        { foreignKeyName: 'schutzbereiche_object_id_fkey'; columns: ['object_id']; isOneToOne: false; referencedRelation: 'operational_objects'; referencedColumns: ['id'] },
      ] }
      schutzkontrollen: { Row: SchutzkontrolleRow; Insert: Pick<SchutzkontrolleRow, 'schutzfall_id' | 'created_by'> & Partial<Omit<SchutzkontrolleRow, 'id' | 'created_at' | 'updated_at' | 'schutzfall_id' | 'created_by'>>; Update: Partial<Omit<SchutzkontrolleRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'schutzkontrollen_schutzfall_id_fkey'; columns: ['schutzfall_id']; isOneToOne: false; referencedRelation: 'schutzfaelle'; referencedColumns: ['id'] },
        { foreignKeyName: 'schutzkontrollen_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      zentrale_av_bv: { Row: ZentraleAvBvRow; Insert: Pick<ZentraleAvBvRow, 'art' | 'grund' | 'created_by'> & Partial<Omit<ZentraleAvBvRow, 'id' | 'created_at' | 'updated_at' | 'art' | 'grund' | 'created_by'>>; Update: Partial<Omit<ZentraleAvBvRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'zentrale_av_bv_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'zentrale_av_bv_person_id_fkey'; columns: ['person_id']; isOneToOne: false; referencedRelation: 'operational_persons'; referencedColumns: ['id'] },
        { foreignKeyName: 'zentrale_av_bv_object_id_fkey'; columns: ['object_id']; isOneToOne: false; referencedRelation: 'operational_objects'; referencedColumns: ['id'] },
      ] }
      zentrale_fahndungen: { Row: ZentraleFahndungRow; Insert: Pick<ZentraleFahndungRow, 'art' | 'beschreibung' | 'created_by'> & Partial<Omit<ZentraleFahndungRow, 'id' | 'created_at' | 'updated_at' | 'art' | 'beschreibung' | 'created_by'>>; Update: Partial<Omit<ZentraleFahndungRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'zentrale_fahndungen_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'zentrale_fahndungen_person_id_fkey'; columns: ['person_id']; isOneToOne: false; referencedRelation: 'operational_persons'; referencedColumns: ['id'] },
        { foreignKeyName: 'zentrale_fahndungen_object_id_fkey'; columns: ['object_id']; isOneToOne: false; referencedRelation: 'operational_objects'; referencedColumns: ['id'] },
      ] }
      zentrale_schluessel: { Row: ZentraleSchluesselRow; Insert: Pick<ZentraleSchluesselRow, 'schluessel_nummer' | 'created_by'> & Partial<Omit<ZentraleSchluesselRow, 'id' | 'created_at' | 'updated_at' | 'schluessel_nummer' | 'created_by'>>; Update: Partial<Omit<ZentraleSchluesselRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'zentrale_schluessel_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'zentrale_schluessel_object_id_fkey'; columns: ['object_id']; isOneToOne: false; referencedRelation: 'operational_objects'; referencedColumns: ['id'] },
        { foreignKeyName: 'zentrale_schluessel_held_by_fkey'; columns: ['held_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      zentrale_kontakte: { Row: ZentraleKontaktRow; Insert: Pick<ZentraleKontaktRow, 'name' | 'created_by'> & Partial<Omit<ZentraleKontaktRow, 'id' | 'created_at' | 'updated_at' | 'name' | 'created_by'>>; Update: Partial<Omit<ZentraleKontaktRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'zentrale_kontakte_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'zentrale_kontakte_object_id_fkey'; columns: ['object_id']; isOneToOne: false; referencedRelation: 'operational_objects'; referencedColumns: ['id'] },
      ] }
      wichtige_telefonnummern: { Row: WichtigeTelefonnummerRow; Insert: Pick<WichtigeTelefonnummerRow, 'kategorie' | 'bezeichnung' | 'nummer' | 'created_by'> & Partial<Omit<WichtigeTelefonnummerRow, 'id' | 'created_at' | 'updated_at' | 'kategorie' | 'bezeichnung' | 'nummer' | 'created_by'>>; Update: Partial<Omit<WichtigeTelefonnummerRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'wichtige_telefonnummern_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      zentrale_alarmierung: { Row: ZentraleAlarmierungRow; Insert: Pick<ZentraleAlarmierungRow, 'anlass' | 'created_by'> & Partial<Omit<ZentraleAlarmierungRow, 'id' | 'created_at' | 'updated_at' | 'anlass' | 'created_by'>>; Update: Partial<Omit<ZentraleAlarmierungRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'zentrale_alarmierung_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'zentrale_alarmierung_lage_id_fkey'; columns: ['lage_id']; isOneToOne: false; referencedRelation: 'zentrale_entries'; referencedColumns: ['id'] },
      ] }
      zentrale_unterlagen: { Row: ZentraleUnterlageRow; Insert: Pick<ZentraleUnterlageRow, 'titel' | 'created_by'> & Partial<Omit<ZentraleUnterlageRow, 'id' | 'created_at' | 'updated_at' | 'titel' | 'created_by'>>; Update: Partial<Omit<ZentraleUnterlageRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'zentrale_unterlagen_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      zentrale_baustellen: { Row: ZentraleBaustelleRow; Insert: Pick<ZentraleBaustelleRow, 'titel' | 'start_lat' | 'start_lng' | 'end_lat' | 'end_lng' | 'created_by'> & Partial<Omit<ZentraleBaustelleRow, 'id' | 'created_at' | 'updated_at' | 'titel' | 'start_lat' | 'start_lng' | 'end_lat' | 'end_lng' | 'created_by'>>; Update: Partial<Omit<ZentraleBaustelleRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'zentrale_baustellen_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'zentrale_baustellen_confirmed_by_fkey'; columns: ['confirmed_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      vehicle_checks: { Row: VehicleCheckRow; Insert: Pick<VehicleCheckRow, 'vehicle_id' | 'checked_by'> & Partial<Omit<VehicleCheckRow, 'id' | 'created_at' | 'updated_at' | 'vehicle_id' | 'checked_by'>>; Update: Partial<Omit<VehicleCheckRow, 'id' | 'created_at' | 'vehicle_id'>>; Relationships: [
        { foreignKeyName: 'vehicle_checks_vehicle_id_fkey'; columns: ['vehicle_id']; isOneToOne: false; referencedRelation: 'fleet_vehicles'; referencedColumns: ['id'] },
        { foreignKeyName: 'vehicle_checks_checked_by_fkey'; columns: ['checked_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      mail_deliveries: { Row: MailDeliveryRow; Insert: Pick<MailDeliveryRow, 'person_id' | 'kind' | 'created_by'> & Partial<Omit<MailDeliveryRow, 'id' | 'created_at' | 'updated_at' | 'person_id' | 'kind' | 'created_by'>>; Update: Partial<Omit<MailDeliveryRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'mail_deliveries_akteneigentuemer_id_fkey'; columns: ['akteneigentuemer_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'mail_deliveries_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'mail_deliveries_person_id_fkey'; columns: ['person_id']; isOneToOne: false; referencedRelation: 'operational_persons'; referencedColumns: ['id'] },
      ] }
      innendienst_shift_tasks: { Row: InnendienstShiftTaskRow; Insert: Pick<InnendienstShiftTaskRow, 'user_id'> & Partial<Omit<InnendienstShiftTaskRow, 'id' | 'created_at' | 'updated_at' | 'user_id'>>; Update: Partial<Omit<InnendienstShiftTaskRow, 'id' | 'created_at' | 'user_id'>>; Relationships: [
        { foreignKeyName: 'innendienst_shift_tasks_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      innendienst_records: { Row: InnendienstRecordRow; Insert: Pick<InnendienstRecordRow, 'kind' | 'subject' | 'created_by'> & Partial<Omit<InnendienstRecordRow, 'id' | 'created_at' | 'updated_at' | 'kind' | 'subject' | 'created_by'>>; Update: Partial<Omit<InnendienstRecordRow, 'id' | 'created_at' | 'created_by'>>; Relationships: [
        { foreignKeyName: 'innendienst_records_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'innendienst_records_related_bescheid_id_fkey'; columns: ['related_bescheid_id']; isOneToOne: false; referencedRelation: 'innendienst_records'; referencedColumns: ['id'] },
        { foreignKeyName: 'innendienst_records_person_id_fkey'; columns: ['person_id']; isOneToOne: false; referencedRelation: 'operational_persons'; referencedColumns: ['id'] },
      ] }
      innendienst_gebuehrenpositionen: { Row: InnendienstGebuehrenpositionRow; Insert: Pick<InnendienstGebuehrenpositionRow, 'name' | 'betrag'> & Partial<Omit<InnendienstGebuehrenpositionRow, 'name' | 'betrag'>>; Update: Partial<Omit<InnendienstGebuehrenpositionRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'innendienst_gebuehrenpositionen_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      innendienst_gebuehrensaetze: { Row: InnendienstGebuehrensatzRow; Insert: Pick<InnendienstGebuehrensatzRow, 'name'> & Partial<Omit<InnendienstGebuehrensatzRow, 'name'>>; Update: Partial<Omit<InnendienstGebuehrensatzRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'innendienst_gebuehrensaetze_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      innendienst_gebuehrensatz_positionen: { Row: InnendienstGebuehrensatzPositionRow; Insert: Pick<InnendienstGebuehrensatzPositionRow, 'gebuehrensatz_id' | 'position_id'> & Partial<Omit<InnendienstGebuehrensatzPositionRow, 'gebuehrensatz_id' | 'position_id'>>; Update: Partial<Omit<InnendienstGebuehrensatzPositionRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'innendienst_gebuehrensatz_positionen_gebuehrensatz_id_fkey'; columns: ['gebuehrensatz_id']; isOneToOne: false; referencedRelation: 'innendienst_gebuehrensaetze'; referencedColumns: ['id'] },
        { foreignKeyName: 'innendienst_gebuehrensatz_positionen_position_id_fkey'; columns: ['position_id']; isOneToOne: false; referencedRelation: 'innendienst_gebuehrenpositionen'; referencedColumns: ['id'] },
      ] }
      ueberstunden_meldungen: { Row: UeberstundenMeldungRow; Insert: Pick<UeberstundenMeldungRow, 'beamter_id' | 'von_datum' | 'von_zeit' | 'bis_datum' | 'bis_zeit' | 'grund' | 'created_by'> & Partial<Omit<UeberstundenMeldungRow, 'id' | 'created_at' | 'updated_at' | 'beamter_id' | 'von_datum' | 'von_zeit' | 'bis_datum' | 'bis_zeit' | 'grund' | 'created_by'>>; Update: Partial<Omit<UeberstundenMeldungRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'ueberstunden_meldungen_beamter_id_fkey'; columns: ['beamter_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'ueberstunden_meldungen_genehmiger_id_fkey'; columns: ['genehmiger_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'ueberstunden_meldungen_genehmiger_wahl_id_fkey'; columns: ['genehmiger_wahl_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'ueberstunden_meldungen_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      schulungen_module: { Row: SchulungModuleRow; Insert: Pick<SchulungModuleRow, 'name'> & Partial<Omit<SchulungModuleRow, 'name'>>; Update: Partial<Omit<SchulungModuleRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'schulungen_module_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      schulungen_sessions: { Row: SchulungSessionRow; Insert: Pick<SchulungSessionRow, 'module_id' | 'session_date'> & Partial<Omit<SchulungSessionRow, 'module_id' | 'session_date'>>; Update: Partial<Omit<SchulungSessionRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'schulungen_sessions_module_id_fkey'; columns: ['module_id']; isOneToOne: false; referencedRelation: 'schulungen_module'; referencedColumns: ['id'] },
        { foreignKeyName: 'schulungen_sessions_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      schulungen_registrations: { Row: SchulungRegistrationRow; Insert: Pick<SchulungRegistrationRow, 'session_id' | 'officer_id'> & Partial<Omit<SchulungRegistrationRow, 'session_id' | 'officer_id'>>; Update: Partial<Omit<SchulungRegistrationRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'schulungen_registrations_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'schulungen_sessions'; referencedColumns: ['id'] },
        { foreignKeyName: 'schulungen_registrations_officer_id_fkey'; columns: ['officer_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
      ] }
      schulungen_completions: { Row: SchulungCompletionRow; Insert: Pick<SchulungCompletionRow, 'officer_id' | 'module_id'> & Partial<Omit<SchulungCompletionRow, 'officer_id' | 'module_id'>>; Update: Partial<Omit<SchulungCompletionRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'schulungen_completions_officer_id_fkey'; columns: ['officer_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'schulungen_completions_module_id_fkey'; columns: ['module_id']; isOneToOne: false; referencedRelation: 'schulungen_module'; referencedColumns: ['id'] },
        { foreignKeyName: 'schulungen_completions_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'schulungen_sessions'; referencedColumns: ['id'] },
      ] }
      schulungen_assignments: { Row: SchulungAssignmentRow; Insert: Pick<SchulungAssignmentRow, 'officer_id' | 'module_id' | 'proposed_by'> & Partial<Omit<SchulungAssignmentRow, 'officer_id' | 'module_id' | 'proposed_by'>>; Update: Partial<Omit<SchulungAssignmentRow, 'id' | 'created_at'>>; Relationships: [
        { foreignKeyName: 'schulungen_assignments_officer_id_fkey'; columns: ['officer_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'schulungen_assignments_module_id_fkey'; columns: ['module_id']; isOneToOne: false; referencedRelation: 'schulungen_module'; referencedColumns: ['id'] },
        { foreignKeyName: 'schulungen_assignments_session_id_fkey'; columns: ['session_id']; isOneToOne: false; referencedRelation: 'schulungen_sessions'; referencedColumns: ['id'] },
        { foreignKeyName: 'schulungen_assignments_proposed_by_fkey'; columns: ['proposed_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        { foreignKeyName: 'schulungen_assignments_decided_by_fkey'; columns: ['decided_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
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
      save_portal_profile_v5: { Args: { p_user_id: string; p_patch: Record<string, unknown>; p_einsatz_roles: string[] | null; p_schulungen_roles: string[] | null; p_fuhrpark_roles: string[] | null; p_zentrale_roles: string[] | null; p_datenpflege_roles: string[] | null }; Returns: undefined }
      can_manage_schulungen: { Args: Record<string, never>; Returns: boolean }
      can_manage_fuhrpark: { Args: Record<string, never>; Returns: boolean }
      is_vehicle_responsible: { Args: { p_vehicle_id: string }; Returns: boolean }
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
      record_mail_delivery_action: { Args: { p_id: string; p_status: string }; Returns: undefined }
      close_mail_delivery: { Args: { p_id: string }; Returns: undefined }
      merge_operational_persons: { Args: { p_keep_id: string; p_remove_id: string }; Returns: undefined }
      take_over_incident: { Args: { p_id: string }; Returns: undefined }
      release_incident_takeover: { Args: { p_id: string }; Returns: undefined }
      suggest_duty_vehicle: { Args: { p_function: string }; Returns: string | null }
      current_patrol_vehicle: { Args: Record<string, never>; Returns: string | null }
      support_incident: { Args: { p_id: string }; Returns: undefined }
      stop_supporting_incident: { Args: { p_id: string }; Returns: undefined }
      complete_incident: { Args: { p_id: string }; Returns: undefined }
      reopen_incident: { Args: { p_id: string }; Returns: undefined }
      create_schutzfall_kontrollauftrag: { Args: { p_schutzfall_id: string }; Returns: string | null }
      remove_schutzfall_kontrollauftrag: { Args: { p_schutzfall_id: string }; Returns: undefined }
      decide_training_assignment: { Args: { p_assignment_id: string; p_approve: boolean; p_session_id?: string | null; p_note?: string | null }; Returns: string | null }
      decide_pool_einsatzmittel_request: { Args: { p_request_id: string; p_approve: boolean; p_note?: string | null }; Returns: string | null }
      can_self_register_schulung: { Args: { p_session_id: string }; Returns: boolean }
      decide_schulung_assignment: { Args: { p_assignment_id: string; p_approve: boolean; p_session_id?: string | null; p_note?: string | null }; Returns: string | null }
      strassenzustand_bericht_ersetzen: { Args: { p_bericht_id: string; p_anmerkung: string | null; p_zeilen: Record<string, unknown>[] }; Returns: undefined }
      ueberstunden_monatsanteile: { Args: { p_monat_start: string; p_monat_ende: string }; Returns: { meldung_id: string; beamter_id: string; verguetung: string; std_werktag_50: number; std_sonn_100: number; std_19_22: number; std_22_06: number; std_sonn_200: number }[] }
      genehmiger_kette: { Args: Record<PropertyKey, never>; Returns: { id: string; name: string; rang: number }[] }
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
