import { useEffect, useMemo, useState } from 'react'
import { Bike, Car, CheckCircle2 } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import BackLink from '../components/BackLink'
import { useAuth } from '../contexts/AuthContext'
import { canManageFuhrpark } from '../lib/fuhrpark'
import { supabase } from '../lib/supabase'
import type { FleetAppointment, FleetCareTask, FleetEquipmentStatus, FleetVehicle } from '../lib/types'

type TabId = 'maengel' | 'pflege' | 'werkstatt' | 'fristen'
const STAT_LABELS: Record<TabId, string> = { maengel: 'Mängel', pflege: 'Pflege', werkstatt: 'Werkstatt', fristen: 'Fristen' }
// Vormals Tab-Query-Param auf der Fahrzeugseite, jetzt eigene, fahrzeugübergreifende Seiten (siehe FuhrparkLayout.tsx).
const TAB_ROUTE: Record<TabId, string> = { maengel: '/fuhrpark/maengel', pflege: '/fuhrpark/pflege', werkstatt: '/fuhrpark/werkstatt', fristen: '/fuhrpark/fristen' }

export default function FleetOpenItems() {
  const { hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const canManage = canManageFuhrpark({ isStrictAdmin, isGenehmiger, rows: areaRoles })
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [statuses, setStatuses] = useState<FleetEquipmentStatus[]>([])
  const [careTasks, setCareTasks] = useState<FleetCareTask[]>([])
  const [appointments, setAppointments] = useState<FleetAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!canManage) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const [vehicleRes, statusRes, careRes, appointmentRes] = await Promise.all([
        supabase.from('fleet_vehicles').select('*').eq('active', true).order('kind').order('name'),
        supabase.from('fleet_equipment_status').select('*').neq('status', 'vollstaendig'),
        supabase.from('fleet_care_tasks').select('*').eq('status', 'offen'),
        supabase.from('fleet_appointments').select('*').eq('status', 'offen'),
      ])
      if (cancelled) return
      if (vehicleRes.error) setError('Fahrzeuge konnten nicht geladen werden.')
      else setError('')
      setVehicles((vehicleRes.data ?? []) as FleetVehicle[])
      setStatuses((statusRes.data ?? []) as unknown as FleetEquipmentStatus[])
      setCareTasks((careRes.data ?? []) as FleetCareTask[])
      setAppointments((appointmentRes.data ?? []) as FleetAppointment[])
      setLoading(false)
    }
    load().catch(() => { if (!cancelled) { setError('Fahrzeuge konnten nicht geladen werden.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [canManage])

  const rows = useMemo(() => {
    const maengelByVehicle = new Map<string, number>()
    for (const row of statuses) maengelByVehicle.set(row.vehicle_id, (maengelByVehicle.get(row.vehicle_id) ?? 0) + 1)
    const pflegeByVehicle = new Map<string, number>()
    for (const row of careTasks) pflegeByVehicle.set(row.vehicle_id, (pflegeByVehicle.get(row.vehicle_id) ?? 0) + 1)
    const werkstattByVehicle = new Map<string, number>()
    const fristenByVehicle = new Map<string, number>()
    for (const row of appointments) {
      const map = row.category === 'werkstatt' ? werkstattByVehicle : fristenByVehicle
      map.set(row.vehicle_id, (map.get(row.vehicle_id) ?? 0) + 1)
    }
    return vehicles.map(vehicle => {
      const counts: Record<TabId, number> = {
        maengel: maengelByVehicle.get(vehicle.id) ?? 0,
        pflege: pflegeByVehicle.get(vehicle.id) ?? 0,
        werkstatt: werkstattByVehicle.get(vehicle.id) ?? 0,
        fristen: fristenByVehicle.get(vehicle.id) ?? 0,
      }
      const total = counts.maengel + counts.pflege + counts.werkstatt + counts.fristen
      return { vehicle, counts, total }
    }).sort((a, b) => b.total - a.total || a.vehicle.name.localeCompare(b.vehicle.name))
  }, [vehicles, statuses, careTasks, appointments])

  const open = rows.filter(row => row.total > 0)
  const clear = rows.filter(row => row.total === 0)

  if (!hasAreaAccess('fuhrpark') || !canManage) return <Navigate to="/fuhrpark" replace />

  return (
    <div>
      <BackLink to="/fuhrpark" label="Zur Fahrzeugübersicht" className="mb-4" />
      <div className="mb-6"><h1 className="text-2xl font-bold text-gray-900">Offene Punkte</h1><p className="text-gray-500 text-sm mt-1">Mängel, Pflege, Werkstatt und Fristen über den gesamten Fuhrpark.</p></div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center"><Car className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="font-medium text-gray-700">Noch keine Fahrzeuge vorhanden</p></div>
      ) : (
        <div className="space-y-6">
          {open.length === 0 ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-8 text-center"><CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" /><p className="font-medium text-green-800">Kein Fahrzeug hat offene Punkte.</p></div>
          ) : (
            <div className="space-y-3">
              {open.map(({ vehicle, counts, total }) => {
                const Icon = vehicle.kind === 'Motorrad' ? Bike : Car
                return (
                  <div key={vehicle.id} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="bg-blue-50 text-blue-700 p-2 rounded-lg flex-shrink-0"><Icon className="w-4 h-4" /></div>
                      <Link to={`/fuhrpark/${vehicle.id}`} className="font-semibold text-gray-900 hover:text-blue-700 truncate">{vehicle.name}</Link>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800 ml-auto flex-shrink-0">{total} offen</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(Object.keys(STAT_LABELS) as TabId[]).map(tab => (
                        <Link
                          key={tab}
                          to={`${TAB_ROUTE[tab]}?vehicle=${vehicle.id}`}
                          className={`rounded-lg px-3 py-2 text-center ${counts[tab] > 0 ? 'bg-red-50 hover:bg-red-100' : 'bg-gray-50 hover:bg-gray-100'}`}
                        >
                          <p className={`text-lg font-bold ${counts[tab] > 0 ? 'text-red-700' : 'text-gray-400'}`}>{counts[tab]}</p>
                          <p className="text-xs text-gray-500">{STAT_LABELS[tab]}</p>
                        </Link>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {clear.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 mb-2">Ohne offene Punkte ({clear.length})</h2>
              <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
                {clear.map(({ vehicle }) => (
                  <Link key={vehicle.id} to={`/fuhrpark/${vehicle.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50">
                    <span className="text-sm text-gray-700">{vehicle.name}</span>
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
