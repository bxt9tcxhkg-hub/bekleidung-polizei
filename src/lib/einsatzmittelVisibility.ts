/**
 * Sichtbarkeit der Einsatzmittel-Unterreiter.
 *
 * Sachbearbeiter / Admin (canManage): Persönlich, Pool, Lagerbestand.
 * Benutzer: Persönlich (nur eigene) und Pool (ohne Munition). Kein Lagerbestand.
 */

import { canManagePersonalEinsatzmittel } from './personalEinsatzmittel'

export type EmSubTab = 'persoenlich' | 'pool' | 'lagerbestand'

export const EM_SUB_TABS: { id: EmSubTab; label: string }[] = [
  { id: 'persoenlich', label: 'Persönlich' },
  { id: 'pool', label: 'Pool' },
  { id: 'lagerbestand', label: 'Lagerbestand' },
]

export function canViewLagerbestand(input: {
  isStrictAdmin: boolean
  isGenehmiger?: boolean
  rows: readonly { area: string; roles: string[] }[] | null
  operativeModeActive?: boolean
}): boolean {
  return canManagePersonalEinsatzmittel(input)
}

export function visibleEmSubTabs(canManage: boolean): { id: EmSubTab; label: string }[] {
  if (canManage) return EM_SUB_TABS.slice()
  return EM_SUB_TABS.filter(tab => tab.id !== 'lagerbestand')
}

/** Ungültigen Reiter (z. B. Lager ohne Recht) auf Persönlich zurücksetzen. */
export function sanitizeEmSubTab(tab: EmSubTab, canManage: boolean): EmSubTab {
  if (tab === 'lagerbestand' && !canManage) return 'persoenlich'
  return tab
}
