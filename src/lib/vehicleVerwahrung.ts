import { type Verwahrungsort } from './verwahrungsort'
import type { PoolEmCategory } from './poolEinsatzmittel'

export const FUELLLISTE_EM_CATEGORIES: readonly PoolEmCategory[] = [
  'langwaffe_stg77',
  'munition',
  'schild',
  'ballistischer_helm',
  'schwere_westen',
  'pfefferspray_gross',
  'spuckschutzhaube',
]

export function vehicleToVerwahrungsort(vehicle: {
  call_sign?: string | null
  name?: string | null
}): Verwahrungsort | null {
  const text = `${vehicle.call_sign ?? ''} ${vehicle.name ?? ''}`.toLowerCase()
  if (text.includes('peter 30') || text.includes('peter-30') || text.includes('peter_30')) return 'peter_30'
  if (text.includes('peter 2') || text.includes('peter-2') || text.includes('peter_2')) return 'peter_2'
  if (text.includes('peter 1') || text.includes('peter-1') || text.includes('peter_1')) return 'peter_1'
  return null
}
