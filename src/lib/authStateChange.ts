/** Welche Auth-Events das Profil neu laden — und ob der Lade-Spinner die App unmountet. */

export type AuthStateChangeAction = 'clear' | 'full-reload' | 'soft-reload' | 'none'

export type PlanAuthStateChangeInput = {
  event: string
  hasUser: boolean
  userId?: string | null
  loadedForUserId?: string | null
}

/**
 * TOKEN_REFRESHED / USER_UPDATED dürfen nicht wie SIGNED_IN behandelt werden:
 * setLoading(true) unmountet ProtectedRoute → Modal remountet → refreshSession → Loop.
 * Voller Reload nur bei echter Anmeldung; Soft-Reload ohne Spinner nach updateUser.
 */
export function planAuthStateChange(input: PlanAuthStateChangeInput): AuthStateChangeAction {
  if (!input.hasUser || input.event === 'SIGNED_OUT') return 'clear'

  if (input.event === 'INITIAL_SESSION' || input.event === 'SIGNED_IN') {
    if (input.loadedForUserId && input.userId && input.loadedForUserId === input.userId) {
      return 'none'
    }
    return 'full-reload'
  }

  if (input.event === 'USER_UPDATED') return 'soft-reload'
  return 'none'
}

export function showsAuthLoading(action: AuthStateChangeAction): boolean {
  return action === 'full-reload'
}
