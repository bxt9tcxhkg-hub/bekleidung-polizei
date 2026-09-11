import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { availableRolesFromFlags, flagsFromRoles, type AppRole } from '../lib/authRoles'
import type { PortalArea } from '../lib/portalEntitlements'
import { hasAreaEntitlement } from '../lib/portalEntitlements'
import { planAuthStateChange } from '../lib/authStateChange'
import { shouldForcePasswordChange, shouldForceUsernameSet } from '../lib/workflow'

export type { AppRole }

export type AreaRoleSnapshot = { area: string; roles: string[] }

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  isStrictAdmin: boolean
  isSachbearbeiter: boolean
  isGenehmiger: boolean
  mustChangePassword: boolean
  mustSetUsername: boolean
  availableRoles: AppRole[]
  authError: string
  /** null = Tabelle nicht lesbar (Migration fehlt). */
  areaRoles: AreaRoleSnapshot[] | null
  hasAreaAccess: (area: PortalArea) => boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isStrictAdmin: false,
  isSachbearbeiter: false,
  isGenehmiger: false,
  mustChangePassword: false,
  mustSetUsername: false,
  availableRoles: [],
  authError: '',
  areaRoles: null,
  hasAreaAccess: () => false,
  refreshProfile: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [areaRoles, setAreaRoles] = useState<AreaRoleSnapshot[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const profileRequestIdRef = useRef(0)

  async function loadAreaRoles(userId: string): Promise<AreaRoleSnapshot[] | null> {
    const { data, error } = await supabase
      .from('portal_area_roles')
      .select('area, roles')
      .eq('user_id', userId)
    if (error) {
      console.error('Bereichsrechte konnten nicht geladen werden:', error.message)
      return null
    }
    return (data ?? []).map(row => ({ area: row.area, roles: row.roles }))
  }

  async function applyProfile(userId: string): Promise<boolean> {
    const requestId = ++profileRequestIdRef.current
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (requestId !== profileRequestIdRef.current) return false
    if (error || !data) {
      console.error('Profil konnte nicht geladen werden:', error?.message)
      setAuthError('Kein Profil gefunden. Bitte wende dich an die Verwaltung.')
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
      setAreaRoles(null)
      return false
    }
    if (!data.active) {
      setAuthError('Dieses Konto ist deaktiviert. Bitte wende dich an die Verwaltung.')
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
      setAreaRoles(null)
      return false
    }
    const areas = await loadAreaRoles(userId)
    if (requestId !== profileRequestIdRef.current) return false
    setAuthError('')
    setProfile(data)
    setAreaRoles(areas)
    return true
  }

  async function refreshProfile() {
    const { data: { user: current } } = await supabase.auth.getUser()
    if (current) await applyProfile(current.id)
  }

  useEffect(() => {
    let loadedForUserId: string | null = null
    let profileRequestId = 0

    async function loadProfile(userId: string, showLoading: boolean) {
      const requestId = ++profileRequestId
      if (showLoading) setLoading(true)
      try {
        await applyProfile(userId)
      } finally {
        if (requestId === profileRequestId && showLoading) setLoading(false)
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadedForUserId = session.user.id
        void loadProfile(session.user.id, true)
      } else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      const action = planAuthStateChange({
        event,
        hasUser: Boolean(session?.user),
        userId: session?.user?.id ?? null,
        loadedForUserId,
      })
      if (action === 'clear') {
        loadedForUserId = null
        setProfile(null)
        setAreaRoles(null)
        return
      }
      if (!session?.user) return
      if (action === 'full-reload') {
        loadedForUserId = session.user.id
        void loadProfile(session.user.id, true)
        return
      }
      if (action === 'soft-reload') {
        void loadProfile(session.user.id, false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const roles = profile?.roles ?? []
  const { isAdmin, isSachbearbeiter, isGenehmiger, isStrictAdmin } = flagsFromRoles(roles)
  const mustChangePassword = shouldForcePasswordChange({
    forcePasswordChange: user?.user_metadata?.force_password_change === true,
    email: user?.email,
    username: profile?.username,
  })
  // Nur Profilstand: gültiger PC-Name + force_username_set false bleibt Username-fertig,
  // auch wenn Auth-Metadata nach einem fehlgeschlagenen updateUser noch das Flag trägt.
  // Leerer Username / dn{N} bleibt Erstlogin-pflichtig (wie bisher).
  const mustSetUsername = Boolean(user && profile && shouldForceUsernameSet({
    forceUsernameSet: profile.force_username_set === true,
    username: profile.username,
    email: user.email,
  }))
  const availableRoles: AppRole[] = availableRolesFromFlags({ isAdmin, isSachbearbeiter, isGenehmiger, isStrictAdmin })

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setAreaRoles(null)
  }

  const hasAreaAccess = (area: PortalArea) =>
    hasAreaEntitlement({ area, isStrictAdmin, isGenehmiger, rows: areaRoles })

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isStrictAdmin, isSachbearbeiter, isGenehmiger, mustChangePassword, mustSetUsername, availableRoles, authError, areaRoles, hasAreaAccess, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- Hook gehört zum Provider
export const useAuth = () => useContext(AuthContext)
