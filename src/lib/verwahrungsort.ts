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
] as const

export type Verwahrungsort = (typeof VERWAHRUNGSORTE)[number]

export const VERWAHRUNGSORT_LABELS: Record<Verwahrungsort, string> = {
  lager: 'Lager',
  innendienst: 'Innendienst',
  peter_1: 'Peter 1',
  peter_2: 'Peter 2',
  peter_30: 'Peter 30',
}

export function isVerwahrungsort(value: string): value is Verwahrungsort {
  return (VERWAHRUNGSORTE as readonly string[]).includes(value)
}
