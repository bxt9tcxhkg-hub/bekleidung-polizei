import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { availableRolesFromFlags, flagsFromRoles, type AppRole } from '../lib/authRoles'
import type { PortalArea } from '../lib/portalEntitlements'
import { hasAreaEntitlement } from '../lib/portalEntitlements'

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
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
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

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadedForUserId = session.user.id
        applyProfile(session.user.id).finally(() => setLoading(false))
      } else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const isInitialEvent = event === 'INITIAL_SESSION' || event === 'SIGNED_IN'
        if (isInitialEvent && loadedForUserId === session.user.id) return
        loadedForUserId = session.user.id
        setLoading(true)
        applyProfile(session.user.id).finally(() => setLoading(false))
      } else {
        loadedForUserId = null
        setProfile(null)
        setAreaRoles(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const roles = profile?.roles ?? []
  const { isAdmin, isSachbearbeiter, isGenehmiger, isStrictAdmin } = flagsFromRoles(roles)
  const mustChangePassword = user?.user_metadata?.force_password_change === true
  const availableRoles: AppRole[] = availableRolesFromFlags({ isAdmin, isSachbearbeiter, isGenehmiger, isStrictAdmin })

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setAreaRoles(null)
  }

  const hasAreaAccess = (area: PortalArea) =>
    hasAreaEntitlement({ area, isStrictAdmin, rows: areaRoles })

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isStrictAdmin, isSachbearbeiter, isGenehmiger, mustChangePassword, availableRoles, authError, areaRoles, hasAreaAccess, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- Hook gehört zum Provider
export const useAuth = () => useContext(AuthContext)
