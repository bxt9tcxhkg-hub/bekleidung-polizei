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
  // isSachbearbeiter/isGenehmiger sind für Fähigkeiten (Bearbeiten, Bestätigen,
  // Sachbearbeiter/Genehmiger-Sidebar-Abschnitte) gedacht - sie gelten nur,
  // solange operativeModeActive an ist ("kein Dauerzustand", siehe unten).
  isSachbearbeiter: boolean
  isGenehmiger: boolean
  // Ungegatete Fassung von isGenehmiger, ausschließlich für Zugriffs-/
  // Sichtbarkeitsentscheidungen (welche Bereiche/Kacheln sieht die Person
  // überhaupt) - die bleiben immer bestehen, unabhängig vom Modus, weil
  // Genehmiger/Sachbearbeiter eines Bereichs automatisch auch dessen
  // Benutzer sind (höhere Rolle schließt die niedrigere ein).
  isGenehmigerEntitlement: boolean
  // Sachbearbeiter/Genehmiger sind für die Dauer ihrer Tätigkeit gedacht,
  // kein Dauerzustand: standardmäßig (nach jedem Login) aus, damit die
  // Person zunächst die einfache Benutzeransicht sieht. Erst durch
  // bewusstes Umschalten werden die vollen Fähigkeiten aktiv; das
  // Zurückschalten erfolgt ebenso bewusst und nie automatisch.
  operativeModeActive: boolean
  setOperativeModeActive: (active: boolean) => void
  /** Roh: hat die Person überhaupt irgendwo (global oder in einem Bereich) eine
   * Sachbearbeiter/Genehmiger-Rolle - steuert, ob der Umschalter in der Sidebar
   * überhaupt angezeigt wird (für reine Benutzer gibt es nichts umzuschalten). */
  hasElevatedRole: boolean
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
  isGenehmigerEntitlement: false,
  operativeModeActive: false,
  setOperativeModeActive: () => {},
  hasElevatedRole: false,
  mustChangePassword: false,
  mustSetUsername: false,
  availableRoles: [],
  authError: '',
  areaRoles: null,
  hasAreaAccess: () => false,
  refreshProfile: async () => {},
  signOut: async () => {},
})

function operativeModeStorageKey(userId: string) { return `operativeMode:${userId}` }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [areaRoles, setAreaRoles] = useState<AreaRoleSnapshot[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [operativeModeActive, setOperativeModeActiveState] = useState(false)
  const profileRequestIdRef = useRef(0)

  // Überlebt einen versehentlichen Seitenneuladen während der Schicht (sessionStorage,
  // je Konto), ist aber nie ein Dauerzustand: bei jedem frischen Login (kein
  // gespeicherter Wert für dieses Konto in diesem Tab) startet die Ansicht als
  // einfacher Benutzer, das bewusste Umschalten ist stets ein eigener Schritt.
  function setOperativeModeActive(active: boolean, userId?: string) {
    setOperativeModeActiveState(active)
    const id = userId ?? user?.id
    if (!id) return
    try { sessionStorage.setItem(operativeModeStorageKey(id), active ? '1' : '0') } catch { /* z. B. privater Modus - dann eben nicht persistent */ }
  }
  function restoreOperativeMode(userId: string) {
    let stored: string | null = null
    try { stored = sessionStorage.getItem(operativeModeStorageKey(userId)) } catch { /* siehe oben */ }
    setOperativeModeActiveState(stored === '1')
  }

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
    restoreOperativeMode(userId)
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
        setOperativeModeActiveState(false)
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
  // rawIsSachbearbeiter/rawIsGenehmiger = tatsächlich verliehene Rollen, unabhängig
  // vom aktuellen Modus. isStrictAdmin bleibt bewusst immer roh: Admin ist eine
  // eigene, dauerhafte Systemrolle (Nutzerverwaltung etc.), kein Schichtdienst
  // wie Sachbearbeiter/Genehmiger, und wird vom Umschalter nicht berührt.
  const { isAdmin, isSachbearbeiter: rawIsSachbearbeiter, isGenehmiger: rawIsGenehmiger, isStrictAdmin } = flagsFromRoles(roles)
  // Sachbearbeiter/Genehmiger sind kein Dauerzustand: die nach außen gereichten
  // Fähigkeits-Flags gelten nur, solange operativeModeActive an ist. isGenehmigerEntitlement
  // bleibt roh für Zugriffs-/Sichtbarkeitsentscheidungen (siehe hasAreaAccess unten).
  const isSachbearbeiter = operativeModeActive && rawIsSachbearbeiter
  const isGenehmiger = operativeModeActive && rawIsGenehmiger
  // Für den Umschalter in der Sidebar: hat die Person überhaupt irgendwo eine
  // Sachbearbeiter/Genehmiger-Rolle (global oder in mindestens einem Bereich)?
  const hasElevatedRole = rawIsSachbearbeiter || rawIsGenehmiger
    || (areaRoles ?? []).some(row => row.roles.some(role => ['sachbearbeiter', 'admin', 'genehmiger', 'approver'].includes(role)))
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
  // Basiert bewusst auf den rohen Rollen (welche Rollen die Person überhaupt
  // innehat), nicht auf dem aktuell aktiven Modus.
  const availableRoles: AppRole[] = availableRolesFromFlags({ isAdmin, isSachbearbeiter: rawIsSachbearbeiter, isGenehmiger: rawIsGenehmiger, isStrictAdmin })

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setAreaRoles(null)
    setOperativeModeActiveState(false)
  }

  // Zugriff/Sichtbarkeit bleibt immer auf den rohen Rollen - unabhängig vom
  // Modus, sonst würde ein Genehmiger im Benutzer-Modus Bereiche verlieren,
  // in denen er nur über den Genehmiger-Bonus (ohne eigene Benutzer-Zeile)
  // drin ist. Siehe isGenehmigerEntitlement-Kommentar oben.
  const hasAreaAccess = (area: PortalArea) =>
    hasAreaEntitlement({ area, isStrictAdmin, isGenehmiger: rawIsGenehmiger, rows: areaRoles })

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isStrictAdmin, isSachbearbeiter, isGenehmiger, isGenehmigerEntitlement: rawIsGenehmiger, operativeModeActive, setOperativeModeActive, hasElevatedRole, mustChangePassword, mustSetUsername, availableRoles, authError, areaRoles, hasAreaAccess, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- Hook gehört zum Provider
export const useAuth = () => useContext(AuthContext)
