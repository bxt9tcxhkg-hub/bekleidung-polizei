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
  isSachbearbeiter: boolean
  isGenehmiger: boolean
  availableRoles: AppRole[]
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isSachbearbeiter: false,
  isGenehmiger: false,
  availableRoles: [],
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) setProfile(data)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const roles = profile?.roles ?? []
  const isSachbearbeiter = roles.includes('admin') || roles.includes('sachbearbeiter')
  const isGenehmiger = roles.includes('genehmiger')
  const isAdmin = isSachbearbeiter

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
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isSachbearbeiter, isGenehmiger, availableRoles, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
