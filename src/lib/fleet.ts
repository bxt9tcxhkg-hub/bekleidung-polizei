import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { FleetVehicle } from './types'

// Von den fahrzeugübergreifenden Fuhrpark-Seiten (Mängel, Pflege, Werkstatt,
// Fristen, Dokumente - siehe FleetMaengel.tsx & Co.) gemeinsam genutzter
// Fahrzeug-Ladehook, dieselben aktiven Fahrzeuge wie auf der Fahrzeugliste
// (Fleet.tsx).
export function useFleetVehicles() {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('fleet_vehicles').select('*, responsible_profile:profiles!fleet_vehicles_responsible_user_id_fkey(id,name,dienstnummer)').eq('active', true).order('kind').order('name')
    setError(!!result.error)
    setVehicles((result.data ?? []) as FleetVehicle[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  return { vehicles, loading, error, reload: load }
}

export function vehicleLabel(vehicle: Pick<FleetVehicle, 'name' | 'call_sign'>) {
  return vehicle.call_sign ? `${vehicle.name} · ${vehicle.call_sign}` : vehicle.name
}

/** Wie FleetVehicle.tsx's canEditVehicle: fahrzeugübergreifend zuständig (Sachbearbeiter/Genehmiger/Admin) oder persönlich für genau dieses Fahrzeug verantwortlich. */
export function canEditFleetEntry(canManage: boolean, profileId: string | null | undefined, responsibleUserId: string | null | undefined) {
  return canManage || (!!profileId && profileId === responsibleUserId)
}
