import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

export type AppRole = 'user' | 'sachbearbeiter' | 'genehmiger'

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
  refreshProfile: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

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
      return false
    }
    if (!data.active) {
      setAuthError('Dieses Konto ist deaktiviert. Bitte wende dich an die Verwaltung.')
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
      return false
    }
    setAuthError('')
    setProfile(data)
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
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const roles = profile?.roles ?? []
  const isSachbearbeiter = roles.includes('admin') || roles.includes('sachbearbeiter')
  const isGenehmiger = roles.includes('admin') || roles.includes('genehmiger') || roles.includes('approver')
  const isAdmin = isSachbearbeiter
  const isStrictAdmin = roles.includes('admin')
  const mustChangePassword = user?.user_metadata?.force_password_change === true

  const availableRoles: AppRole[] = [
    'user',
    ...(isSachbearbeiter ? ['sachbearbeiter' as AppRole] : []),
    ...(isGenehmiger ? ['genehmiger' as AppRole] : []),
  ]

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isStrictAdmin, isSachbearbeiter, isGenehmiger, mustChangePassword, availableRoles, authError, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- Hook gehört zum Provider
export const useAuth = () => useContext(AuthContext)
