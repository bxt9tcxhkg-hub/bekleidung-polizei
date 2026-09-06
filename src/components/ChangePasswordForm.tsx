import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { changeOwnPassword } from '../lib/changePassword'

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setSaving(true)
    const result = await changeOwnPassword(supabase.auth, {
      currentPassword,
      newPassword,
      confirmPassword,
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSuccess(true)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  return (
    <form onSubmit={e => { void handleSubmit(e) }} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100 bg-gray-50">
        <div className="bg-blue-100 p-3 rounded-full">
          <KeyRound className="w-6 h-6 text-blue-700" />
        </div>
        <div>
          <p className="font-semibold text-gray-900">Passwort ändern</p>
          <p className="text-xs text-gray-500">Aktuelles Passwort wird nicht angezeigt.</p>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="current-password">
            Aktuelles Passwort
          </label>
          <input
            id="current-password"
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="new-password">
            Neues Passwort
          </label>
          <input
            id="new-password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Mindestens 6 Zeichen"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="confirm-password">
            Neues Passwort bestätigen
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        {success && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">Passwort geändert.</p>}
      </div>

      <div className="px-6 py-4 border-t border-gray-100">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white font-medium px-5 py-2 rounded-lg text-sm disabled:opacity-60 transition-colors"
        >
          <KeyRound className="w-4 h-4" />
          {saving ? 'Wird gespeichert...' : 'Passwort ändern'}
        </button>
      </div>
    </form>
  )
}
