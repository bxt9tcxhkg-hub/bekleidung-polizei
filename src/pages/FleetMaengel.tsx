import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bike, Car } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useFleetVehicles, vehicleLabel } from '../lib/fleet'
import { supabase } from '../lib/supabase'
import type { FleetEquipmentStatus, FleetEquipmentStatusValue } from '../lib/types'
import { Empty } from './fleetShared'

// Fahrzeugübergreifende Sicht auf offene Mängel (vormals ein Tab je
// Fahrzeug auf FleetVehicle.tsx) - Mängel entstehen ausschließlich aus der
// Füllliste-Kontrolle des jeweiligen Fahrzeugs, hier nur Anzeige + Behoben-
// Bestätigung, wie zuvor ohne Einschränkung auf Sachbearbeiter/Verantwortliche.

const STATUS_LABEL: Record<FleetEquipmentStatusValue, string> = { vollstaendig: 'Vollständig', fehlend: 'Fehlend', beschaedigt: 'Beschädigt', abgelaufen: 'Abgelaufen' }
const STATUS_COLOR: Record<FleetEquipmentStatusValue, string> = { vollstaendig: 'bg-green-100 text-green-800', fehlend: 'bg-red-100 text-red-800', beschaedigt: 'bg-amber-100 text-amber-800', abgelaufen: 'bg-orange-100 text-orange-800' }

export default function FleetMaengel() {
  const { profile, hasAreaAccess } = useAuth()
  const { vehicles } = useFleetVehicles()
  const [searchParams, setSearchParams] = useSearchParams()
  const vehicleFilter = searchParams.get('vehicle') ?? ''
  const [items, setItems] = useState<FleetEquipmentStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('fleet_equipment_status')
      .select('*, item:fleet_equipment_items!inner(id,name,soll_menge,unit,vehicle_id,active), vehicle:fleet_vehicles!inner(id,name,kind,call_sign,license_plate,active)')
      .neq('status', 'vollstaendig')
      .eq('item.active', true)
      .eq('vehicle.active', true)
    if (result.error) setError('Die Mängel konnten nicht geladen werden.')
    else setError('')
    setItems((result.data ?? []) as unknown as FleetEquipmentStatus[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => {
    const rows = vehicleFilter ? items.filter(row => row.vehicle_id === vehicleFilter) : items
    return [...rows].sort((a, b) => (a.vehicle?.name ?? '').localeCompare(b.vehicle?.name ?? '', 'de-AT') || (a.item?.name ?? '').localeCompare(b.item?.name ?? '', 'de-AT'))
  }, [items, vehicleFilter])
  if (!hasAreaAccess('fuhrpark')) return <Navigate to="/" replace />

  async function resolve(row: FleetEquipmentStatus) {
    if (!profile?.id || !row.item) return
    setBusyId(row.item_id)
    const { error: updateError } = await supabase.from('fleet_equipment_status').upsert(
      { item_id: row.item_id, vehicle_id: row.vehicle_id, ist_menge: row.item.soll_menge, status: 'vollstaendig', note: null, checked_by: profile.id, checked_at: new Date().toISOString() },
      { onConflict: 'item_id' },
    )
    setBusyId(null)
    if (updateError) { setError('Konnte nicht als behoben bestätigt werden.'); return }
    setNotice(`„${row.item.name}“ wurde als behoben bestätigt.`); await load()
  }

  return <div>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Fuhrpark</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Offene Mängel</h1><p className="text-sm text-gray-500 mt-1">Fehlende, beschädigte oder abgelaufene Ausstattung, fahrzeugübergreifend.</p></div>
    {error ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    <label className="block text-xs font-medium text-gray-600 mb-4 max-w-xs">Fahrzeug<select className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={vehicleFilter} onChange={event => setSearchParams(event.target.value ? { vehicle: event.target.value } : {})}><option value="">Alle Fahrzeuge</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>)}</select></label>
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {visible.length === 0 ? <Empty text="Keine offenen Mängel." /> : <div className="divide-y divide-gray-100">{visible.map(row => {
          const VehicleIcon = row.vehicle?.kind === 'Motorrad' ? Bike : Car
          return <div key={row.item_id} className="p-4 sm:p-5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-start gap-3">
              <span className="bg-amber-50 text-amber-700 p-2 rounded-lg flex-shrink-0"><AlertTriangle className="w-4 h-4" /></span>
              <div className="min-w-0">
                {row.vehicle ? <Link to={`/fuhrpark/${row.vehicle_id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline"><VehicleIcon className="w-3.5 h-3.5" /> {vehicleLabel(row.vehicle)}</Link> : null}
                <p className="text-sm font-medium text-gray-900 mt-0.5">{row.item?.name ?? 'Unbekannte Position'}</p>
                <p className="text-xs text-gray-500 mt-0.5"><span className={`font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[row.status]}`}>{STATUS_LABEL[row.status]}</span> · Ist {row.ist_menge ?? '–'} / Soll {row.item?.soll_menge ?? '–'} {row.item?.unit}{row.note ? ` · ${row.note}` : ''}</p>
              </div>
            </div>
            <button type="button" disabled={busyId === row.item_id} onClick={() => void resolve(row)} className="text-xs font-semibold border border-green-300 text-green-800 bg-green-50 px-3 py-1.5 rounded-lg disabled:opacity-40 flex-shrink-0">Behoben bestätigen</button>
          </div>
        })}</div>}
      </section>
    )}
  </div>
}
