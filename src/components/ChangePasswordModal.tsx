import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { USERNAME_RE, isDnPlaceholderUsername, isValidPersonalPassword, sanitizePcUsername } from '../lib/workflow'

// Erstlogin: nicht schließbar. Passwort und/oder PC-Benutzername je nach Flag.
// Nach updateUser (USER_UPDATED) und Profil-Update verschwindet das Modal.
export default function ChangePasswordModal() {
  const { user, profile, mustChangePassword, mustSetUsername, refreshProfile } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [username, setUsername] = useState(
    profile?.username && !isDnPlaceholderUsername(profile.username) ? profile.username : '',
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const title = mustChangePassword && mustSetUsername
    ? 'Erstes Anmelden'
    : mustSetUsername
      ? 'PC-Benutzername festlegen'
      : 'Passwort festlegen'
  const intro = mustChangePassword && mustSetUsername
    ? 'Bitte lege ein persönliches Passwort fest und trage deinen Windows-/PC-Anmeldenamen ein.'
    : mustSetUsername
      ? 'Bitte trage deinen Windows-/PC-Anmeldenamen ein (ohne Domäne).'
      : 'Bitte lege beim ersten Login ein persönliches Passwort fest.'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const pcName = mustSetUsername ? sanitizePcUsername(username) : ''
    if (mustChangePassword) {
      if (!isValidPersonalPassword(password)) {
        setError('Passwort muss mindestens 8 Zeichen haben und mindestens eine Zahl und einen Großbuchstaben enthalten.')
        return
      }
      if (password !== confirm) { setError('Passwörter stimmen nicht überein.'); return }
    }
    if (mustSetUsername) {
      if (isDnPlaceholderUsername(pcName)) {
        setError('PC-Benutzername darf nicht die Dienstnummer sein. Bitte den Windows-Anmeldenamen eintragen.')
        return
      }
      if (!pcName || !USERNAME_RE.test(pcName)) {
        setError('PC-Benutzername: nur Kleinbuchstaben, Zahlen, Punkt, Bindestrich und Unterstrich. Ohne Domäne (nicht STADT\\name).')
        return
      }
    }
    if (!user) { setError('Nicht angemeldet.'); return }
    setSaving(true)
    if (mustSetUsername) {
      const { error: profileErr } = await supabase.from('profiles').update({
        username: pcName,
        force_username_set: false,
      }).eq('id', user.id)
      if (profileErr) {
        const unique = /unique|duplicate|already/i.test(profileErr.message)
        setError(unique
          ? 'Dieser PC-Benutzername ist bereits vergeben.'
          : 'PC-Benutzername konnte nicht gespeichert werden. Bitte Verwaltung informieren.')
        setSaving(false)
        return
      }
    }
    const payload: { password?: string; data: Record<string, unknown> } = {
      data: {
        force_password_change: false,
        force_username_set: false,
      },
    }
    if (mustChangePassword) payload.password = password
    if (mustSetUsername) payload.data.username = pcName
    const { error: authErr } = await supabase.auth.updateUser(payload)
    if (authErr) { setError(authErr.message); setSaving(false); return }
    await refreshProfile()
    setSaving(false)
  }

  const submitLabel = mustChangePassword && mustSetUsername
    ? 'Konto einrichten'
    : mustSetUsername
      ? 'PC-Benutzername speichern'
      : 'Passwort festlegen'

  return (
    <div className="fixed inset-0 bg-blue-950/90 z-[100] flex items-end sm:items-center justify-center p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[min(92dvh,40rem)] overflow-y-auto overscroll-contain p-5 sm:p-8 relative">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-blue-800 p-3 rounded-xl mb-4">
            <KeyRound className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 text-center">{title}</h2>
          <p className="text-gray-500 text-sm mt-1 text-center">
            {intro}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mustChangePassword && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Neues Passwort</label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Mindestens 8 Zeichen"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Passwort bestätigen</label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="••••••••"
                />
              </div>
            </>
          )}
          {mustSetUsername && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PC-Benutzername</label>
              <input
                type="text"
                required
                autoFocus={!mustChangePassword}
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="z. B. hschwendinger"
              />
              <p className="text-xs text-gray-500 mt-1">
                Windows-Anmeldename ohne Domäne (sAMAccountName). Groß/Klein wird vereinheitlicht.
              </p>
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-60 text-sm"
          >
            {saving ? 'Wird gespeichert...' : submitLabel}
          </button>
        </form>
      </div>
    </div>
  )
}
