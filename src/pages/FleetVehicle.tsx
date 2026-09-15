import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bike, Car, ClipboardCheck, FileText, PackageCheck, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { canManageFuhrpark } from '../lib/fuhrpark'
import { supabase } from '../lib/supabase'
import type { FleetAppointment, FleetCareTask, FleetCheckItem, FleetCheckItemStatus, FleetEquipmentItem, FleetEquipmentStatus, FleetEquipmentStatusValue, FleetVehicle as FleetVehicleType, FleetVehicleKind, Profile, VehicleCheck, VehicleCheckStatus } from '../lib/types'
import { Actions, Empty, Modal, inputClass } from './fleetShared'

// Mängel, Pflege, Werkstatt & Termine, Fristen und Dokumente sind eigene,
// fahrzeugübergreifende Sidebar-Seiten (FleetMaengel/FleetPflege/
// FleetWerkstatt/FleetFristen/FleetDokumente.tsx) - hier nur noch die
// beiden Facetten, die untrennbar an "dieses eine Fahrzeug gerade vor mir"
// hängen: Fahrzeugkontrolle und Bestand & Füllliste.
type TabId = 'kontrolle' | 'fuellliste'
const TABS: { id: TabId; label: string; description: string; icon: typeof ClipboardCheck }[] = [
  { id: 'kontrolle', label: 'Fahrzeugkontrolle', description: 'Checkliste vor Dienstbeginn und letzte Kontrollen.', icon: ClipboardCheck },
  { id: 'fuellliste', label: 'Bestand & Füllliste', description: 'Sollbestand prüfen und Fehlmengen erfassen.', icon: PackageCheck },
]
const TONE = { blue: 'bg-blue-50 text-blue-700 border-blue-100' }
const STATUS_LABEL: Record<FleetEquipmentStatusValue, string> = { vollstaendig: 'Vollständig', fehlend: 'Fehlend', beschaedigt: 'Beschädigt', abgelaufen: 'Abgelaufen' }
const STATUS_COLOR: Record<FleetEquipmentStatusValue, string> = { vollstaendig: 'bg-green-100 text-green-800', fehlend: 'bg-red-100 text-red-800', beschaedigt: 'bg-amber-100 text-amber-800', abgelaufen: 'bg-orange-100 text-orange-800' }
const CHECK_STATUS_LABEL: Record<VehicleCheckStatus, string> = { ok: 'In Ordnung', mangel: 'Mangel' }
const CHECK_STATUS_COLOR: Record<VehicleCheckStatus, string> = { ok: 'bg-green-100 text-green-800', mangel: 'bg-amber-100 text-amber-800' }

function todayLocal() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleDateString('de-AT') : null }
function isTabId(value: string | null): value is TabId {
  return TABS.some(tab => tab.id === value)
}

export default function FleetVehicle() {
  const { vehicleId } = useParams()
  const navigate = useNavigate()
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const canManage = canManageFuhrpark({ isStrictAdmin, isGenehmiger, rows: areaRoles, operativeModeActive })
  const [searchParams] = useSearchParams()
  const [vehicle, setVehicle] = useState<FleetVehicleType | null>(null)
  const [employees, setEmployees] = useState<Pick<Profile, 'id' | 'name' | 'dienstnummer'>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<TabId>(isTabId(tabParam) ? tabParam : 'kontrolle')
  useEffect(() => {
    const next = searchParams.get('tab')
    if (isTabId(next)) setActiveTab(next)
  }, [searchParams, vehicleId])

  const [checks, setChecks] = useState<VehicleCheck[]>([])
  const [checkItems, setCheckItems] = useState<FleetCheckItem[]>([])
  const [checkItemStatuses, setCheckItemStatuses] = useState<FleetCheckItemStatus[]>([])
  const [items, setItems] = useState<FleetEquipmentItem[]>([])
  const [statuses, setStatuses] = useState<FleetEquipmentStatus[]>([])
  // careTasks/appointments werden hier nur noch für die "Offene Punkte"-
  // Kennzahlen geladen, die Verwaltung selbst läuft über die eigenen Seiten
  // FleetPflege/FleetWerkstatt/FleetFristen.tsx.
  const [careTasks, setCareTasks] = useState<FleetCareTask[]>([])
  const [appointments, setAppointments] = useState<FleetAppointment[]>([])

  const [name, setName] = useState('')
  const [kind, setKind] = useState<FleetVehicleKind>('Dienstfahrzeug')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [callSign, setCallSign] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [notes, setNotes] = useState('')
  const [responsibleUserId, setResponsibleUserId] = useState('')

  const canEditVehicle = canManage || (!!profile?.id && vehicle?.responsible_user_id === profile.id)

  const load = useCallback(async () => {
    if (!vehicleId) return
    setLoading(true)
    const [{ data, error: loadError }, employeeResult, checkResult, checkItemResult, checkStatusResult, itemResult, statusResult, careResult, appointmentResult] = await Promise.all([
      supabase.from('fleet_vehicles').select('*, responsible_profile:profiles!fleet_vehicles_responsible_user_id_fkey(id,name,dienstnummer)').eq('id', vehicleId).eq('active', true).maybeSingle(),
      canManage ? supabase.from('profiles').select('id,name,dienstnummer').eq('active', true).order('name') : Promise.resolve({ data: [], error: null }),
      supabase.from('vehicle_checks').select('*, checker:profiles!vehicle_checks_checked_by_fkey(id,name,dienstnummer)').eq('vehicle_id', vehicleId).order('duty_date', { ascending: false }).limit(20),
      supabase.from('fleet_check_items').select('*').eq('vehicle_id', vehicleId).eq('active', true).order('sort_order').order('name'),
      supabase.from('fleet_check_item_status').select('*, checker:profiles!fleet_check_item_status_checked_by_fkey(id,name,dienstnummer)').eq('vehicle_id', vehicleId),
      supabase.from('fleet_equipment_items').select('*').eq('vehicle_id', vehicleId).eq('active', true).order('sort_order').order('name'),
      supabase.from('fleet_equipment_status').select('*, checker:profiles!fleet_equipment_status_checked_by_fkey(id,name,dienstnummer)').eq('vehicle_id', vehicleId),
      supabase.from('fleet_care_tasks').select('*').eq('vehicle_id', vehicleId).eq('status', 'offen'),
      supabase.from('fleet_appointments').select('*').eq('vehicle_id', vehicleId).eq('status', 'offen'),
    ])
    setVehicle(loadError ? null : data as FleetVehicleType | null)
    setError(loadError ? 'Fahrzeug konnte nicht geladen werden.' : '')
    setEmployees((employeeResult.data ?? []) as Pick<Profile, 'id' | 'name' | 'dienstnummer'>[])
    setChecks((checkResult.data ?? []) as unknown as VehicleCheck[])
    setCheckItems((checkItemResult.data ?? []) as FleetCheckItem[])
    setCheckItemStatuses((checkStatusResult.data ?? []) as unknown as FleetCheckItemStatus[])
    setItems((itemResult.data ?? []) as FleetEquipmentItem[])
    setStatuses((statusResult.data ?? []) as unknown as FleetEquipmentStatus[])
    setCareTasks((careResult.data ?? []) as FleetCareTask[])
    setAppointments((appointmentResult.data ?? []) as FleetAppointment[])
    setLoading(false)
  }, [vehicleId, canManage])
  useEffect(() => { void load() }, [load])
  const checkStatusByItem = useMemo(() => new Map(checkItemStatuses.map(status => [status.item_id, status])), [checkItemStatuses])
  const statusByItem = useMemo(() => new Map(statuses.map(status => [status.item_id, status])), [statuses])
  const openDefects = useMemo(() => items.filter(item => statusByItem.get(item.id) && statusByItem.get(item.id)!.status !== 'vollstaendig'), [items, statusByItem])
  const workshopAppointments = useMemo(() => appointments.filter(item => item.category === 'werkstatt'), [appointments])
  const deadlines = useMemo(() => appointments.filter(item => item.category === 'frist'), [appointments])
  const openCareTasks = useMemo(() => careTasks.filter(task => task.status === 'offen'), [careTasks])
  const openWorkshop = useMemo(() => workshopAppointments.filter(item => item.status === 'offen'), [workshopAppointments])
  const openDeadlines = useMemo(() => deadlines.filter(item => item.status === 'offen'), [deadlines])
  const openPunkte = [
    { to: '/fuhrpark/maengel', label: 'Mängel', count: openDefects.length },
    { to: '/fuhrpark/pflege', label: 'Pflege', count: openCareTasks.length },
    { to: '/fuhrpark/werkstatt', label: 'Werkstatt', count: openWorkshop.length },
    { to: '/fuhrpark/fristen', label: 'Fristen', count: openDeadlines.length },
  ]
  const totalOpen = openPunkte.reduce((sum, item) => sum + item.count, 0)
  if (!hasAreaAccess('fuhrpark')) return <Navigate to="/" replace />

  function openEdit() {
    if (!vehicle) return
    setName(vehicle.name); setKind(vehicle.kind); setMake(vehicle.make ?? ''); setModel(vehicle.model ?? '')
    setCallSign(vehicle.call_sign ?? ''); setLicensePlate(vehicle.license_plate ?? ''); setNotes(vehicle.notes ?? '')
    setResponsibleUserId(vehicle.responsible_user_id ?? '')
    setError(''); setShowEdit(true)
  }
  async function saveVehicle() {
    if (!vehicle || !name.trim()) { setError('Bitte eine Bezeichnung eingeben.'); return }
    setSaving(true)
    const { error: updateError } = await supabase.from('fleet_vehicles').update({
      name: name.trim(), kind, make: make.trim() || null, model: model.trim() || null,
      call_sign: callSign.trim() || null, license_plate: licensePlate.trim().toUpperCase() || null, notes: notes.trim() || null,
      responsible_user_id: responsibleUserId || null,
    }).eq('id', vehicle.id)
    setSaving(false)
    if (updateError) { setError(updateError.message.includes('duplicate') ? 'Rufname oder Kennzeichen ist bereits vergeben.' : 'Fahrzeug konnte nicht gespeichert werden.'); return }
    logAudit('Fahrzeug bearbeitet', name.trim())
    setShowEdit(false)
    await load()
  }
  async function deleteVehicle() {
    if (!vehicle || !window.confirm(`Fahrzeug „${vehicle.name}“ endgültig löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.`)) return
    setSaving(true)
    const { error: deleteError } = await supabase.from('fleet_vehicles').delete().eq('id', vehicle.id)
    setSaving(false)
    if (deleteError) { setError('Fahrzeug konnte nicht gelöscht werden.'); return }
    logAudit('Fahrzeug endgültig gelöscht', vehicle.name)
    navigate('/fuhrpark', { replace: true })
  }

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
  if (!vehicle) return <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center"><h1 className="text-xl font-bold text-gray-900">Fahrzeug nicht gefunden</h1></div>

  const VehicleIcon = vehicle.kind === 'Motorrad' ? Bike : Car
  return <div>
    {error && !showEdit ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    <div className="flex items-center justify-between gap-3 mb-4"><div className="flex items-center gap-3 min-w-0"><div className="bg-blue-50 text-blue-700 p-2.5 rounded-xl flex-shrink-0"><VehicleIcon className="w-5 h-5" /></div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{vehicle.kind}</p><h1 className="text-xl font-bold text-gray-900 truncate">{vehicle.name}{vehicle.call_sign ? <span className="text-gray-400 font-normal"> · {vehicle.call_sign}</span> : null}</h1></div></div>{canManage ? <button type="button" onClick={openEdit} className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-50 flex-shrink-0"><Pencil className="w-4 h-4" /> Bearbeiten</button> : null}</div>

    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-4">
      <div className="px-5 py-3 border-b border-gray-100"><h2 className="text-sm font-semibold text-gray-900">Offene Punkte</h2></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100">
        {openPunkte.map(item => (
          <Link
            key={item.to}
            to={`${item.to}?vehicle=${vehicle.id}`}
            className="bg-white p-4 text-left hover:bg-gray-50 transition-colors"
          >
            <p className={`text-2xl font-bold ${item.count > 0 ? 'text-red-700' : 'text-gray-900'}`}>{item.count}</p>
            <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
          </Link>
        ))}
      </div>
      {totalOpen === 0 ? <p className="px-5 py-3 text-sm text-green-700 bg-green-50 border-t border-green-100">Alles erledigt.</p> : null}
    </section>

    <details className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-4 group">
      <summary className="px-5 py-3 cursor-pointer text-sm font-semibold text-gray-900 flex items-center justify-between">
        Fahrzeugdaten
        <span className="text-xs font-normal text-gray-400 group-open:hidden">anzeigen</span>
      </summary>
      <dl className="grid grid-cols-1 sm:grid-cols-4 gap-px bg-gray-100 border-t border-gray-100"><div className="bg-white p-4"><dt className="text-xs text-gray-500">Hersteller</dt><dd className="font-semibold text-gray-900 mt-1">{vehicle.make ?? 'Noch offen'}</dd></div><div className="bg-white p-4"><dt className="text-xs text-gray-500">Modell</dt><dd className="font-semibold text-gray-900 mt-1">{vehicle.model ?? 'Noch offen'}</dd></div><div className="bg-white p-4"><dt className="text-xs text-gray-500">Kennzeichen</dt><dd className="font-semibold text-gray-900 mt-1">{vehicle.license_plate ?? 'Noch offen'}</dd></div><div className="bg-white p-4"><dt className="text-xs text-gray-500">Fahrzeugverantwortlich</dt><dd className="font-semibold text-gray-900 mt-1">{vehicle.responsible_profile?.name ?? 'Nicht zugewiesen'}</dd></div></dl>
      {vehicle.notes ? <div className="p-4 border-t border-gray-100"><p className="text-xs text-gray-500">Bemerkungen</p><p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{vehicle.notes}</p></div> : null}
    </details>

    <div className="flex flex-wrap items-center gap-2 mb-4">
      <nav className="flex gap-1.5 overflow-x-auto pb-2" aria-label="Fahrzeugbezogene Bereiche">{TABS.map(tab => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex items-center gap-2 whitespace-nowrap border px-3 py-2 rounded-xl text-sm font-medium ${activeTab === tab.id ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}><Icon className="w-4 h-4" />{tab.label}</button> })}</nav>
      <Link to={`/fuhrpark/dokumente?vehicle=${vehicle.id}`} className="inline-flex items-center gap-2 whitespace-nowrap border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-xl text-sm font-medium mb-2"><FileText className="w-4 h-4" /> Dokumente</Link>
    </div>

    {activeTab === 'kontrolle' ? <KontrolleTab vehicleId={vehicle.id} checks={checks} checkItems={checkItems} checkStatusByItem={checkStatusByItem} canEdit={canEditVehicle} onSaved={(message) => { setNotice(message); void load() }} onError={setError} /> : null}
    {activeTab === 'fuellliste' ? <FuelllisteTab vehicleId={vehicle.id} items={items} statusByItem={statusByItem} canEdit={canEditVehicle} onSaved={(message) => { setNotice(message); void load() }} onError={setError} /> : null}

    {showEdit ? <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto"><div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b"><h2 className="font-bold text-gray-900">Fahrzeug bearbeiten</h2><button type="button" onClick={() => setShowEdit(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button></div><div className="px-5 sm:px-6 py-4 space-y-4"><label className="block text-xs font-medium text-gray-600">Bezeichnung *<input className={inputClass} maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Fahrzeugart<select className={inputClass} value={kind} onChange={event => setKind(event.target.value as FleetVehicleKind)}><option>Dienstfahrzeug</option><option>Motorrad</option></select></label><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><label className="block text-xs font-medium text-gray-600">Hersteller<input className={inputClass} maxLength={60} value={make} onChange={event => setMake(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Modell<input className={inputClass} maxLength={60} value={model} onChange={event => setModel(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Rufname<input className={inputClass} maxLength={80} value={callSign} onChange={event => setCallSign(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Kennzeichen<input className={inputClass} maxLength={20} value={licensePlate} onChange={event => setLicensePlate(event.target.value)} /></label></div><label className="block text-xs font-medium text-gray-600">Fahrzeugverantwortlicher Mitarbeiter<select className={inputClass} value={responsibleUserId} onChange={event => setResponsibleUserId(event.target.value)}><option value="">Noch nicht zugewiesen</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}{employee.dienstnummer ? ` · DN ${employee.dienstnummer}` : ''}</option>)}</select></label><label className="block text-xs font-medium text-gray-600">Bemerkungen<textarea className={`${inputClass} min-h-24 resize-y`} maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} /></label>{error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}</div><div className="flex flex-wrap gap-3 px-5 sm:px-6 py-4 border-t"><button type="button" disabled={saving} onClick={() => { void deleteVehicle() }} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50 disabled:opacity-60"><Trash2 className="w-4 h-4" /> Endgültig löschen</button><button type="button" onClick={() => setShowEdit(false)} className="border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg">Abbrechen</button><button type="button" disabled={saving} onClick={() => { void saveVehicle() }} className="bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-lg">{saving ? 'Speichern…' : 'Speichern'}</button></div></div></div> : null}
  </div>
}

function TabShell({ tone, title, description, action, children }: { tone: 'blue'; title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden"><div className={`px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3 ${TONE[tone]}`}><div><h2 className="font-semibold text-gray-900">{title}</h2><p className="text-sm text-gray-600 mt-0.5">{description}</p></div>{action}</div><div className="p-5">{children}</div></section>
}

// --- Fahrzeugkontrolle -------------------------------------------------
function KontrolleTab({ vehicleId, checks, checkItems, checkStatusByItem, canEdit, onSaved, onError }: { vehicleId: string; checks: VehicleCheck[]; checkItems: FleetCheckItem[]; checkStatusByItem: Map<string, FleetCheckItemStatus>; canEdit: boolean; onSaved: (message: string) => void; onError: (message: string) => void }) {
  const { profile } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [dutyDate, setDutyDate] = useState(todayLocal())
  const [shift, setShift] = useState<'tag' | 'nacht'>('tag')
  const [status, setStatus] = useState<VehicleCheckStatus>('ok')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  function openForm() { setDutyDate(todayLocal()); setShift('tag'); setStatus('ok'); setNote(''); setShowForm(true) }
  async function save() {
    if (!profile?.id) return
    setSaving(true)
    const { error } = await supabase.from('vehicle_checks').upsert(
      { vehicle_id: vehicleId, duty_date: dutyDate, shift, status, note: note.trim() || null, checked_by: profile.id },
      { onConflict: 'vehicle_id,duty_date,shift' },
    )
    setSaving(false)
    if (error) { onError('Die Kontrolle konnte nicht gespeichert werden.'); return }
    setShowForm(false); onSaved('Kontrolle wurde erfasst.')
  }

  return <div className="space-y-4">
    <TabShell tone="blue" title="Fahrzeugkontrolle" description="Gesamtergebnis vor Dienstbeginn und letzte Kontrollen." action={<button type="button" onClick={openForm} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Kontrolle erfassen</button>}>
      {checks.length === 0 ? <Empty text="Noch keine Kontrollen erfasst." /> : <div className="divide-y divide-gray-100">{checks.map(item => <div key={item.id} className="py-3 flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-gray-900">{formatDate(item.duty_date)} · {item.shift === 'tag' ? 'Tagdienst' : 'Nachtdienst'}</p><p className="text-xs text-gray-500 mt-0.5">{item.checker?.name ?? 'Unbekannt'}{item.note ? ` · ${item.note}` : ''}</p></div><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CHECK_STATUS_COLOR[item.status]}`}>{CHECK_STATUS_LABEL[item.status]}</span></div>)}</div>}
      {showForm ? <Modal title="Kontrolle erfassen" close={() => setShowForm(false)}>
        <div className="grid grid-cols-2 gap-3"><label className="block text-xs font-medium text-gray-600">Datum<input type="date" className={inputClass} value={dutyDate} onChange={event => setDutyDate(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Schicht<select className={inputClass} value={shift} onChange={event => setShift(event.target.value as 'tag' | 'nacht')}><option value="tag">Tagdienst</option><option value="nacht">Nachtdienst</option></select></label></div>
        <label className="block text-xs font-medium text-gray-600">Ergebnis<select className={inputClass} value={status} onChange={event => setStatus(event.target.value as VehicleCheckStatus)}><option value="ok">In Ordnung</option><option value="mangel">Mangel</option></select></label>
        <label className="block text-xs font-medium text-gray-600">Bemerkung<textarea className={`${inputClass} min-h-20 resize-y`} value={note} onChange={event => setNote(event.target.value)} /></label>
        <Actions saving={saving} close={() => setShowForm(false)} save={save} />
      </Modal> : null}
    </TabShell>
    <ChecklisteTab vehicleId={vehicleId} items={checkItems} statusByItem={checkStatusByItem} canEdit={canEdit} onSaved={onSaved} onError={onError} />
  </div>
}

// --- Fahrzeugcheck: Checkliste für den Fahrzeugzustand -------------------------------------------------
function ChecklisteTab({ vehicleId, items, statusByItem, canEdit, onSaved, onError }: { vehicleId: string; items: FleetCheckItem[]; statusByItem: Map<string, FleetCheckItemStatus>; canEdit: boolean; onSaved: (message: string) => void; onError: (message: string) => void }) {
  const { profile } = useAuth()
  const [showItemForm, setShowItemForm] = useState(false)
  const [itemName, setItemName] = useState('')
  const [checking, setChecking] = useState(false)
  const [draft, setDraft] = useState<Record<string, { status: VehicleCheckStatus; note: string }>>({})
  const [saving, setSaving] = useState(false)

  function openItemForm() { setItemName(''); setShowItemForm(true) }
  async function saveItem() {
    if (!profile?.id || !itemName.trim()) { onError('Bitte eine Bezeichnung angeben.'); return }
    setSaving(true)
    const { error } = await supabase.from('fleet_check_items').insert({ vehicle_id: vehicleId, name: itemName.trim(), created_by: profile.id })
    setSaving(false)
    if (error) { onError('Die Position konnte nicht angelegt werden.'); return }
    setShowItemForm(false); onSaved('Position wurde angelegt.')
  }
  async function removeItem(item: FleetCheckItem) {
    if (!window.confirm(`Position „${item.name}“ endgültig entfernen?`)) return
    const { error } = await supabase.from('fleet_check_items').update({ active: false }).eq('id', item.id)
    if (error) { onError('Die Position konnte nicht entfernt werden.'); return }
    onSaved('Position wurde entfernt.')
  }

  function startCheck() {
    const next: Record<string, { status: VehicleCheckStatus; note: string }> = {}
    for (const item of items) {
      const current = statusByItem.get(item.id)
      next[item.id] = { status: current?.status ?? 'ok', note: current?.note ?? '' }
    }
    setDraft(next); setChecking(true)
  }
  async function submitCheck() {
    if (!profile?.id) return
    setSaving(true)
    const rows = items.map(item => ({ item_id: item.id, vehicle_id: vehicleId, status: draft[item.id]?.status ?? 'ok', note: draft[item.id]?.note.trim() || null, checked_by: profile.id, checked_at: new Date().toISOString() }))
    const { error } = await supabase.from('fleet_check_item_status').upsert(rows, { onConflict: 'item_id' })
    setSaving(false)
    if (error) { onError('Die Kontrolle konnte nicht gespeichert werden.'); return }
    setChecking(false); onSaved('Checkliste wurde kontrolliert.')
  }

  return <TabShell tone="blue" title="Checkliste Fahrzeugzustand" description="Reifen, Beleuchtung, Ölstand, Sauberkeit und Ähnliches je Fahrzeug." action={<div className="flex gap-2">{canEdit ? <button type="button" onClick={openItemForm} className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Position</button> : null}{items.length > 0 ? <button type="button" onClick={startCheck} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><ClipboardCheck className="w-4 h-4" /> Kontrolle starten</button> : null}</div>}>
    {items.length === 0 ? <Empty text="Noch keine Positionen für die Checkliste hinterlegt." /> : <div className="divide-y divide-gray-100">{items.map(item => { const current = statusByItem.get(item.id); return <div key={item.id} className="py-3 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium text-gray-900">{item.name}</p><p className="text-xs text-gray-500 mt-0.5">{current ? `geprüft ${formatDate(current.checked_at)} von ${current.checker?.name ?? '–'}` : 'noch ungeprüft'}{current?.note ? ` · ${current.note}` : ''}</p></div><div className="flex items-center gap-2 flex-shrink-0">{current ? <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CHECK_STATUS_COLOR[current.status]}`}>{CHECK_STATUS_LABEL[current.status]}</span> : <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">Ungeprüft</span>}{canEdit ? <button type="button" onClick={() => void removeItem(item)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Position entfernen"><Trash2 className="w-3.5 h-3.5" /></button> : null}</div></div> })}</div>}

    {showItemForm ? <Modal title="Position anlegen" close={() => setShowItemForm(false)}>
      <label className="block text-xs font-medium text-gray-600">Bezeichnung *<input className={inputClass} value={itemName} onChange={event => setItemName(event.target.value)} placeholder="z. B. Reifen" /></label>
      <Actions saving={saving} close={() => setShowItemForm(false)} save={saveItem} />
    </Modal> : null}

    {checking ? <Modal title="Fahrzeugzustand kontrollieren" close={() => setChecking(false)} wide>
      <p className="text-sm text-gray-600">Jede Position prüfen und bei Bedarf anpassen, dann gesammelt speichern.</p>
      <div className="space-y-3">{items.map(item => <div key={item.id} className="rounded-xl border border-gray-200 p-3"><p className="text-sm font-semibold text-gray-900">{item.name}</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2"><label className="block text-xs font-medium text-gray-600">Ergebnis<select className={inputClass} value={draft[item.id]?.status ?? 'ok'} onChange={event => setDraft(current => ({ ...current, [item.id]: { ...current[item.id], status: event.target.value as VehicleCheckStatus } }))}><option value="ok">In Ordnung</option><option value="mangel">Mangel</option></select></label><label className="block text-xs font-medium text-gray-600">Bemerkung<input className={inputClass} value={draft[item.id]?.note ?? ''} onChange={event => setDraft(current => ({ ...current, [item.id]: { ...current[item.id], note: event.target.value } }))} /></label></div></div>)}</div>
      <Actions saving={saving} close={() => setChecking(false)} save={submitCheck} label="Kontrolle abschließen" />
    </Modal> : null}
  </TabShell>
}

// --- Bestand & Füllliste -------------------------------------------------
function FuelllisteTab({ vehicleId, items, statusByItem, canEdit, onSaved, onError }: { vehicleId: string; items: FleetEquipmentItem[]; statusByItem: Map<string, FleetEquipmentStatus>; canEdit: boolean; onSaved: (message: string) => void; onError: (message: string) => void }) {
  const { profile } = useAuth()
  const [showItemForm, setShowItemForm] = useState(false)
  const [itemName, setItemName] = useState('')
  const [sollMenge, setSollMenge] = useState('1')
  const [unit, setUnit] = useState('Stück')
  const [checking, setChecking] = useState(false)
  const [draft, setDraft] = useState<Record<string, { passt: boolean; reviewed: boolean; menge: string; status: FleetEquipmentStatusValue; note: string }>>({})
  const [saving, setSaving] = useState(false)
  const [checkError, setCheckError] = useState('')

  function openItemForm() { setItemName(''); setSollMenge('1'); setUnit('Stück'); setShowItemForm(true) }
  async function saveItem() {
    if (!profile?.id || !itemName.trim()) { onError('Bitte eine Bezeichnung angeben.'); return }
    setSaving(true)
    const { error } = await supabase.from('fleet_equipment_items').insert({ vehicle_id: vehicleId, name: itemName.trim(), soll_menge: Number(sollMenge) || 0, unit: unit.trim() || 'Stück', created_by: profile.id })
    setSaving(false)
    if (error) { onError('Die Position konnte nicht angelegt werden.'); return }
    setShowItemForm(false); onSaved('Position wurde angelegt.')
  }
  async function removeItem(item: FleetEquipmentItem) {
    if (!window.confirm(`Position „${item.name}“ endgültig entfernen?`)) return
    const { error } = await supabase.from('fleet_equipment_items').update({ active: false }).eq('id', item.id)
    if (error) { onError('Die Position konnte nicht entfernt werden.'); return }
    onSaved('Position wurde entfernt.')
  }

  // Checkliste: pro Position wird standardmäßig weder als "passt" noch als
  // "bestätigt" vorbelegt - jede Kontrolle verlangt eine aktive Bestätigung
  // JEDER Position, auch wenn schon eine bekannte Abweichung (ein
  // chronischer Mangel) vorbefüllt ist. Ohne dieses reviewed-Flag würde eine
  // vorbefüllte, aber unangetastete Abweichung die Validierung stillschweigend
  // passieren und checked_at/checked_by so überschreiben, als hätte die
  // aktuelle Person sie gerade tatsächlich geprüft - hat sie aber nicht.
  function startCheck() {
    const next: Record<string, { passt: boolean; reviewed: boolean; menge: string; status: FleetEquipmentStatusValue; note: string }> = {}
    for (const item of items) {
      const current = statusByItem.get(item.id)
      const bekannteAbweichung = current && current.status !== 'vollstaendig'
      next[item.id] = { passt: false, reviewed: false, menge: bekannteAbweichung ? String(current.ist_menge ?? '') : '', status: bekannteAbweichung ? current.status : 'fehlend', note: current?.note ?? '' }
    }
    setCheckError(''); setDraft(next); setChecking(true)
  }
  // Das Abhaken selbst ist die Bestätigung für "passt". Für eine Abweichung
  // reicht das Ausfüllen der Felder allein nicht (siehe oben) - dafür gibt es
  // die separate "geprüft und bestätigt"-Checkbox (toggleReviewed).
  function togglePasst(itemId: string, passt: boolean) {
    setDraft(current => ({ ...current, [itemId]: { ...current[itemId], passt, reviewed: passt || current[itemId]?.reviewed } }))
  }
  function toggleReviewed(itemId: string, reviewed: boolean) {
    setDraft(current => ({ ...current, [itemId]: { ...current[itemId], reviewed } }))
  }
  async function submitCheck() {
    if (!profile?.id) return
    const nichtBestaetigt = items.some(item => !draft[item.id]?.reviewed)
    if (nichtBestaetigt) { setCheckError('Bitte jede Position abhaken (passt) oder als geprüft bestätigen.'); return }
    const fehlendeAngabe = items.some(item => !draft[item.id]?.passt && !draft[item.id]?.menge.trim())
    if (fehlendeAngabe) { setCheckError('Bitte für jede nicht abgehakte Position die tatsächlich vorhandene Menge angeben.'); return }
    setCheckError(''); setSaving(true)
    const rows = items.map(item => {
      const d = draft[item.id]
      return d?.passt
        ? { item_id: item.id, vehicle_id: vehicleId, ist_menge: item.soll_menge, status: 'vollstaendig' as FleetEquipmentStatusValue, note: null, checked_by: profile.id, checked_at: new Date().toISOString() }
        : { item_id: item.id, vehicle_id: vehicleId, ist_menge: Number(d?.menge) || 0, status: d?.status ?? 'fehlend', note: d?.note.trim() || null, checked_by: profile.id, checked_at: new Date().toISOString() }
    })
    const { error } = await supabase.from('fleet_equipment_status').upsert(rows, { onConflict: 'item_id' })
    setSaving(false)
    if (error) { setCheckError('Die Kontrolle konnte nicht gespeichert werden.'); return }
    setChecking(false); onSaved('Bestand wurde kontrolliert.')
  }

  return <TabShell tone="blue" title="Bestand & Füllliste" description="Sollbestand prüfen und Fehlmengen erfassen." action={<div className="flex gap-2">{canEdit ? <button type="button" onClick={openItemForm} className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Position</button> : null}{items.length > 0 ? <button type="button" onClick={startCheck} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><ClipboardCheck className="w-4 h-4" /> Kontrolle starten</button> : null}</div>}>
    {items.length === 0 ? <Empty text="Noch keine Positionen für die Füllliste hinterlegt." /> : <div className="divide-y divide-gray-100">{items.map(item => { const current = statusByItem.get(item.id); return <div key={item.id} className="py-3 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium text-gray-900">{item.name}</p><p className="text-xs text-gray-500 mt-0.5">Soll: {item.soll_menge} {item.unit}{current ? ` · Ist: ${current.ist_menge ?? '–'} ${item.unit} · geprüft ${formatDate(current.checked_at)} von ${current.checker?.name ?? '–'}` : ' · noch ungeprüft'}{current?.note ? ` · ${current.note}` : ''}</p></div><div className="flex items-center gap-2 flex-shrink-0">{current ? <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[current.status]}`}>{STATUS_LABEL[current.status]}</span> : <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">Ungeprüft</span>}{canEdit ? <button type="button" onClick={() => void removeItem(item)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Position entfernen"><Trash2 className="w-3.5 h-3.5" /></button> : null}</div></div> })}</div>}

    {showItemForm ? <Modal title="Position anlegen" close={() => setShowItemForm(false)}>
      <label className="block text-xs font-medium text-gray-600">Bezeichnung *<input className={inputClass} value={itemName} onChange={event => setItemName(event.target.value)} placeholder="z. B. Verbandskasten" /></label>
      <div className="grid grid-cols-2 gap-3"><label className="block text-xs font-medium text-gray-600">Sollmenge<input type="number" min={0} className={inputClass} value={sollMenge} onChange={event => setSollMenge(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Einheit<input className={inputClass} value={unit} onChange={event => setUnit(event.target.value)} /></label></div>
      <Actions saving={saving} close={() => setShowItemForm(false)} save={saveItem} />
    </Modal> : null}

    {checking ? <Modal title="Bestand kontrollieren" close={() => setChecking(false)} wide>
      <p className="text-sm text-gray-600">Jede Position abhaken, wenn der Sollbestand passt. Passt er nicht, die tatsächlich vorhandene Menge eintragen und bestätigen.</p>
      <div className="space-y-3">{items.map(item => { const d = draft[item.id]; const passt = d?.passt ?? false; const reviewed = d?.reviewed ?? false; return <div key={item.id} className={`rounded-xl border p-3 ${passt ? 'border-green-200 bg-green-50' : reviewed ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-blue-700 focus:ring-blue-700" checked={passt} onChange={event => togglePasst(item.id, event.target.checked)} />
          <span className="flex-1 min-w-0"><span className="text-sm font-semibold text-gray-900 block">{item.name}</span><span className="text-xs text-gray-500">Soll: {item.soll_menge} {item.unit} {passt ? '· passt' : ''}</span></span>
        </label>
        {!passt ? <div className="pl-7">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
            <label className="block text-xs font-medium text-gray-600">Tatsächliche Menge *<input type="number" min={0} className={inputClass} value={d?.menge ?? ''} onChange={event => setDraft(current => ({ ...current, [item.id]: { ...current[item.id], menge: event.target.value } }))} /></label>
            <label className="block text-xs font-medium text-gray-600">Was ist der Fall?<select className={inputClass} value={d?.status ?? 'fehlend'} onChange={event => setDraft(current => ({ ...current, [item.id]: { ...current[item.id], status: event.target.value as FleetEquipmentStatusValue } }))}>{Object.entries(STATUS_LABEL).filter(([value]) => value !== 'vollstaendig').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="block text-xs font-medium text-gray-600">Bemerkung<input className={inputClass} value={d?.note ?? ''} onChange={event => setDraft(current => ({ ...current, [item.id]: { ...current[item.id], note: event.target.value } }))} /></label>
          </div>
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 flex-shrink-0 rounded border-gray-300 text-amber-700 focus:ring-amber-700" checked={reviewed} onChange={event => toggleReviewed(item.id, event.target.checked)} />
            <span className="text-xs font-medium text-gray-700">Angabe geprüft und bestätigt</span>
          </label>
        </div> : null}
      </div> })}</div>
      {checkError ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{checkError}</p> : null}
      <Actions saving={saving} close={() => setChecking(false)} save={submitCheck} label="Kontrolle abschließen" />
    </Modal> : null}
  </TabShell>
}

