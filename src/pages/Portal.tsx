import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2,
  Car,
  ClipboardList,
  Clock3,
  GraduationCap,
  LifeBuoy,
  Mail,
  Radio,
  Shield,
  Shirt,
  Target,
  UserRoundCheck,
  UserCircle,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import PortalChrome from '../components/PortalChrome'
import { OwnerNotifications } from '../components/MailDeliveries'
import {
  PORTAL_ACCOUNT_LINKS,
  type PortalAccountId,
  type PortalAccountLink,
  type PortalAdminId,
  type PortalAdminLink,
  visiblePortalAdminLinks,
} from '../lib/portalAccount'
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

// „Heute nicht operativ“ wird nur lokal je Gerät gemerkt (kein Zwangssystem, kein Datenbankeintrag nötig).
const DUTY_PROMPT_DISMISS_PREFIX = 'dornbirn-portal-duty-prompt-dismissed'
function dutyPromptDismissedToday(userId: string): boolean {
  try { return localStorage.getItem(`${DUTY_PROMPT_DISMISS_PREFIX}:${userId}`) === todayLocal() } catch { return false }
}
function dismissDutyPromptToday(userId: string): void {
  try { localStorage.setItem(`${DUTY_PROMPT_DISMISS_PREFIX}:${userId}`, todayLocal()) } catch { /* Storage evtl. gesperrt – kein Blocker */ }
}

const APP_ICONS: Record<PortalAppId, LucideIcon> = {
  bekleidung: Shirt,
  einsatz_mt: Target,
}

const ACCOUNT_ICONS: Record<PortalAccountId, LucideIcon> = {
  profil: UserCircle,
  hilfe: LifeBuoy,
}

const ADMIN_ICONS: Record<PortalAdminId, LucideIcon> = {
  auditlog: ClipboardList,
}

type PlannedPortalArea = {
  id: 'ueberstunden'
  title: string
  description: string
  path: string
  icon: LucideIcon
}

const PERSONAL_AREAS: PlannedPortalArea[] = [
  { id: 'ueberstunden', title: 'Überstundenmeldung', description: 'Überstunden erfassen und zur Prüfung abgeben', path: '/planung/ueberstunden', icon: Clock3 },
]

function AppTile({ app }: { app: PortalApp }) {
  const Icon = APP_ICONS[app.id]

  if (app.status === 'coming_soon') {
    return (
      <div
        aria-disabled="true"
        className="rounded-xl border border-gray-200 bg-white p-5 opacity-60 cursor-not-allowed select-none"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="bg-gray-100 p-2.5 rounded-lg">
            <Icon className="w-5 h-5 text-gray-500" />
          </div>
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
            folgt
          </span>
        </div>
        <h2 className="text-lg font-semibold text-gray-700">{app.title}</h2>
        {app.description ? (
          <p className="text-sm text-gray-500 mt-1">{app.description}</p>
        ) : null}
      </div>
    )
  }

  return (
    <Link
      to={app.path}
      className="rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all block"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="bg-blue-50 p-2.5 rounded-lg">
          <Icon className="w-5 h-5 text-blue-700" />
        </div>
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{app.title}</h2>
      {app.description ? (
        <p className="text-sm text-gray-500 mt-1">{app.description}</p>
      ) : null}
    </Link>
  )
}

function PlannedTile({ area, admin }: { area: PlannedPortalArea; admin: boolean }) {
  const Icon = area.icon
  const content = (
    <>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className={`p-2.5 rounded-lg ${admin ? 'bg-amber-50' : 'bg-gray-100'}`}>
          <Icon className={`w-5 h-5 ${admin ? 'text-amber-700' : 'text-gray-400'}`} />
        </div>
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">In Planung</span>
      </div>
      <h2 className={`text-lg font-semibold ${admin ? 'text-gray-900' : 'text-gray-500'}`}>{area.title}</h2>
      <p className="text-sm text-gray-500 mt-1">{area.description}</p>
      {admin ? <p className="text-xs font-medium text-amber-700 mt-3">Grundstruktur ansehen</p> : null}
    </>
  )

  if (admin) {
    return <Link to={area.path} className="rounded-xl border border-dashed border-amber-300 bg-white p-5 hover:border-amber-500 hover:shadow-sm transition-all block">{content}</Link>
  }
  return <div aria-disabled="true" title="In Planung" className="rounded-xl border border-gray-200 bg-gray-50 p-5 opacity-65 cursor-not-allowed select-none">{content}</div>
}

function PortalSection({
  title,
  description,
  tone,
  children,
}: {
  title: string
  description: string
  tone: 'operativ' | 'organisation' | 'persoenlich'
  children: React.ReactNode
}) {
  const toneClass = tone === 'operativ'
    ? 'border-red-500 bg-red-50/60'
    : tone === 'organisation'
      ? 'border-blue-600 bg-blue-50/50'
      : 'border-emerald-600 bg-emerald-50/50'
  return (
    <section className={`rounded-2xl border-l-4 ${toneClass} p-4 sm:p-5 mb-6`}>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </section>
  )
}

function NavTile({
  to,
  label,
  description,
  icon: Icon,
}: {
  to: string
  label: string
  description: string
  icon: LucideIcon
}) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all block"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="bg-blue-50 p-2.5 rounded-lg">
          <Icon className="w-5 h-5 text-blue-700" />
        </div>
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{label}</h2>
      {description ? (
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      ) : null}
    </Link>
  )
}

function AccountTile({ link }: { link: PortalAccountLink }) {
  return <NavTile to={link.to} label={link.label} description={link.description} icon={ACCOUNT_ICONS[link.id]} />
}

function AdminTile({ link }: { link: PortalAdminLink }) {
  return <NavTile to={link.to} label={link.label} description={link.description} icon={ADMIN_ICONS[link.id]} />
}

const headerActionClass =
  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors'

function TodayFunctionCard({ userId, canManage }: { userId: string; canManage: boolean }) {
  const navigate = useNavigate()
  const [allAssignments, setAllAssignments] = useState<DutyAssignment[]>([])
  const [functions, setFunctions] = useState<DutyFunctionConfig[]>([])
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [shift, setShift] = useState<DutyShift>('tag')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [managing, setManaging] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newPatrol, setNewPatrol] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [promptChecked, setPromptChecked] = useState(false)

  const load = useCallback(async () => {
    const [dutyResult, functionResult, vehicleResult] = await Promise.all([
      supabase.from('duty_assignments').select('*').eq('duty_date', todayLocal()),
      supabase.from('duty_functions').select('*').order('sort_order').order('label'),
      supabase.from('fleet_vehicles').select('*').eq('active', true).order('name'),
    ])
    setAllAssignments((dutyResult.data ?? []) as DutyAssignment[]); setFunctions((functionResult.data ?? []) as DutyFunctionConfig[]); setVehicles((vehicleResult.data ?? []) as FleetVehicle[])
  }, [])
  useEffect(() => { void load() }, [load])

  const ownAssignments = useMemo(() => allAssignments.filter(item => item.user_id === userId), [allAssignments, userId])
  const selected = ownAssignments.find(item => item.shift === shift)
  const selectedConfig = functions.find(item => item.code === selected?.function)
  useEffect(() => { setVehicleId(selected?.vehicle_id ?? '') }, [selected?.vehicle_id])

  // Beim ersten Öffnen an diesem Tag: Funktion abfragen, sofern noch keine Auswahl getroffen
  // und „Heute nicht operativ“ noch nicht gewählt wurde. Nicht blockierend – jederzeit schließbar.
  useEffect(() => {
    if (promptChecked || functions.length === 0) return
    setPromptChecked(true)
    if (ownAssignments.length === 0 && !dutyPromptDismissedToday(userId)) setPickerOpen(true)
  }, [functions.length, ownAssignments.length, promptChecked, userId])

  function occupancy(code: string) {
    const config = functions.find(item => item.code === code)
    return { count: allAssignments.filter(item => item.function === code && item.shift === shift).length, capacity: config?.standard_staffing ?? null }
  }

  async function choose(code: DutyFunction) {
    setSaving(true)
    const config = functions.find(item => item.code === code)
    const { error } = await supabase.from('duty_assignments').upsert({ user_id: userId, duty_date: todayLocal(), shift, function: code, vehicle_id: config?.is_patrol ? (vehicleId || null) : null }, { onConflict: 'user_id,duty_date,shift' })
    setSaving(false)
    if (error) { setMessage('Die Funktion konnte nicht gespeichert werden.'); return }
    setMessage(`${config?.label ?? DEFAULT_DUTY_LABEL[code] ?? code} wurde für heute eingetragen.`)
    setPickerOpen(false)
    await load()
    // Nach der Auswahl direkt ins passende Dienstcockpit.
    if (code === 'zentrale') navigate('/zentrale')
    else if (code === 'innendienst') navigate('/innendienst')
    else if (config?.is_patrol || code === 'jd' || code === 'vd') navigate('/aussendienst')
  }
  function notOperational() { dismissDutyPromptToday(userId); setPickerOpen(false) }
  async function remove() {
    if (!selected) return
    setSaving(true); const { error } = await supabase.from('duty_assignments').delete().eq('id', selected.id); setSaving(false)
    if (error) { setMessage('Die Auswahl konnte nicht entfernt werden.'); return }
    setMessage('Die Auswahl wurde entfernt. Das Portal bleibt normal nutzbar.'); await load()
  }
  async function setVehicle(id: string) {
    setVehicleId(id)
    if (!selected) return
    setSaving(true); const { error } = await supabase.from('duty_assignments').update({ vehicle_id: id || null }).eq('id', selected.id); setSaving(false)
    if (error) { setMessage('Das Fahrzeug konnte nicht gespeichert werden.'); return }
    await load()
  }

  async function addFunction() {
    const label = newLabel.trim(); if (!label) return
    const code = `${label.toLocaleLowerCase('de-AT').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}_${Date.now().toString().slice(-5)}`
    const { error } = await supabase.from('duty_functions').insert({ code, label, is_patrol: newPatrol, sort_order: functions.length * 10 + 10 })
    if (error) { setMessage('Der Dienst konnte nicht angelegt werden.'); return }
    setNewLabel(''); setNewPatrol(false); await load()
  }
  async function deleteFunction(item: DutyFunctionConfig) {
    if (item.code === 'zentrale') { setMessage('Der Grunddienst Zentrale kann nicht gelöscht werden.'); return }
    if (!window.confirm(`Dienst „${item.label}“ endgültig löschen? Historische Einteilungen bleiben erhalten.`)) return
    const { error } = await supabase.from('duty_functions').delete().eq('code', item.code)
    if (error) { setMessage('Der Dienst konnte nicht gelöscht werden.'); return }
    await load()
  }

  return <>
    <section className="rounded-2xl border border-blue-200 bg-white p-4 sm:p-5 mb-6 shadow-sm"><div className="flex items-start gap-3"><div className="bg-blue-50 p-2.5 rounded-xl"><UserRoundCheck className="w-5 h-5 text-blue-700" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold text-gray-900">Heutige Funktion</h2><p className="text-sm text-gray-500 mt-0.5">{selected ? `${selectedConfig?.label ?? selected.function} · ${shift === 'tag' ? 'Tagdienst' : 'Nachtdienst'}` : 'Noch nicht ausgewählt – freiwillig für passende Informationen und Aufträge.'}</p></div><div className="flex flex-wrap items-center gap-2"><select className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs" value={shift} onChange={event => setShift(event.target.value as DutyShift)} aria-label="Schicht"><option value="tag">Tagdienst</option><option value="nacht">Nachtdienst</option></select><button type="button" onClick={() => setPickerOpen(true)} className="text-sm font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full">{selected ? 'Wechseln' : 'Funktion wählen'}</button>{selected ? <button type="button" disabled={saving} onClick={() => void remove()} className="text-xs font-semibold text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg">Dienst beenden</button> : null}{canManage ? <button type="button" onClick={() => setManaging(value => !value)} className="text-xs font-semibold text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg">Dienste verwalten</button> : null}</div></div>{selectedConfig?.is_patrol ? <select className="mt-3 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" value={vehicleId} onChange={event => void setVehicle(event.target.value)} aria-label="Streifenfahrzeug"><option value="">Kein Fahrzeug zugewiesen</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.call_sign || vehicle.name}{vehicle.license_plate ? ` · ${vehicle.license_plate}` : ''}</option>)}</select> : null}{managing ? <div className="mt-4 border-t border-gray-200 pt-4"><div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2"><input className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Neuer Dienst" value={newLabel} onChange={event => setNewLabel(event.target.value)} /><label className="flex items-center gap-2 text-sm border border-gray-200 rounded-lg px-3 py-2"><input type="checkbox" checked={newPatrol} onChange={event => setNewPatrol(event.target.checked)} /> Streife</label><button type="button" onClick={() => void addFunction()} className="bg-gray-900 text-white text-sm font-medium px-3 py-2 rounded-lg">Anlegen</button></div><div className="flex flex-wrap gap-2 mt-3">{functions.map(item => <span key={item.code} className="inline-flex items-center gap-2 bg-gray-100 text-sm px-3 py-1.5 rounded-full">{item.label}{item.is_patrol ? ' · Streife' : ''}{item.code === 'zentrale' ? <span className="text-xs text-gray-500">Grunddienst</span> : <button type="button" onClick={() => void deleteFunction(item)} className="text-red-600" aria-label={`${item.label} löschen`}>×</button>}</span>)}</div></div> : null}{message ? <p className={`text-sm mt-3 ${message.includes('konnte nicht') ? 'text-red-700' : 'text-green-700'}`}>{message}</p> : null}</div></div></section>
    {pickerOpen ? <DutyPickerModal functions={functions.filter(item => item.active)} occupancy={occupancy} saving={saving} onChoose={code => void choose(code)} onNotOperational={notOperational} onClose={() => setPickerOpen(false)} /> : null}
  </>
}

function DutyPickerModal({ functions, occupancy, saving, onChoose, onNotOperational, onClose }: { functions: DutyFunctionConfig[]; occupancy: (code: string) => { count: number; capacity: number | null }; saving: boolean; onChoose: (code: DutyFunction) => void; onNotOperational: () => void; onClose: () => void }) {
  return <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
      <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b">
        <div><h2 className="font-bold text-gray-900">Welche Funktion hast du heute?</h2><p className="text-xs text-gray-500 mt-0.5">Freiwillige Auswahl – bereits besetzte Funktionen werden angezeigt, aber nicht blockiert.</p></div>
        <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button>
      </div>
      <div className="px-5 py-4 space-y-2">
        {functions.map(fn => {
          const { count, capacity } = occupancy(fn.code)
          return <button key={fn.code} type="button" disabled={saving} onClick={() => onChoose(fn.code)} className="w-full flex items-center justify-between gap-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 px-4 py-3 text-left disabled:opacity-60">
            <span className="font-medium text-gray-900">{fn.label}</span>
            <span className="text-xs text-gray-500 whitespace-nowrap">{capacity !== null ? `${count} von ${capacity} Plätzen besetzt` : `${count} eingetragen`}</span>
          </button>
        })}
        <button type="button" onClick={onNotOperational} className="w-full rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 mt-2">Heute nicht operativ</button>
      </div>
    </div>
  </div>
}

export default function Portal() {
  const { profile, isAdmin, isStrictAdmin, isGenehmiger, areaRoles, hasAreaAccess } = useAuth()
  const apps = visiblePortalApps(PORTAL_APPS, { isStrictAdmin, rows: areaRoles })
  const adminLinks = visiblePortalAdminLinks(isAdmin)
  const canManageDuties = isStrictAdmin || (areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []).some(role => ['sachbearbeiter', 'admin'].includes(role))

  return (
    <PortalChrome
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
          <img
            src="/wappen-dornbirn.svg"
            alt="Wappen der Stadt Dornbirn"
            className="h-full w-auto"
          />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Stadtpolizei Dornbirn</h1>
        <p className="text-gray-500 text-sm mt-1">Portal</p>
        {profile?.name ? (
          <p className="text-gray-400 text-xs mt-1 sm:hidden">{profile.name}</p>
        ) : null}
      </div>

      {profile?.id && hasAreaAccess('zentrale') ? <TodayFunctionCard userId={profile.id} canManage={canManageDuties} /> : null}
      {profile?.id && hasAreaAccess('zentrale') ? <div className="mb-6"><OwnerNotifications userId={profile.id} /></div> : null}

      <PortalSection title="Operativer Bereich" description="Interne Unterstützung für die tägliche Dienstabwicklung" tone="operativ">
        {hasAreaAccess('zentrale') ? (
          <NavTile to="/zentrale" label="Zentrale" description="Operative Lage, Aufträge, Alarmierung und Schichtübergabe" icon={Radio} />
        ) : null}
        {hasAreaAccess('zentrale') ? (
          <NavTile to="/aussendienst" label="Außendienst / Streife" description="Meine Streife, Fahrzeugcheck, Kontrollaufträge und RSa/RSb" icon={Shield} />
        ) : null}
        {hasAreaAccess('zentrale') ? (
          <NavTile to="/innendienst" label="Innendienst" description="Kasse, Bescheide, Verstöße, RSa/RSb und Übergabe" icon={Building2} />
        ) : null}
        {hasAreaAccess('zentrale') ? (
          <NavTile to="/rsa-rsb" label="RSa/RSb & Vernehmungen" description="Schwer erreichbare Personen – jederzeit erfassbar, unabhängig vom heutigen Dienst" icon={Mail} />
        ) : null}
      </PortalSection>

      <PortalSection title="Organisatorische Angelegenheiten" description="Verwaltung, Ausstattung, Ausbildung und Fuhrpark" tone="organisation">
        {apps.map(app => <AppTile key={app.id} app={app} />)}
        {hasAreaAccess('schulungen') ? (
          <NavTile to="/schulungen" label="Schulungen" description="PAD, weitere Schulungen und Rechtsinformationen" icon={GraduationCap} />
        ) : null}
        {hasAreaAccess('fuhrpark') ? (
          <NavTile to="/fuhrpark" label="Fuhrpark & Fahrzeuge" description="Fahrzeuge, Stammdaten und fahrzeugbezogene Aufgaben" icon={Car} />
        ) : null}
      </PortalSection>

      <PortalSection title="Mein Bereich" description="Persönliche Meldungen und Anträge" tone="persoenlich">
        {PERSONAL_AREAS.map(area => <PlannedTile key={area.id} area={area} admin={isAdmin} />)}
      </PortalSection>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 pt-8 border-t border-gray-200">
        {adminLinks.map(link => (
          <AdminTile key={link.id} link={link} />
        ))}
        {PORTAL_ACCOUNT_LINKS.map(link => (
          <AccountTile key={link.id} link={link} />
        ))}
      </div>
    </PortalChrome>
  )
}
