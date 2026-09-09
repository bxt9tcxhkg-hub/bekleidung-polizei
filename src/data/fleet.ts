export type FleetVehicleKind = 'Dienstfahrzeug' | 'Motorrad'

export type FleetVehicle = {
  id: string
  kind: FleetVehicleKind
  make: string | null
  model: string | null
  callSign: string | null
  licensePlate: string | null
  detailsPending?: boolean
}

export const FLEET_VEHICLES: readonly FleetVehicle[] = [
  { id: 'peter-1', kind: 'Dienstfahrzeug', make: 'Mercedes-Benz', model: 'Vito', callSign: 'Dornbirn Peter 1', licensePlate: null },
  { id: 'peter-2', kind: 'Dienstfahrzeug', make: 'Volkswagen', model: 'Tiguan', callSign: 'Dornbirn Peter 2', licensePlate: null },
  { id: 'peter-30', kind: 'Dienstfahrzeug', make: 'Mazda', model: 'CX-5', callSign: 'Dornbirn Peter 30', licensePlate: null },
  { id: 'motorrad-1', kind: 'Motorrad', make: null, model: null, callSign: null, licensePlate: null, detailsPending: true },
  { id: 'motorrad-2', kind: 'Motorrad', make: null, model: null, callSign: null, licensePlate: null, detailsPending: true },
]

export function vehicleTitle(vehicle: FleetVehicle): string {
  if (vehicle.detailsPending) return vehicle.id === 'motorrad-1' ? 'Motorrad 1' : 'Motorrad 2'
  return [vehicle.make, vehicle.model].filter(Boolean).join(' ')
}
