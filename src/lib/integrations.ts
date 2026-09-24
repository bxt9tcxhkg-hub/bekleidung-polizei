import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface PortalIntegrationSettings {
  id: 'outlook' | 'rainbow'
  outlook_source: 'postfach' | 'organisationskontakte' | null
  outlook_mailbox: string | null
  outlook_folder_id: string | null
  rainbow_called_number: string | null
  updated_by: string | null
  updated_at: string
}

export interface IntegrationOutlookContact {
  id: string
  source_key: string
  external_id: string
  name: string
  institution: string | null
  funktion: string | null
  telefon: string | null
  email: string | null
  synced_at: string
}

export interface IntegrationRainbowCall {
  id: string
  call_id: string
  rainbow_user_id: string
  caller_phone: string | null
  called_phone: string | null
  status: 'klingelt' | 'angenommen' | 'beendet'
  started_at: string
  updated_at: string
}

// Derselbe authentifizierte Client mit einem kleinen Schema für die neuen
// Integrationstabellen. Die große bestehende Datenbank-Typdatei überschreitet
// sonst bei Supabase-Abfragen die TypeScript-Rekursionstiefe.
type IntegrationDatabase = {
  public: {
    Tables: {
      portal_integration_settings: { Row: PortalIntegrationSettings; Insert: PortalIntegrationSettings; Update: Partial<PortalIntegrationSettings>; Relationships: [] }
      integration_outlook_contacts: { Row: IntegrationOutlookContact; Insert: IntegrationOutlookContact; Update: Partial<IntegrationOutlookContact>; Relationships: [] }
      integration_rainbow_calls: { Row: IntegrationRainbowCall; Insert: IntegrationRainbowCall; Update: Partial<IntegrationRainbowCall>; Relationships: [] }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export const integrationSupabase = supabase as unknown as SupabaseClient<IntegrationDatabase>
