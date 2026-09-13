import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bike, Car, CheckCircle2, Plus, Trash2, X } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { canManageFuhrpark } from '../lib/fuhrpark'
import { canEditFleetEntry, useFleetVehicles, vehicleLabel } from '../lib/fleet'
import { supabase } from '../lib/supabase'
import type { FleetAppointment, FleetAppointmentCategory } from '../lib/types'

// Von FleetVehicle.tsx und den fahrzeugübergreifenden Fuhrpark-Seiten
// (Mängel, Pflege, Werkstatt, Fristen, Dokumente) gemeinsam genutzte
// kleine UI-Bausteine.

export const inputClass = 'mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function todayLocal() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleDateString('de-AT') : null }

export function Empty({ text }: { text: string }) { return <div className="py-8 text-center"><CheckCircle2 className="w-7 h-7 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{text}</p></div> }

export function Modal({ title, close, wide, children }: { title: string; close: () => void; wide?: boolean; children: ReactNode }) {
  return <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"><div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[94vh] overflow-y-auto`}><div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 sm:px-6 py-4 border-b"><h2 className="font-bold text-gray-900">{title}</h2><button type="button" onClick={close} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button></div><div className="px-5 sm:px-6 py-4 space-y-4">{children}</div></div></div>
}
export function Actions({ saving, close, save, label }: { saving: boolean; close: () => void; save: () => void | Promise<void>; label?: string }) {
  return <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={close} className="border border-gray-300 text-sm px-4 py-2.5 rounded-lg">Abbrechen</button><button type="button" disabled={saving} onClick={() => void save()} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-60">{saving ? 'Speichern…' : (label ?? 'Speichern')}</button></div>
}

const emptyTerminForm = { vehicleId: '', subject: '', dueDate: '', note: '' }

// Werkstatt & Termine sowie Fristen sind bis auf Kategorie/Beschriftung
// identisch (vormals TerminTab, je ein Tab pro Fahrzeug auf FleetVehicle.tsx)
// - jetzt fahrzeugübergreifend, FleetWerkstatt.tsx/FleetFristen.tsx sind nur
// dünne Wrapper mit fester category.
export function FleetTermineList({ category, title, description, placeholder }: { category: FleetAppointmentCategory; title: string; description: string; placeholder: string }) {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const canManage = canManageFuhrpark({ isStrictAdmin, isGenehmiger, rows: areaRoles, operativeModeActive })
  const { vehicles } = useFleetVehicles()
  const [searchParams, setSearchParams] = useSearchParams()
  const vehicleFilter = searchParams.get('vehicle') ?? ''
  const [appointments, setAppointments] = useState<FleetAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyTerminForm)
  const [saving, setSaving] = useState(false)
  const today = todayLocal()

  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('fleet_appointments').select('*, vehicle:fleet_vehicles!inner(id,name,kind,call_sign,license_plate,responsible_user_id,active)').eq('category', category).eq('vehicle.active', true).order('due_date', { ascending: true, nullsFirst: false })
    if (result.error) setError('Die Einträge konnten nicht geladen werden.')
    else setError('')
    setAppointments((result.data ?? []) as unknown as FleetAppointment[])
    setLoading(false)
  }, [category])
  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => vehicleFilter ? appointments.filter(item => item.vehicle_id === vehicleFilter) : appointments, [appointments, vehicleFilter])
  const assignableVehicles = useMemo(() => vehicles.filter(vehicle => canEditFleetEntry(canManage, profile?.id, vehicle.responsible_user_id)), [vehicles, canManage, profile?.id])
  if (!hasAreaAccess('fuhrpark')) return <Navigate to="/" replace />

  function openNew() { setForm({ ...emptyTerminForm, vehicleId: vehicleFilter || assignableVehicles[0]?.id || '' }); setShowForm(true); setError('') }
  async function save() {
    if (!profile?.id || !form.vehicleId) { setError('Bitte ein Fahrzeug auswählen.'); return }
    if (!form.subject.trim()) { setError('Bitte einen Betreff angeben.'); return }
    setSaving(true)
    const { error: insertError } = await supabase.from('fleet_appointments').insert({ vehicle_id: form.vehicleId, category, subject: form.subject.trim(), due_date: form.dueDate || null, note: form.note.trim() || null, created_by: profile.id })
    setSaving(false)
    if (insertError) { setError('Der Termin konnte nicht angelegt werden.'); return }
    logAudit(`${title} erfasst`, form.subject.trim()); setShowForm(false); setNotice('Termin wurde erfasst.'); await load()
  }
  async function setStatus(item: FleetAppointment, status: 'erledigt' | 'storniert' | 'offen') {
    if (!profile?.id) return
    const { error: updateError } = await supabase.from('fleet_appointments').update({ status, resolved_by: status === 'offen' ? null : profile.id, resolved_at: status === 'offen' ? null : new Date().toISOString() }).eq('id', item.id)
    if (updateError) { setError('Der Status konnte nicht geändert werden.'); return }
    setNotice('Termin wurde aktualisiert.'); await load()
  }
  async function remove(item: FleetAppointment) {
    if (!window.confirm(`Termin „${item.subject}“ endgültig löschen?`)) return
    const { error: deleteError } = await supabase.from('fleet_appointments').delete().eq('id', item.id)
    if (deleteError) { setError('Der Termin konnte nicht gelöscht werden.'); return }
    logAudit(`${title} gelöscht`, item.subject); setNotice('Termin wurde gelöscht.'); await load()
  }

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Fuhrpark</p><h1 className="text-2xl font-bold text-gray-900 mt-1">{title}</h1><p className="text-sm text-gray-500 mt-1">{description}</p></div>{assignableVehicles.length > 0 ? <button type="button" onClick={openNew} className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Termin</button> : null}</div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    <label className="block text-xs font-medium text-gray-600 mb-4 max-w-xs">Fahrzeug<select className={inputClass} value={vehicleFilter} onChange={event => setSearchParams(event.target.value ? { vehicle: event.target.value } : {})}><option value="">Alle Fahrzeuge</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>)}</select></label>
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {visible.length === 0 ? <Empty text="Keine Einträge vorhanden." /> : <div className="divide-y divide-gray-100">{visible.map(item => {
          const overdue = item.status === 'offen' && !!item.due_date && item.due_date < today
          const VehicleIcon = item.vehicle?.kind === 'Motorrad' ? Bike : Car
          const canEdit = canEditFleetEntry(canManage, profile?.id, item.vehicle?.responsible_user_id)
          return <div key={item.id} className="p-4 sm:p-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {item.vehicle ? <Link to={`/fuhrpark/${item.vehicle_id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline"><VehicleIcon className="w-3.5 h-3.5" /> {vehicleLabel(item.vehicle)}</Link> : null}
              <div className="flex items-center gap-2 mt-1"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.status === 'erledigt' ? 'bg-green-100 text-green-800' : item.status === 'storniert' ? 'bg-gray-100 text-gray-600' : overdue ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{item.status === 'erledigt' ? 'Erledigt' : item.status === 'storniert' ? 'Storniert' : overdue ? 'Überfällig' : 'Offen'}</span>{item.due_date ? <span className="text-xs text-gray-500">{formatDate(item.due_date)}</span> : null}</div>
              <p className="text-sm font-medium text-gray-900 mt-1">{item.subject}</p>{item.note ? <p className="text-xs text-gray-500 mt-0.5">{item.note}</p> : null}
            </div>
            {canEdit ? <div className="flex gap-1 flex-shrink-0">{item.status !== 'erledigt' ? <button type="button" onClick={() => void setStatus(item, 'erledigt')} className="text-xs font-medium text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg">Erledigt</button> : <button type="button" onClick={() => void setStatus(item, 'offen')} className="text-xs font-medium text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg">Wieder öffnen</button>}<button type="button" onClick={() => void remove(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Termin löschen"><Trash2 className="w-4 h-4" /></button></div> : null}
          </div>
        })}</div>}
      </section>
    )}
    {showForm ? <Modal title={`${title} erfassen`} close={() => setShowForm(false)}>
      <label className="block text-xs font-medium text-gray-600">Fahrzeug *<select className={inputClass} value={form.vehicleId} onChange={event => setForm(current => ({ ...current, vehicleId: event.target.value }))}><option value="">Bitte wählen</option>{assignableVehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>)}</select></label>
      <label className="block text-xs font-medium text-gray-600">Betreff *<input className={inputClass} value={form.subject} onChange={event => setForm(current => ({ ...current, subject: event.target.value }))} placeholder={placeholder} /></label>
      <label className="block text-xs font-medium text-gray-600">Termin / Frist<input type="date" className={inputClass} value={form.dueDate} onChange={event => setForm(current => ({ ...current, dueDate: event.target.value }))} /></label>
      <label className="block text-xs font-medium text-gray-600">Bemerkung<textarea className={`${inputClass} min-h-20 resize-y`} value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></label>
      {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
      <Actions saving={saving} close={() => setShowForm(false)} save={save} />
    </Modal> : null}
  </div>
}
