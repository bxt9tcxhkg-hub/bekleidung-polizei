import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Building2,
  Car,
  ClipboardList,
  Clock3,
  Database,
  GraduationCap,
  Mail,
  Radio,
  Shield,
  Shirt,
  Sparkles,
  Target,
  UserRoundCheck,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import PortalChrome from '../components/PortalChrome'
import { OwnerNotifications } from '../components/MailDeliveries'
import {
  type PortalAdminId,
  visiblePortalAdminLinks,
} from '../lib/portalAccount'
import { canManageFuhrpark } from '../lib/fuhrpark'
import { canManagePersonalEinsatzmittel } from '../lib/personalEinsatzmittel'
import { canManageSchulungen } from '../lib/schulungen'
import { PORTAL_APPS, type PortalApp, type PortalAppId } from '../lib/portalApps'
import { visiblePortalApps } from '../lib/portalEntitlements'
import { supabase } from '../lib/supabase'
import type { DutyAssignment, DutyFunction, DutyFunctionConfig, DutyShift, FleetVehicle } from '../lib/types'

const DEFAULT_DUTY_LABEL: Record<string, string> = {
  zentrale: 'Zentrale',
  innendienst: 'Innendienst',
  jd: 'Journaldienst (JD)',
  vd: 'Verkehrsdienst (VD)',
}

function todayLocal() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const DUTY_PROMPT_DISMISS_PREFIX = 'dornbirn-portal-duty-prompt-dismissed'
function dutyPromptDismissedToday(userId: string): boolean {
  try { return localStorage.getItem(`${DUTY_PROMPT_DISMISS_PREFIX}:${userId}`) === todayLocal() } catch { return false }
}
function dismissDutyPromptToday(userId: string): void {
  try { localStorage.setItem(`${DUTY_PROMPT_DISMISS_PREFIX}:${userId}`, todayLocal()) } catch { /* ignore */ }
}

const APP_ICONS: Record<PortalAppId, LucideIcon> = {
  bekleidung: Shirt,
  einsatz_mt: Target,
}

const ADMIN_ICONS: Record<PortalAdminId, LucideIcon> = {
  auditlog: ClipboardList,
}

function AppTile({ app, badge }: { app: PortalApp; badge?: number }) {
  const Icon = APP_ICONS[app.id]
  if (app.status === 'coming_soon') {
    return (
      <div aria-disabled="true" className="rounded-xl border border-gray-200 bg-white p-5 opacity-60 cursor-not-allowed select-none">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="bg-gray-100 p-2.5 rounded-lg"><Icon className="w-5 h-5 text-gray-500" /></div>
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">folgt</span>
        </div>
        <h2 className="text-lg font-semibold text-gray-700">{app.title}</h2>
        {app.description ? <p className="text-sm text-gray-500 mt-1">{app.description}</p> : null}
      </div>
    )
  }
  return (
    <Link to={app.path} className="rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all block">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="bg-blue-50 p-2.5 rounded-lg"><Icon className="w-5 h-5 text-blue-700" /></div>
        {badge ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{badge} offen</span> : null}
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{app.title}</h2>
      {app.description ? <p className="text-sm text-gray-500 mt-1">{app.description}</p> : null}
    </Link>
  )
}

function PortalSection({ title, description, tone, children }: { title: string; description: string; tone: 'operativ' | 'organisation' | 'persoenlich'; children: React.ReactNode }) {
  const toneClass = tone === 'operativ'
    ? 'border-red-500 bg-red-50/60'
    : tone === 'organisation'
      ? 'border-blue-600 bg-blue-50/50'
      : 'border-emerald-600 bg-emerald-50/50'
  return (
    <section className={`rounded-2xl border-l-4 ${toneClass} p-4 sm:p-5 h-full`}>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-3">{children}</div>
    </section>
  )
}

function NavTile({ to, label, description, icon: Icon, badge }: { to: string; label: string; description: string; icon: LucideIcon; badge?: number }) {
  return (
    <Link to={to} className="rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all block">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="bg-blue-50 p-2.5 rounded-lg"><Icon className="w-5 h-5 text-blue-700" /></div>
        {badge ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{badge} offen</span> : null}
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{label}</h2>
      {description ? <p className="text-sm text-gray-500 mt-1">{description}</p> : null}
    </Link>
  )
}

const headerActionClass = 'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors'
