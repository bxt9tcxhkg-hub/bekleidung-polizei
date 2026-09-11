import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bike, Car, ChevronRight, Plus, X } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import type { FleetVehicle, FleetVehicleKind, Profile } from '../lib/types'

const inputClass = 'mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function Fleet() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const roles = areaRoles?.find(row => row.area === 'fuhrpark')?.roles ?? []
  const canManage = isStrictAdmin || isGenehmiger || roles.includes('sachbearbeiter') || roles.includes('admin')
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [employees, setEmployees] = useState<Pick<Profile, 'id' | 'name' | 'dienstnummer'>[]>([])
  const [defectVehicleIds, setDefectVehicleIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<FleetVehicleKind>('Dienstfahrzeug')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [callSign, setCallSign] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [responsibleUserId, setResponsibleUserId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data, error: loadError }, employeeResult, defectResult] = await Promise.all([
      supabase.from('fleet_vehicles').select('*, responsible_profile:profiles!fleet_vehicles_responsible_user_id_fkey(id,name,dienstnummer)').eq('active', true).order('kind').order('name'),
      canManage ? supabase.from('profiles').select('id,name,dienstnummer').eq('active', true).order('name') : Promise.resolve({ data: [], error: null }),
      supabase.from('fleet_equipment_status').select('vehicle_id').neq('status', 'vollstaendig'),
    ])
    if (loadError) {
      setError('Fahrzeuge konnten nicht geladen werden.')
      setVehicles([])
    } else {
      setError('')
      setVehicles((data ?? []) as FleetVehicle[])
    }
    setEmployees((employeeResult.data ?? []) as Pick<Profile, 'id' | 'name' | 'dienstnummer'>[])
    setDefectVehicleIds((defectResult.data ?? []).map(row => (row as { vehicle_id: string }).vehicle_id))
    setLoading(false)
  }, [canManage])
  const defectVehicleSet = useMemo(() => new Set(defectVehicleIds), [defectVehicleIds])

  useEffect(() => { void load() }, [load])
  if (!hasAreaAccess('fuhrpark')) return <Navigate to="/" replace />

  function openForm() {
    setName(''); setKind('Dienstfahrzeug'); setMake(''); setModel(''); setCallSign(''); setLicensePlate(''); setResponsibleUserId(''); setError(''); setShowForm(true)
  }

  async function saveVehicle() {
    if (!name.trim()) { setError('Bitte eine Bezeichnung für das Fahrzeug eingeben.'); return }
    setSaving(true)
    const { error: insertError } = await supabase.from('fleet_vehicles').insert({
      name: name.trim(), kind, make: make.trim() || null, model: model.trim() || null,
      call_sign: callSign.trim() || null, license_plate: licensePlate.trim().toUpperCase() || null,
      responsible_user_id: responsibleUserId || null,
      created_by: profile?.id ?? null,
    })
    setSaving(false)
    if (insertError) {
      setError(insertError.message.includes('duplicate') ? 'Rufname oder Kennzeichen ist bereits vergeben.' : 'Fahrzeug konnte nicht angelegt werden.')
      return
    }
    logAudit('Fahrzeug angelegt', name.trim())
    setShowForm(false)
    await load()
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div><h1 className="text-2xl font-bold text-gray-900">Fuhrpark &amp; Fahrzeuge</h1><p className="text-gray-500 text-sm mt-1">Dienstfahrzeuge auswählen und fahrzeugbezogen verwalten.</p></div>
        {canManage ? <button type="button" onClick={openForm} className="inline-flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Fahrzeug anlegen</button> : null}
      </div>
      {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
      {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : vehicles.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center"><Car className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="font-medium text-gray-700">Noch keine Fahrzeuge vorhanden</p>{canManage ? <button type="button" onClick={openForm} className="mt-3 text-sm font-medium text-blue-800">Erstes Fahrzeug anlegen</button> : null}</div>
      ) : <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{vehicles.map(vehicle => {
        const Icon = vehicle.kind === 'Motorrad' ? Bike : Car
        return <Link key={vehicle.id} to={`/fuhrpark/${vehicle.id}`} className="group rounded-2xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all"><div className="flex items-start gap-4"><div className="bg-blue-50 text-blue-700 p-3 rounded-xl"><Icon className="w-6 h-6" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{vehicle.kind}</p>{defectVehicleSet.has(vehicle.id) ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800">Mängel</span> : null}</div><h2 className="font-bold text-gray-900 mt-1">{vehicle.name}</h2></div><ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-700 flex-shrink-0" /></div><dl className="text-sm mt-4 space-y-2"><div className="flex justify-between gap-3"><dt className="text-gray-500">Rufname</dt><dd className="font-medium text-gray-700 text-right">{vehicle.call_sign ?? 'Noch offen'}</dd></div><div className="flex justify-between gap-3"><dt className="text-gray-500">Kennzeichen</dt><dd className="font-medium text-gray-700 text-right">{vehicle.license_plate ?? 'Noch offen'}</dd></div><div className="flex justify-between gap-3"><dt className="text-gray-500">Fahrzeugverantwortlich</dt><dd className="font-medium text-gray-700 text-right">{vehicle.responsible_profile?.name ?? 'Nicht zugewiesen'}</dd></div></dl><p className="text-xs font-semibold text-blue-700 mt-4">Fahrzeug öffnen</p></div></div></Link>
      })}</div>}

      {showForm ? <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto"><div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b"><h2 className="font-bold text-gray-900">Fahrzeug anlegen</h2><button type="button" onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button></div><div className="px-5 sm:px-6 py-4 space-y-4">
        <label className="block text-xs font-medium text-gray-600">Bezeichnung *<input className={inputClass} maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="z. B. Mercedes-Benz Vito" /></label>
        <label className="block text-xs font-medium text-gray-600">Fahrzeugart<select className={inputClass} value={kind} onChange={event => setKind(event.target.value as FleetVehicleKind)}><option>Dienstfahrzeug</option><option>Motorrad</option></select></label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><label className="block text-xs font-medium text-gray-600">Hersteller<input className={inputClass} maxLength={60} value={make} onChange={event => setMake(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Modell<input className={inputClass} maxLength={60} value={model} onChange={event => setModel(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Rufname<input className={inputClass} maxLength={80} value={callSign} onChange={event => setCallSign(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Kennzeichen<input className={inputClass} maxLength={20} value={licensePlate} onChange={event => setLicensePlate(event.target.value)} /></label></div>
        <label className="block text-xs font-medium text-gray-600">Fahrzeugverantwortlicher Mitarbeiter<select className={inputClass} value={responsibleUserId} onChange={event => setResponsibleUserId(event.target.value)}><option value="">Noch nicht zugewiesen</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}{employee.dienstnummer ? ` · DN ${employee.dienstnummer}` : ''}</option>)}</select></label>
        {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
      </div><div className="flex gap-3 px-5 sm:px-6 py-4 border-t"><button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2.5 rounded-lg">Abbrechen</button><button type="button" disabled={saving} onClick={() => { void saveVehicle() }} className="flex-1 bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg">{saving ? 'Speichern…' : 'Anlegen'}</button></div></div></div> : null}
    </div>
  )
}
