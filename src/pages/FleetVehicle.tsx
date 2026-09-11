import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Bike, CalendarDays, Car, CheckCircle2, ClipboardCheck, Download, FileText, PackageCheck, Pencil, Plus, Sparkles, Trash2, Upload, Wrench, X } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import PortalChrome from '../components/PortalChrome'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import type { FleetAppointment, FleetAppointmentCategory, FleetCareTask, FleetCareTaskKind, FleetDocument, FleetEquipmentItem, FleetEquipmentStatus, FleetEquipmentStatusValue, FleetVehicle as FleetVehicleType, FleetVehicleKind, Profile, VehicleCheck, VehicleCheckStatus } from '../lib/types'

const MAX_DOCUMENT_FILE_SIZE = 100_000_000

type TabId = 'kontrolle' | 'fuellliste' | 'maengel' | 'pflege' | 'werkstatt' | 'fristen' | 'dokumente'
const TABS: { id: TabId; label: string; description: string; icon: typeof ClipboardCheck; tone: 'blue' | 'amber' | 'emerald' | 'slate' }[] = [
  { id: 'kontrolle', label: 'Fahrzeugkontrolle', description: 'Checkliste vor Dienstbeginn und letzte Kontrollen.', icon: ClipboardCheck, tone: 'blue' },
  { id: 'fuellliste', label: 'Bestand & Füllliste', description: 'Sollbestand prüfen und Fehlmengen erfassen.', icon: PackageCheck, tone: 'blue' },
  { id: 'maengel', label: 'Offene Mängel', description: 'Fehlende, beschädigte oder abgelaufene Ausstattung.', icon: AlertTriangle, tone: 'amber' },
  { id: 'pflege', label: 'Reinigung & Pflege', description: 'Reinigung und offene Pflegeaufgaben.', icon: Sparkles, tone: 'emerald' },
  { id: 'werkstatt', label: 'Werkstatt & Termine', description: 'Wartungen und Reparaturen.', icon: Wrench, tone: 'slate' },
  { id: 'fristen', label: 'Fristen', description: 'Prüfungen und fahrzeugbezogene Termine.', icon: CalendarDays, tone: 'slate' },
  { id: 'dokumente', label: 'Dokumente', description: 'Zulassung, Serviceheft und weitere fahrzeugbezogene Unterlagen.', icon: FileText, tone: 'slate' },
]
const TONE = { blue: 'bg-blue-50 text-blue-700 border-blue-100', amber: 'bg-amber-50 text-amber-700 border-amber-100', emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100', slate: 'bg-slate-50 text-slate-700 border-slate-200' }
const STATUS_LABEL: Record<FleetEquipmentStatusValue, string> = { vollstaendig: 'Vollständig', fehlend: 'Fehlend', beschaedigt: 'Beschädigt', abgelaufen: 'Abgelaufen' }
const STATUS_COLOR: Record<FleetEquipmentStatusValue, string> = { vollstaendig: 'bg-green-100 text-green-800', fehlend: 'bg-red-100 text-red-800', beschaedigt: 'bg-amber-100 text-amber-800', abgelaufen: 'bg-orange-100 text-orange-800' }
const CARE_KIND_LABEL: Record<FleetCareTaskKind, string> = { innenreinigung: 'Innenreinigung', aussenreinigung: 'Außenreinigung', pflege: 'Pflege', sonstiges: 'Sonstiges' }
const inputClass = 'mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function todayLocal() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleDateString('de-AT') : null }
function formatBytes(size: number | null) {
  if (size == null) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export default function FleetVehicle() {
  const { vehicleId } = useParams()
  const navigate = useNavigate()
  const { profile, hasAreaAccess, isStrictAdmin, areaRoles } = useAuth()
  const roles = areaRoles?.find(row => row.area === 'fuhrpark')?.roles ?? []
  const canManage = isStrictAdmin || roles.includes('sachbearbeiter') || roles.includes('admin')
  const [vehicle, setVehicle] = useState<FleetVehicleType | null>(null)
  const [employees, setEmployees] = useState<Pick<Profile, 'id' | 'name' | 'dienstnummer'>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('kontrolle')

  const [checks, setChecks] = useState<VehicleCheck[]>([])
  const [items, setItems] = useState<FleetEquipmentItem[]>([])
  const [statuses, setStatuses] = useState<FleetEquipmentStatus[]>([])
  const [careTasks, setCareTasks] = useState<FleetCareTask[]>([])
  const [appointments, setAppointments] = useState<FleetAppointment[]>([])
  const [documents, setDocuments] = useState<FleetDocument[]>([])

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
    const [{ data, error: loadError }, employeeResult, checkResult, itemResult, statusResult, careResult, appointmentResult, documentResult] = await Promise.all([
      supabase.from('fleet_vehicles').select('*, responsible_profile:profiles!fleet_vehicles_responsible_user_id_fkey(id,name,dienstnummer)').eq('id', vehicleId).eq('active', true).maybeSingle(),
      canManage ? supabase.from('profiles').select('id,name,dienstnummer').eq('active', true).order('name') : Promise.resolve({ data: [], error: null }),
      supabase.from('vehicle_checks').select('*, checker:profiles!vehicle_checks_checked_by_fkey(id,name,dienstnummer)').eq('vehicle_id', vehicleId).order('duty_date', { ascending: false }).limit(20),
      supabase.from('fleet_equipment_items').select('*').eq('vehicle_id', vehicleId).eq('active', true).order('sort_order').order('name'),
      supabase.from('fleet_equipment_status').select('*, checker:profiles!fleet_equipment_status_checked_by_fkey(id,name,dienstnummer)').eq('vehicle_id', vehicleId),
      supabase.from('fleet_care_tasks').select('*').eq('vehicle_id', vehicleId).order('status').order('created_at', { ascending: false }),
      supabase.from('fleet_appointments').select('*').eq('vehicle_id', vehicleId).order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('fleet_documents').select('*, uploader:profiles!fleet_documents_uploaded_by_fkey(id,name,dienstnummer)').eq('vehicle_id', vehicleId).order('created_at', { ascending: false }),
    ])
    setVehicle(loadError ? null : data as FleetVehicleType | null)
    setError(loadError ? 'Fahrzeug konnte nicht geladen werden.' : '')
    setEmployees((employeeResult.data ?? []) as Pick<Profile, 'id' | 'name' | 'dienstnummer'>[])
    setChecks((checkResult.data ?? []) as unknown as VehicleCheck[])
    setItems((itemResult.data ?? []) as FleetEquipmentItem[])
    setStatuses((statusResult.data ?? []) as unknown as FleetEquipmentStatus[])
    setCareTasks((careResult.data ?? []) as FleetCareTask[])
    setAppointments((appointmentResult.data ?? []) as FleetAppointment[])
    setDocuments((documentResult.data ?? []) as unknown as FleetDocument[])
    setLoading(false)
  }, [vehicleId, canManage])
  useEffect(() => { void load() }, [load])
  const statusByItem = useMemo(() => new Map(statuses.map(status => [status.item_id, status])), [statuses])
  const openDefects = useMemo(() => items.filter(item => statusByItem.get(item.id) && statusByItem.get(item.id)!.status !== 'vollstaendig'), [items, statusByItem])
  const workshopAppointments = useMemo(() => appointments.filter(item => item.category === 'werkstatt'), [appointments])
  const deadlines = useMemo(() => appointments.filter(item => item.category === 'frist'), [appointments])
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

  if (loading) return <PortalChrome><div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div></PortalChrome>
  if (!vehicle) return <PortalChrome><Link to="/fuhrpark" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 mb-6"><ArrowLeft className="w-4 h-4" /> Zur Fahrzeugübersicht</Link><div className="bg-white border border-gray-200 rounded-2xl p-8 text-center"><h1 className="text-xl font-bold text-gray-900">Fahrzeug nicht gefunden</h1></div></PortalChrome>

  const VehicleIcon = vehicle.kind === 'Motorrad' ? Bike : Car
  return <PortalChrome wide>
    <div className="flex items-center justify-between gap-3 mb-6"><Link to="/fuhrpark" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Zur Fahrzeugübersicht</Link>{canManage ? <button type="button" onClick={openEdit} className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-50"><Pencil className="w-4 h-4" /> Bearbeiten</button> : null}</div>
    {error && !showEdit ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden"><div className="p-5 sm:p-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-start gap-4"><div className="bg-blue-50 text-blue-700 p-3 rounded-xl w-fit"><VehicleIcon className="w-7 h-7" /></div><div className="flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{vehicle.kind}</p><h1 className="text-2xl font-bold text-gray-900 mt-1">{vehicle.name}</h1><p className="text-sm text-gray-500 mt-1">{vehicle.call_sign ?? 'Rufname noch offen'}</p></div>{openDefects.length > 0 ? <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-red-100 text-red-800">{openDefects.length} offene{openDefects.length === 1 ? 'r' : ''} Mangel{openDefects.length === 1 ? '' : 'e'}</span> : null}</div><dl className="grid grid-cols-1 sm:grid-cols-4 gap-px bg-gray-200"><div className="bg-white p-4"><dt className="text-xs text-gray-500">Hersteller</dt><dd className="font-semibold text-gray-900 mt-1">{vehicle.make ?? 'Noch offen'}</dd></div><div className="bg-white p-4"><dt className="text-xs text-gray-500">Modell</dt><dd className="font-semibold text-gray-900 mt-1">{vehicle.model ?? 'Noch offen'}</dd></div><div className="bg-white p-4"><dt className="text-xs text-gray-500">Kennzeichen</dt><dd className="font-semibold text-gray-900 mt-1">{vehicle.license_plate ?? 'Noch offen'}</dd></div><div className="bg-white p-4"><dt className="text-xs text-gray-500">Fahrzeugverantwortlich</dt><dd className="font-semibold text-gray-900 mt-1">{vehicle.responsible_profile?.name ?? 'Nicht zugewiesen'}</dd></div></dl>{vehicle.notes ? <div className="p-4 border-t border-gray-200"><p className="text-xs text-gray-500">Bemerkungen</p><p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{vehicle.notes}</p></div> : null}</section>

    <nav className="flex gap-1.5 overflow-x-auto pb-2 mt-6 mb-4" aria-label="Fahrzeugbezogene Bereiche">{TABS.map(tab => { const Icon = tab.icon; const badge = tab.id === 'maengel' ? openDefects.length : tab.id === 'pflege' ? careTasks.filter(task => task.status === 'offen').length : tab.id === 'werkstatt' ? workshopAppointments.filter(item => item.status === 'offen').length : tab.id === 'fristen' ? deadlines.filter(item => item.status === 'offen').length : 0; return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex items-center gap-2 whitespace-nowrap border px-3 py-2 rounded-xl text-sm font-medium ${activeTab === tab.id ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}><Icon className="w-4 h-4" />{tab.label}{badge > 0 ? <span className="bg-red-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{badge}</span> : null}</button> })}</nav>

    {activeTab === 'kontrolle' ? <KontrolleTab vehicleId={vehicle.id} checks={checks} onSaved={(message) => { setNotice(message); void load() }} onError={setError} /> : null}
    {activeTab === 'fuellliste' ? <FuelllisteTab vehicleId={vehicle.id} items={items} statusByItem={statusByItem} canEdit={canEditVehicle} onSaved={(message) => { setNotice(message); void load() }} onError={setError} /> : null}
    {activeTab === 'maengel' ? <MaengelTab items={openDefects} statusByItem={statusByItem} onSaved={(message) => { setNotice(message); void load() }} onError={setError} /> : null}
    {activeTab === 'pflege' ? <PflegeTab vehicleId={vehicle.id} tasks={careTasks} canDelete={canEditVehicle} onSaved={(message) => { setNotice(message); void load() }} onError={setError} /> : null}
    {activeTab === 'werkstatt' ? <TerminTab vehicleId={vehicle.id} category="werkstatt" title="Werkstatt & Termine" appointments={workshopAppointments} canEdit={canEditVehicle} onSaved={(message) => { setNotice(message); void load() }} onError={setError} /> : null}
    {activeTab === 'fristen' ? <TerminTab vehicleId={vehicle.id} category="frist" title="Fristen" appointments={deadlines} canEdit={canEditVehicle} onSaved={(message) => { setNotice(message); void load() }} onError={setError} /> : null}
    {activeTab === 'dokumente' ? <DokumenteTab vehicleId={vehicle.id} documents={documents} canEdit={canEditVehicle} onSaved={(message) => { setNotice(message); void load() }} onError={setError} /> : null}

    {showEdit ? <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto"><div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b"><h2 className="font-bold text-gray-900">Fahrzeug bearbeiten</h2><button type="button" onClick={() => setShowEdit(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button></div><div className="px-5 sm:px-6 py-4 space-y-4"><label className="block text-xs font-medium text-gray-600">Bezeichnung *<input className={inputClass} maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Fahrzeugart<select className={inputClass} value={kind} onChange={event => setKind(event.target.value as FleetVehicleKind)}><option>Dienstfahrzeug</option><option>Motorrad</option></select></label><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><label className="block text-xs font-medium text-gray-600">Hersteller<input className={inputClass} maxLength={60} value={make} onChange={event => setMake(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Modell<input className={inputClass} maxLength={60} value={model} onChange={event => setModel(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Rufname<input className={inputClass} maxLength={80} value={callSign} onChange={event => setCallSign(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Kennzeichen<input className={inputClass} maxLength={20} value={licensePlate} onChange={event => setLicensePlate(event.target.value)} /></label></div><label className="block text-xs font-medium text-gray-600">Fahrzeugverantwortlicher Mitarbeiter<select className={inputClass} value={responsibleUserId} onChange={event => setResponsibleUserId(event.target.value)}><option value="">Noch nicht zugewiesen</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}{employee.dienstnummer ? ` · DN ${employee.dienstnummer}` : ''}</option>)}</select></label><label className="block text-xs font-medium text-gray-600">Bemerkungen<textarea className={`${inputClass} min-h-24 resize-y`} maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} /></label>{error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}</div><div className="flex flex-wrap gap-3 px-5 sm:px-6 py-4 border-t"><button type="button" disabled={saving} onClick={() => { void deleteVehicle() }} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50 disabled:opacity-60"><Trash2 className="w-4 h-4" /> Endgültig löschen</button><button type="button" onClick={() => setShowEdit(false)} className="border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg">Abbrechen</button><button type="button" disabled={saving} onClick={() => { void saveVehicle() }} className="bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-lg">{saving ? 'Speichern…' : 'Speichern'}</button></div></div></div> : null}
  </PortalChrome>
}

function TabShell({ tone, title, description, action, children }: { tone: 'blue' | 'amber' | 'emerald' | 'slate'; title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden"><div className={`px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3 ${TONE[tone]}`}><div><h2 className="font-semibold text-gray-900">{title}</h2><p className="text-sm text-gray-600 mt-0.5">{description}</p></div>{action}</div><div className="p-5">{children}</div></section>
}
function Empty({ text }: { text: string }) { return <div className="py-8 text-center"><CheckCircle2 className="w-7 h-7 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{text}</p></div> }

// --- Fahrzeugkontrolle -------------------------------------------------
function KontrolleTab({ vehicleId, checks, onSaved, onError }: { vehicleId: string; checks: VehicleCheck[]; onSaved: (message: string) => void; onError: (message: string) => void }) {
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

  return <TabShell tone="blue" title="Fahrzeugkontrolle" description="Checkliste vor Dienstbeginn und letzte Kontrollen." action={<button type="button" onClick={openForm} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Kontrolle erfassen</button>}>
    {checks.length === 0 ? <Empty text="Noch keine Kontrollen erfasst." /> : <div className="divide-y divide-gray-100">{checks.map(item => <div key={item.id} className="py-3 flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-gray-900">{formatDate(item.duty_date)} · {item.shift === 'tag' ? 'Tagdienst' : 'Nachtdienst'}</p><p className="text-xs text-gray-500 mt-0.5">{item.checker?.name ?? 'Unbekannt'}{item.note ? ` · ${item.note}` : ''}</p></div><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${item.status === 'ok' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{item.status === 'ok' ? 'In Ordnung' : 'Mangel'}</span></div>)}</div>}
    {showForm ? <Modal title="Kontrolle erfassen" close={() => setShowForm(false)}>
      <div className="grid grid-cols-2 gap-3"><label className="block text-xs font-medium text-gray-600">Datum<input type="date" className={inputClass} value={dutyDate} onChange={event => setDutyDate(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Schicht<select className={inputClass} value={shift} onChange={event => setShift(event.target.value as 'tag' | 'nacht')}><option value="tag">Tagdienst</option><option value="nacht">Nachtdienst</option></select></label></div>
      <label className="block text-xs font-medium text-gray-600">Ergebnis<select className={inputClass} value={status} onChange={event => setStatus(event.target.value as VehicleCheckStatus)}><option value="ok">In Ordnung</option><option value="mangel">Mangel</option></select></label>
      <label className="block text-xs font-medium text-gray-600">Bemerkung<textarea className={`${inputClass} min-h-20 resize-y`} value={note} onChange={event => setNote(event.target.value)} /></label>
      <Actions saving={saving} close={() => setShowForm(false)} save={save} />
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
  const [draft, setDraft] = useState<Record<string, { menge: string; status: FleetEquipmentStatusValue; note: string }>>({})
  const [saving, setSaving] = useState(false)

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

  function startCheck() {
    const next: Record<string, { menge: string; status: FleetEquipmentStatusValue; note: string }> = {}
    for (const item of items) {
      const current = statusByItem.get(item.id)
      next[item.id] = { menge: String(current?.ist_menge ?? item.soll_menge), status: current?.status ?? 'vollstaendig', note: current?.note ?? '' }
    }
    setDraft(next); setChecking(true)
  }
  async function submitCheck() {
    if (!profile?.id) return
    setSaving(true)
    const rows = items.map(item => ({ item_id: item.id, vehicle_id: vehicleId, ist_menge: Number(draft[item.id]?.menge) || 0, status: draft[item.id]?.status ?? 'vollstaendig', note: draft[item.id]?.note.trim() || null, checked_by: profile.id, checked_at: new Date().toISOString() }))
    const { error } = await supabase.from('fleet_equipment_status').upsert(rows, { onConflict: 'item_id' })
    setSaving(false)
    if (error) { onError('Die Kontrolle konnte nicht gespeichert werden.'); return }
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
      <p className="text-sm text-gray-600">Jede Position prüfen und bei Bedarf anpassen, dann gesammelt speichern.</p>
      <div className="space-y-3">{items.map(item => <div key={item.id} className="rounded-xl border border-gray-200 p-3"><p className="text-sm font-semibold text-gray-900">{item.name} <span className="text-xs font-normal text-gray-500">(Soll {item.soll_menge} {item.unit})</span></p><div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2"><label className="block text-xs font-medium text-gray-600">Ist-Menge<input type="number" min={0} className={inputClass} value={draft[item.id]?.menge ?? ''} onChange={event => setDraft(current => ({ ...current, [item.id]: { ...current[item.id], menge: event.target.value } }))} /></label><label className="block text-xs font-medium text-gray-600">Status<select className={inputClass} value={draft[item.id]?.status ?? 'vollstaendig'} onChange={event => setDraft(current => ({ ...current, [item.id]: { ...current[item.id], status: event.target.value as FleetEquipmentStatusValue } }))}>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="block text-xs font-medium text-gray-600">Bemerkung<input className={inputClass} value={draft[item.id]?.note ?? ''} onChange={event => setDraft(current => ({ ...current, [item.id]: { ...current[item.id], note: event.target.value } }))} /></label></div></div>)}</div>
      <Actions saving={saving} close={() => setChecking(false)} save={submitCheck} label="Kontrolle abschließen" />
    </Modal> : null}
  </TabShell>
}

// --- Offene Mängel -------------------------------------------------
function MaengelTab({ items, statusByItem, onSaved, onError }: { items: FleetEquipmentItem[]; statusByItem: Map<string, FleetEquipmentStatus>; onSaved: (message: string) => void; onError: (message: string) => void }) {
  const { profile } = useAuth()
  const [busyId, setBusyId] = useState<string | null>(null)
  async function resolve(item: FleetEquipmentItem) {
    if (!profile?.id) return
    setBusyId(item.id)
    const { error } = await supabase.from('fleet_equipment_status').upsert(
      { item_id: item.id, vehicle_id: item.vehicle_id, ist_menge: item.soll_menge, status: 'vollstaendig', note: null, checked_by: profile.id, checked_at: new Date().toISOString() },
      { onConflict: 'item_id' },
    )
    setBusyId(null)
    if (error) { onError('Konnte nicht als behoben bestätigt werden.'); return }
    onSaved(`„${item.name}“ wurde als behoben bestätigt.`)
  }
  return <TabShell tone="amber" title="Offene Mängel" description="Fehlende, beschädigte oder abgelaufene Ausstattung dieses Fahrzeugs.">
    {items.length === 0 ? <Empty text="Keine offenen Mängel." /> : <div className="divide-y divide-gray-100">{items.map(item => { const status = statusByItem.get(item.id)!; return <div key={item.id} className="py-3 flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-gray-900">{item.name}</p><p className="text-xs text-gray-500 mt-0.5"><span className={`font-semibold ${STATUS_COLOR[status.status]} px-2 py-0.5 rounded-full`}>{STATUS_LABEL[status.status]}</span> · Ist {status.ist_menge ?? '–'} / Soll {item.soll_menge} {item.unit}{status.note ? ` · ${status.note}` : ''}</p></div><button type="button" disabled={busyId === item.id} onClick={() => void resolve(item)} className="text-xs font-semibold border border-green-300 text-green-800 bg-green-50 px-3 py-1.5 rounded-lg disabled:opacity-40">Behoben bestätigen</button></div> })}</div>}
  </TabShell>
}

// --- Reinigung & Pflege -------------------------------------------------
function PflegeTab({ vehicleId, tasks, canDelete, onSaved, onError }: { vehicleId: string; tasks: FleetCareTask[]; canDelete: boolean; onSaved: (message: string) => void; onError: (message: string) => void }) {
  const { profile } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [kind, setKind] = useState<FleetCareTaskKind>('sonstiges')
  const [subject, setSubject] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  function openForm() { setKind('sonstiges'); setSubject(''); setNote(''); setShowForm(true) }
  async function save() {
    if (!profile?.id || !subject.trim()) { onError('Bitte einen Betreff angeben.'); return }
    setSaving(true)
    const { error } = await supabase.from('fleet_care_tasks').insert({ vehicle_id: vehicleId, kind, subject: subject.trim(), note: note.trim() || null, created_by: profile.id })
    setSaving(false)
    if (error) { onError('Die Aufgabe konnte nicht angelegt werden.'); return }
    setShowForm(false); onSaved('Aufgabe wurde erfasst.')
  }
  async function resolve(task: FleetCareTask) {
    if (!profile?.id) return
    const { error } = await supabase.from('fleet_care_tasks').update({ status: 'erledigt', resolved_by: profile.id, resolved_at: new Date().toISOString() }).eq('id', task.id)
    if (error) { onError('Konnte nicht als erledigt markiert werden.'); return }
    onSaved('Aufgabe wurde als erledigt markiert.')
  }
  async function remove(task: FleetCareTask) {
    if (!window.confirm(`Aufgabe „${task.subject}“ endgültig löschen?`)) return
    const { error } = await supabase.from('fleet_care_tasks').delete().eq('id', task.id)
    if (error) { onError('Die Aufgabe konnte nicht gelöscht werden.'); return }
    onSaved('Aufgabe wurde gelöscht.')
  }

  return <TabShell tone="emerald" title="Reinigung & Pflege" description="Reinigung und offene Pflegeaufgaben." action={<button type="button" onClick={openForm} className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Aufgabe</button>}>
    {tasks.length === 0 ? <Empty text="Keine Reinigungs- oder Pflegeaufgaben erfasst." /> : <div className="divide-y divide-gray-100">{tasks.map(task => <div key={task.id} className="py-3 flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{CARE_KIND_LABEL[task.kind]}</span><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${task.status === 'offen' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>{task.status === 'offen' ? 'Offen' : 'Erledigt'}</span></div><p className="text-sm font-medium text-gray-900 mt-1">{task.subject}</p>{task.note ? <p className="text-xs text-gray-500 mt-0.5">{task.note}</p> : null}</div><div className="flex gap-1 flex-shrink-0">{task.status === 'offen' ? <button type="button" onClick={() => void resolve(task)} className="text-xs font-medium text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg">Erledigt</button> : null}{canDelete ? <button type="button" onClick={() => void remove(task)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Aufgabe löschen"><Trash2 className="w-4 h-4" /></button> : null}</div></div>)}</div>}
    {showForm ? <Modal title="Pflegeaufgabe erfassen" close={() => setShowForm(false)}>
      <label className="block text-xs font-medium text-gray-600">Art<select className={inputClass} value={kind} onChange={event => setKind(event.target.value as FleetCareTaskKind)}>{Object.entries(CARE_KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-xs font-medium text-gray-600">Betreff *<input className={inputClass} value={subject} onChange={event => setSubject(event.target.value)} /></label>
      <label className="block text-xs font-medium text-gray-600">Bemerkung<textarea className={`${inputClass} min-h-20 resize-y`} value={note} onChange={event => setNote(event.target.value)} /></label>
      <Actions saving={saving} close={() => setShowForm(false)} save={save} />
    </Modal> : null}
  </TabShell>
}

// --- Werkstatt & Termine / Fristen -------------------------------------------------
function TerminTab({ vehicleId, category, title, appointments, canEdit, onSaved, onError }: { vehicleId: string; category: FleetAppointmentCategory; title: string; appointments: FleetAppointment[]; canEdit: boolean; onSaved: (message: string) => void; onError: (message: string) => void }) {
  const { profile } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [subject, setSubject] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const today = todayLocal()

  function openForm() { setSubject(''); setDueDate(''); setNote(''); setShowForm(true) }
  async function save() {
    if (!profile?.id || !subject.trim()) { onError('Bitte einen Betreff angeben.'); return }
    setSaving(true)
    const { error } = await supabase.from('fleet_appointments').insert({ vehicle_id: vehicleId, category, subject: subject.trim(), due_date: dueDate || null, note: note.trim() || null, created_by: profile.id })
    setSaving(false)
    if (error) { onError('Der Termin konnte nicht angelegt werden.'); return }
    setShowForm(false); onSaved('Termin wurde erfasst.')
  }
  async function setStatus(item: FleetAppointment, status: 'erledigt' | 'storniert' | 'offen') {
    if (!profile?.id) return
    const { error } = await supabase.from('fleet_appointments').update({ status, resolved_by: status === 'offen' ? null : profile.id, resolved_at: status === 'offen' ? null : new Date().toISOString() }).eq('id', item.id)
    if (error) { onError('Der Status konnte nicht geändert werden.'); return }
    onSaved('Termin wurde aktualisiert.')
  }
  async function remove(item: FleetAppointment) {
    if (!window.confirm(`Termin „${item.subject}“ endgültig löschen?`)) return
    const { error } = await supabase.from('fleet_appointments').delete().eq('id', item.id)
    if (error) { onError('Der Termin konnte nicht gelöscht werden.'); return }
    onSaved('Termin wurde gelöscht.')
  }

  return <TabShell tone="slate" title={title} description={category === 'werkstatt' ? 'Wartungen und Reparaturen.' : 'Prüfungen und fahrzeugbezogene Termine.'} action={canEdit ? <button type="button" onClick={openForm} className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Termin</button> : undefined}>
    {appointments.length === 0 ? <Empty text="Keine Einträge vorhanden." /> : <div className="divide-y divide-gray-100">{appointments.map(item => { const overdue = item.status === 'offen' && !!item.due_date && item.due_date < today; return <div key={item.id} className="py-3 flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.status === 'erledigt' ? 'bg-green-100 text-green-800' : item.status === 'storniert' ? 'bg-gray-100 text-gray-600' : overdue ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{item.status === 'erledigt' ? 'Erledigt' : item.status === 'storniert' ? 'Storniert' : overdue ? 'Überfällig' : 'Offen'}</span>{item.due_date ? <span className="text-xs text-gray-500">{formatDate(item.due_date)}</span> : null}</div><p className="text-sm font-medium text-gray-900 mt-1">{item.subject}</p>{item.note ? <p className="text-xs text-gray-500 mt-0.5">{item.note}</p> : null}</div>{canEdit ? <div className="flex gap-1 flex-shrink-0">{item.status !== 'erledigt' ? <button type="button" onClick={() => void setStatus(item, 'erledigt')} className="text-xs font-medium text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg">Erledigt</button> : <button type="button" onClick={() => void setStatus(item, 'offen')} className="text-xs font-medium text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg">Wieder öffnen</button>}<button type="button" onClick={() => void remove(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Termin löschen"><Trash2 className="w-4 h-4" /></button></div> : null}</div> })}</div>}
    {showForm ? <Modal title={`${title.replace(' & Termine', '')} erfassen`} close={() => setShowForm(false)}>
      <label className="block text-xs font-medium text-gray-600">Betreff *<input className={inputClass} value={subject} onChange={event => setSubject(event.target.value)} placeholder={category === 'werkstatt' ? 'z. B. Ölwechsel' : 'z. B. §57a-Überprüfung'} /></label>
      <label className="block text-xs font-medium text-gray-600">Termin / Frist<input type="date" className={inputClass} value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
      <label className="block text-xs font-medium text-gray-600">Bemerkung<textarea className={`${inputClass} min-h-20 resize-y`} value={note} onChange={event => setNote(event.target.value)} /></label>
      <Actions saving={saving} close={() => setShowForm(false)} save={save} />
    </Modal> : null}
  </TabShell>
}

// --- Dokumente -------------------------------------------------
function DokumenteTab({ vehicleId, documents, canEdit, onSaved, onError }: { vehicleId: string; documents: FleetDocument[]; canEdit: boolean; onSaved: (message: string) => void; onError: (message: string) => void }) {
  const { profile } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function openForm() { setTitle(''); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; setShowForm(true) }

  async function save() {
    if (!profile?.id || !title.trim()) { onError('Bitte einen Titel angeben.'); return }
    if (!file) { onError('Bitte eine Datei auswählen.'); return }
    if (file.size > MAX_DOCUMENT_FILE_SIZE) { onError('Datei zu groß (max. 100 MB).'); return }
    setSaving(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const response = await fetch('/fleet-document-upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`,
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Size': String(file.size),
          'X-File-Name': encodeURIComponent(file.name),
          'X-Vehicle-Id': vehicleId,
        },
        body: file,
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(data?.error || 'Datei konnte nicht hochgeladen werden.')
      }
      const uploaded = await response.json() as { key: string; name: string; size: number; type: string }
      const { error } = await supabase.from('fleet_documents').insert({
        vehicle_id: vehicleId,
        title: title.trim(),
        file_key: uploaded.key,
        file_name: uploaded.name,
        mime_type: uploaded.type || null,
        file_size: uploaded.size,
        uploaded_by: profile.id,
      })
      if (error) throw error
      logAudit('Fahrzeugdokument hochgeladen', title.trim())
      setShowForm(false)
      onSaved('Dokument wurde gespeichert.')
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : 'Dokument konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  async function openDocument(doc: FleetDocument) {
    const { data: sessionData } = await supabase.auth.getSession()
    try {
      const response = await fetch(`/files/${doc.file_key}`, {
        headers: { Authorization: `Bearer ${sessionData.session?.access_token ?? ''}` },
      })
      if (!response.ok) throw new Error()
      const blobUrl = URL.createObjectURL(await response.blob())
      window.open(blobUrl, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch {
      onError('Dokument konnte nicht geöffnet werden.')
    }
  }

  async function remove(doc: FleetDocument) {
    if (!window.confirm(`Dokument „${doc.title}“ endgültig löschen?`)) return
    const { data: sessionData } = await supabase.auth.getSession()
    const response = await fetch('/fleet-document-delete', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`,
        'X-Document-Id': doc.id,
      },
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: string } | null
      onError(data?.error || 'Dokument konnte nicht gelöscht werden.')
      return
    }
    logAudit('Fahrzeugdokument gelöscht', doc.title)
    onSaved('Dokument wurde gelöscht.')
  }

  return <TabShell tone="slate" title="Dokumente" description="Zulassung, Serviceheft und weitere fahrzeugbezogene Unterlagen." action={canEdit ? <button type="button" onClick={openForm} className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-3 py-2 rounded-lg"><Upload className="w-4 h-4" /> Dokument</button> : undefined}>
    {documents.length === 0 ? <Empty text="Noch keine Dokumente hinterlegt." /> : <div className="divide-y divide-gray-100">{documents.map(doc => {
      const size = formatBytes(doc.file_size)
      const meta = [doc.uploader?.name, formatDate(doc.created_at), size].filter(Boolean).join(' · ')
      return <div key={doc.id} className="py-3 flex items-center justify-between gap-3">
        <button type="button" onClick={() => void openDocument(doc)} className="flex items-center gap-3 min-w-0 text-left group">
          <span className="bg-gray-100 text-gray-600 p-2 rounded-lg flex-shrink-0"><FileText className="w-4 h-4" /></span>
          <span className="min-w-0"><span className="block text-sm font-medium text-gray-900 group-hover:text-blue-700 truncate">{doc.title}</span>{meta ? <span className="block text-xs text-gray-500 mt-0.5 truncate">{meta}</span> : null}</span>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button" onClick={() => void openDocument(doc)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" aria-label="Dokument öffnen"><Download className="w-4 h-4" /></button>
          {canEdit ? <button type="button" onClick={() => void remove(doc)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Dokument löschen"><Trash2 className="w-4 h-4" /></button> : null}
        </div>
      </div>
    })}</div>}
    {showForm ? <Modal title="Dokument hochladen" close={() => setShowForm(false)}>
      <label className="block text-xs font-medium text-gray-600">Titel *<input className={inputClass} maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder="z. B. Zulassungsschein" /></label>
      <label className="block text-xs font-medium text-gray-600">Datei * (PDF, Word, JPG oder PNG, max. 100 MB)<input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className={inputClass} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
      <Actions saving={saving} close={() => setShowForm(false)} save={save} label="Hochladen" />
    </Modal> : null}
  </TabShell>
}

// --- Geteilte kleine Bausteine -------------------------------------------------
function Modal({ title, close, wide, children }: { title: string; close: () => void; wide?: boolean; children: React.ReactNode }) {
  return <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"><div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[94vh] overflow-y-auto`}><div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 sm:px-6 py-4 border-b"><h2 className="font-bold text-gray-900">{title}</h2><button type="button" onClick={close} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button></div><div className="px-5 sm:px-6 py-4 space-y-4">{children}</div></div></div>
}
function Actions({ saving, close, save, label }: { saving: boolean; close: () => void; save: () => void | Promise<void>; label?: string }) {
  return <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={close} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button><button type="button" disabled={saving} onClick={() => void save()} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : (label ?? 'Speichern')}</button></div>
}
