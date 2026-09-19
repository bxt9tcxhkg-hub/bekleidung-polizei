import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import PortalChrome from '../components/PortalChrome'
import { OwnerNotifications } from '../components/MailDeliveries'
import { type PortalAdminId, visiblePortalAdminLinks } from '../lib/portalAccount'
import { canManageFuhrpark } from '../lib/fuhrpark'
import { canManagePersonalEinsatzmittel } from '../lib/personalEinsatzmittel'
import { canManageSchulungen } from '../lib/schulungen'
import { PORTAL_APPS, type PortalApp, type PortalAppId } from '../lib/portalApps'
import { visiblePortalApps } from '../lib/portalEntitlements'
import { supabase } from '../lib/supabase'
import { MyVehicleCard, TodayFunctionCard } from './portalDuty'

const APP_ICONS: Record<PortalAppId, LucideIcon> = {
  bekleidung: Shirt,
  einsatz_mt: Target,
}

const ADMIN_ICONS: Record<PortalAdminId, LucideIcon> = {
  auditlog: ClipboardList,
}

const headerActionClass = 'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors'

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

export default function Portal() {
  const { profile, isAdmin, isStrictAdmin, isGenehmiger, isGenehmigerEntitlement, areaRoles, hasAreaAccess, operativeModeActive, setOperativeModeActive } = useAuth()
  const apps = visiblePortalApps(PORTAL_APPS, { isStrictAdmin, isGenehmiger: isGenehmigerEntitlement, rows: areaRoles })
  const adminLinks = visiblePortalAdminLinks(isAdmin)
  const zentraleManagerRole = (areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []).some(role => ['sachbearbeiter', 'admin'].includes(role))
  const rawCanManageZentrale = isStrictAdmin || isGenehmigerEntitlement || zentraleManagerRole
  const rawCanManageFuhrpark = canManageFuhrpark({ isStrictAdmin, isGenehmiger: isGenehmigerEntitlement, rows: areaRoles })
  const rawCanManageEinsatzmittel = canManagePersonalEinsatzmittel({ isStrictAdmin, isGenehmiger: isGenehmigerEntitlement, rows: areaRoles })
  const rawCanManageSchulungen = canManageSchulungen({ isStrictAdmin, isGenehmiger: isGenehmigerEntitlement, rows: areaRoles })
  const canManageDuties = isStrictAdmin || isGenehmiger || (operativeModeActive && zentraleManagerRole)
  const [openCounts, setOpenCounts] = useState<{ zentrale?: number; fuhrpark?: number; einsatz_mt?: number; schulungen?: number }>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      const next: { zentrale?: number; fuhrpark?: number; einsatz_mt?: number; schulungen?: number } = {}
      await Promise.all([
        rawCanManageZentrale
          ? Promise.all([
              supabase.from('zentrale_entries').select('id', { count: 'exact', head: true }).eq('priority', 'kritisch').neq('status', 'erledigt'),
              supabase.from('zentrale_av_bv').select('id', { count: 'exact', head: true }).eq('priority', 'kritisch').eq('status', 'offen'),
              supabase.from('zentrale_fahndungen').select('id', { count: 'exact', head: true }).eq('priority', 'kritisch').eq('status', 'offen'),
            ]).then(([entries, avBv, fahndungen]) => { next.zentrale = (entries.count ?? 0) + (avBv.count ?? 0) + (fahndungen.count ?? 0) })
          : Promise.resolve(),
        rawCanManageFuhrpark ? supabase.from('fleet_equipment_status').select('vehicle_id').neq('status', 'vollstaendig').then(({ data }) => { next.fuhrpark = new Set((data ?? []).map(row => row.vehicle_id)).size }) : Promise.resolve(),
        rawCanManageEinsatzmittel
          ? Promise.all([
              supabase.from('personal_einsatzmittel_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
              supabase.from('pool_einsatzmittel_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
            ]).then(([personal, pool]) => { next.einsatz_mt = (personal.count ?? 0) + (pool.count ?? 0) })
          : Promise.resolve(),
        rawCanManageSchulungen
          ? supabase.from('schulungen_assignments').select('id', { count: 'exact', head: true }).eq('status', 'vorschlag').then(({ count }) => { next.schulungen = count ?? 0 })
          : Promise.resolve(),
      ])
      if (!cancelled) setOpenCounts(next)
    }
    void load()
    return () => { cancelled = true }
  }, [rawCanManageZentrale, rawCanManageFuhrpark, rawCanManageEinsatzmittel, rawCanManageSchulungen])

  const totalOpenTasks = Object.values(openCounts).reduce((sum: number, value) => sum + (value ?? 0), 0)

  return (
    <PortalChrome
      wide
      actions={
        <>
          {adminLinks.map(link => {
            const Icon = ADMIN_ICONS[link.id]
            return (
              <Link key={link.id} to={link.to} className={headerActionClass}>
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            )
          })}
          {isGenehmiger ? (
            <Link to="/portal/benutzer" className={headerActionClass}>
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Benutzer</span>
            </Link>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col items-center text-center mb-8">
        <div className="mb-4 h-16 w-16 rounded-xl bg-white p-1 flex items-center justify-center border border-gray-200">
          <img src="/wappen-dornbirn.svg" alt="Wappen der Stadt Dornbirn" className="h-full w-auto" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Stadtpolizei Dornbirn</h1>
        <p className="text-gray-500 text-sm mt-1">Portal</p>
        {profile?.name ? <p className="text-gray-400 text-xs mt-1 sm:hidden">{profile.name}</p> : null}
      </div>

      {totalOpenTasks > 0 ? (
        <section className={`rounded-2xl border p-4 sm:p-5 mb-6 flex flex-wrap items-center justify-between gap-3 ${operativeModeActive ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
          <div className="flex items-center gap-3">
            <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${operativeModeActive ? 'text-amber-700' : 'text-blue-700'}`} />
            <p className="text-sm font-medium text-gray-800">{totalOpenTasks} offene {totalOpenTasks === 1 ? 'Aufgabe' : 'Aufgaben'} aus deiner Sachbearbeiter-/Genehmiger-Tätigkeit.</p>
          </div>
          {!operativeModeActive ? (
            <button type="button" onClick={() => setOperativeModeActive(true)} className="text-sm font-semibold text-blue-800 bg-white border border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-50 flex-shrink-0">Jetzt bearbeiten</button>
          ) : null}
        </section>
      ) : null}

      {profile?.id && hasAreaAccess('zentrale') ? <TodayFunctionCard userId={profile.id} canManage={canManageDuties} /> : null}
      {profile?.id && hasAreaAccess('zentrale') ? <div className="mb-6"><OwnerNotifications userId={profile.id} /></div> : null}
      {profile?.id ? <MyVehicleCard userId={profile.id} /> : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <PortalSection title="Operativer Bereich" description="Interne Unterstützung für die tägliche Dienstabwicklung" tone="operativ">
          {/* Zentrale/Außendienst/Innendienst hängen noch am Bereich "zentrale" -
              die tagesfunktionsbasierte Zugriffssteuerung (nur die heute
              zugeteilte Funktion sichtbar, Admin sieht immer alle drei) folgt
              in einer eigenen, weiteren Migration. */}
          {hasAreaAccess('zentrale') ? <NavTile to="/zentrale" label="Zentrale" description="Operative Lage, Aufträge, Alarmierung und Schichtübergabe" icon={Radio} /> : null}
          {hasAreaAccess('zentrale') ? <NavTile to="/aussendienst" label="Außendienst / Streife" description="Meine Streife, Fahrzeugcheck und Kontrollaufträge" icon={Shield} /> : null}
          {hasAreaAccess('zentrale') ? <NavTile to="/innendienst" label="Innendienst" description="Kasse, Bescheide, Verstöße und Übergabe" icon={Building2} /> : null}
        </PortalSection>

        <PortalSection title="Organisatorische Angelegenheiten" description="Verwaltung, Ausstattung, Ausbildung, Fuhrpark und Datenpflege" tone="organisation">
          {hasAreaAccess('zentrale') || hasAreaAccess('datenpflege') ? (
            <NavTile
              to="/stammdaten"
              label="Stammdaten & Nachschlagewerke"
              description={isStrictAdmin || hasAreaAccess('datenpflege') ? 'Schlüssel, Kontakte, Fahndungen und Objekte pflegen' : 'Schlüssel, Kontakte, Personen und Objekte nachschlagen'}
              icon={Database}
            />
          ) : null}
          <NavTile to="/rsa-rsb" label="RSa/RSb & Vernehmungen" description="Schwer erreichbare Personen – für jeden Benutzer jederzeit erfassbar" icon={Mail} />
          {apps.map(app => <AppTile key={app.id} app={app} />)}
          {hasAreaAccess('schulungen') ? <NavTile to="/schulungen" label="Schulungen" description="PAD, weitere Schulungen und Rechtsinformationen" icon={GraduationCap} /> : null}
          {hasAreaAccess('fuhrpark') ? <NavTile to="/fuhrpark" label="Fuhrpark & Fahrzeuge" description="Fahrzeuge, Stammdaten und fahrzeugbezogene Aufgaben" icon={Car} /> : null}
        </PortalSection>

        <PortalSection title="Mein Bereich" description="Persönliche Meldungen und Anträge" tone="persoenlich">
          <NavTile to="/ueberstunden" label="Überstundenmeldung" description="Überstunden erfassen und zur Prüfung abgeben" icon={Clock3} />
        </PortalSection>
      </div>
    </PortalChrome>
  )
}
