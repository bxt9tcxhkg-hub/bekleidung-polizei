import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { resolveLoginEmail } from '../lib/workflow'
import { isSupabaseConfigured } from '../lib/supabase'

export default function Login() {
  const { user, authError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const resolved = resolveLoginEmail(email)
    if (!resolved.ok) {
      setError(resolved.error)
      return
    }
    setLoading(true)
    const { data, error: signErr } = await supabase.auth.signInWithPassword({
      email: resolved.email,
      password,
    })
    if (signErr || !data.user) {
      setError('Ungültige E-Mail oder Passwort')
      setLoading(false)
      return
    }
    const { data: prof } = await supabase.from('profiles').select('active').eq('id', data.user.id).single()
    if (!prof || !prof.active) {
      await supabase.auth.signOut()
      setError(prof ? 'Dieses Konto ist deaktiviert. Bitte wende dich an die Verwaltung.' : 'Kein Profil gefunden. Bitte wende dich an die Verwaltung.')
      setLoading(false)
      return
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-800 flex items-end sm:items-center justify-center p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[min(92dvh,40rem)] overflow-y-auto overscroll-contain p-5 sm:p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 h-14 w-14 rounded-xl bg-white p-1 flex items-center justify-center">
            <img
              src="/wappen-dornbirn.svg"
              alt="Wappen der Stadt Dornbirn"
              className="h-full w-auto"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Stadtpolizei Dornbirn</h1>
          <p className="text-gray-500 text-sm mt-1">Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
            <input
              type="text"
              required
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="vorname.nachname@dornbirn.at"
            />
            <p className="text-xs text-gray-500 mt-1">
              Beamte: Stadt-E-Mail. Admin: Benutzername admin. Der PC-Anmeldename ist nicht der Login.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="••••••••"
            />
          </div>

          {!isSupabaseConfigured && (
            <p className="text-sm text-amber-800 bg-amber-50 px-3 py-2 rounded-lg">
              Die App ist nicht konfiguriert (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Bitte Umgebungsvariablen setzen und neu bauen.
            </p>
          )}

          {(error || authError) && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error || authError}</p>
          )}

          <button
            type="submit"
            disabled={loading || !isSupabaseConfigured}
            className="w-full bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-60 text-sm"
          >
            {loading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  )
}
