/** Rechte-Helfer für Fuhrpark & Fahrzeuge (Fleet.tsx, FleetVehicle.tsx, Portal.tsx, FuhrparkLayout.tsx). */
export function canManageFuhrpark(input: {
  isStrictAdmin: boolean
  isGenehmiger?: boolean
  rows: readonly { area: string; roles: string[] }[] | null
  /** Sachbearbeiter/Genehmiger ist kein Dauerzustand - default true hält bestehende Aufrufe/Tests unverändert. */
  operativeModeActive?: boolean
}): boolean {
  if (input.isStrictAdmin || input.isGenehmiger) return true
  if (input.operativeModeActive === false) return false
  if (input.rows === null) return false
  const roles = input.rows.find(row => row.area === 'fuhrpark')?.roles ?? []
  return roles.includes('sachbearbeiter') || roles.includes('admin')
}
