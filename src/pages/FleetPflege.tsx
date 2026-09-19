import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bike, Car, Plus, Trash2 } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { canManageFuhrpark } from '../lib/fuhrpark'
import { canEditFleetEntry, useFleetVehicles, vehicleLabel } from '../lib/fleet'
import { supabase } from '../lib/supabase'
import type { FleetCareTask, FleetCareTaskKind } from '../lib/types'
import { Actions, Empty, Modal, inputClass } from './fleetShared'

// Fahrzeugübergreifende Sicht auf Reinigung & Pflege (vormals ein Tab je
// Fahrzeug auf FleetVehicle.tsx).

const CARE_KIND_LABEL: Record<FleetCareTaskKind, string> = { innenreinigung: 'Innenreinigung', aussenreinigung: 'Außenreinigung', pflege: 'Pflege', sonstiges: 'Sonstiges' }
const emptyForm = { vehicleId: '', kind: 'sonstiges' as FleetCareTaskKind, subject: '', note: '' }

export default function FleetPflege() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const canManage = canManageFuhrpark({ isStrictAdmin, isGenehmiger, rows: areaRoles })
  const { vehicles } = useFleetVehicles()
  const [searchParams, setSearchParams] = useSearchParams()
  const vehicleFilter = searchParams.get('vehicle') ?? ''
  const [tasks, setTasks] = useState<FleetCareTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('fleet_care_tasks').select('*, vehicle:fleet_vehicles!inner(id,name,kind,call_sign,license_plate,responsible_user_id,active)').eq('vehicle.active', true).order('status').order('created_at', { ascending: false })
    if (result.error) setError('Die Pflegeaufgaben konnten nicht geladen werden.')
    else setError('')
    setTasks((result.data ?? []) as unknown as FleetCareTask[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => vehicleFilter ? tasks.filter(task => task.vehicle_id === vehicleFilter) : tasks, [tasks, vehicleFilter])
  const assignableVehicles = useMemo(() => vehicles.filter(vehicle => canEditFleetEntry(canManage, profile?.id, vehicle.responsible_user_id)), [vehicles, canManage, profile?.id])
  if (!hasAreaAccess('fuhrpark')) return <Navigate to="/" replace />

  function openNew() { setForm({ ...emptyForm, vehicleId: vehicleFilter || assignableVehicles[0]?.id || '' }); setShowForm(true); setError('') }
  async function save() {
    if (!profile?.id || !form.vehicleId) { setError('Bitte ein Fahrzeug auswählen.'); return }
    if (!form.subject.trim()) { setError('Bitte einen Betreff angeben.'); return }
    setSaving(true)
    const { error: insertError } = await supabase.from('fleet_care_tasks').insert({ vehicle_id: form.vehicleId, kind: form.kind, subject: form.subject.trim(), note: form.note.trim() || null, created_by: profile.id })
    setSaving(false)
    if (insertError) { setError('Die Aufgabe konnte nicht angelegt werden.'); return }
    logAudit('Pflegeaufgabe erfasst', form.subject.trim()); setShowForm(false); setNotice('Aufgabe wurde erfasst.'); await load()
  }
  async function resolve(task: FleetCareTask) {
    if (!profile?.id) return
    const { error: updateError } = await supabase.from('fleet_care_tasks').update({ status: 'erledigt', resolved_by: profile.id, resolved_at: new Date().toISOString() }).eq('id', task.id)
    if (updateError) { setError('Konnte nicht als erledigt markiert werden.'); return }
    setNotice('Aufgabe wurde als erledigt markiert.'); await load()
  }
  async function remove(task: FleetCareTask) {
    if (!window.confirm(`Aufgabe „${task.subject}“ endgültig löschen?`)) return
    const { error: deleteError } = await supabase.from('fleet_care_tasks').delete().eq('id', task.id)
    if (deleteError) { setError('Die Aufgabe konnte nicht gelöscht werden.'); return }
    logAudit('Pflegeaufgabe gelöscht', task.subject); setNotice('Aufgabe wurde gelöscht.'); await load()
  }

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Fuhrpark</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Reinigung & Pflege</h1><p className="text-sm text-gray-500 mt-1">Reinigung und offene Pflegeaufgaben, fahrzeugübergreifend.</p></div>{assignableVehicles.length > 0 ? <button type="button" onClick={openNew} className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-3 py-2 rounded-lg"><Plus className="w-4 h-4" /> Aufgabe</button> : null}</div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    <label className="block text-xs font-medium text-gray-600 mb-4 max-w-xs">Fahrzeug<select className={inputClass} value={vehicleFilter} onChange={event => setSearchParams(event.target.value ? { vehicle: event.target.value } : {})}><option value="">Alle Fahrzeuge</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>)}</select></label>
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {visible.length === 0 ? <Empty text="Keine Reinigungs- oder Pflegeaufgaben erfasst." /> : <div className="divide-y divide-gray-100">{visible.map(task => {
          const VehicleIcon = task.vehicle?.kind === 'Motorrad' ? Bike : Car
          const canEdit = canEditFleetEntry(canManage, profile?.id, task.vehicle?.responsible_user_id)
          return <div key={task.id} className="p-4 sm:p-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {task.vehicle ? <Link to={`/fuhrpark/${task.vehicle_id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline"><VehicleIcon className="w-3.5 h-3.5" /> {vehicleLabel(task.vehicle)}</Link> : null}
              <div className="flex items-center gap-2 mt-1"><span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{CARE_KIND_LABEL[task.kind]}</span><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${task.status === 'offen' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>{task.status === 'offen' ? 'Offen' : 'Erledigt'}</span></div>
              <p className="text-sm font-medium text-gray-900 mt-1">{task.subject}</p>{task.note ? <p className="text-xs text-gray-500 mt-0.5">{task.note}</p> : null}
            </div>
            <div className="flex gap-1 flex-shrink-0">{task.status === 'offen' ? <button type="button" onClick={() => void resolve(task)} className="text-xs font-medium text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg">Erledigt</button> : null}{canEdit ? <button type="button" onClick={() => void remove(task)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Aufgabe löschen"><Trash2 className="w-4 h-4" /></button> : null}</div>
          </div>
        })}</div>}
      </section>
    )}
    {showForm ? <Modal title="Pflegeaufgabe erfassen" close={() => setShowForm(false)}>
      <label className="block text-xs font-medium text-gray-600">Fahrzeug *<select className={inputClass} value={form.vehicleId} onChange={event => setForm(current => ({ ...current, vehicleId: event.target.value }))}><option value="">Bitte wählen</option>{assignableVehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>)}</select></label>
      <label className="block text-xs font-medium text-gray-600">Art<select className={inputClass} value={form.kind} onChange={event => setForm(current => ({ ...current, kind: event.target.value as FleetCareTaskKind }))}>{Object.entries(CARE_KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-xs font-medium text-gray-600">Betreff *<input className={inputClass} value={form.subject} onChange={event => setForm(current => ({ ...current, subject: event.target.value }))} /></label>
      <label className="block text-xs font-medium text-gray-600">Bemerkung<textarea className={`${inputClass} min-h-20 resize-y`} value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></label>
      {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
      <Actions saving={saving} close={() => setShowForm(false)} save={save} />
    </Modal> : null}
  </div>
}
