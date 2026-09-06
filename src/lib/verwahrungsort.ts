/**
 * Verwahrungsorte für Pool- und persönliche Einsatzmittel.
 * Festes Lookup (CHECK in der DB), keine Extra-Tabelle.
 */

export const VERWAHRUNGSORTE = [
  'lager',
  'innendienst',
  'peter_1',
  'peter_2',
  'peter_30',
  'spind_1',
  'spind_2',
  'waffentresor_zentrale',
  'waffentresor_keller',
] as const

export type Verwahrungsort = (typeof VERWAHRUNGSORTE)[number]

export const VERWAHRUNGSORT_LABELS: Record<Verwahrungsort, string> = {
  lager: 'Lager',
  innendienst: 'Innendienst',
  peter_1: 'Peter 1',
  peter_2: 'Peter 2',
  peter_30: 'Peter 30',
  spind_1: 'Spind 1',
  spind_2: 'Spind 2',
  waffentresor_zentrale: 'Waffentresor Zentrale',
  waffentresor_keller: 'Waffentresor Keller',
}

export function isVerwahrungsort(value: string): value is Verwahrungsort {
  return (VERWAHRUNGSORTE as readonly string[]).includes(value)
}

export function isLagerOrt(value: string): boolean {
  return value === 'lager'
}
