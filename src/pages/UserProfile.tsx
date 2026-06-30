import { useEffect, useState } from 'react'
import { UserCircle, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function UserProfile() {
  const { profile, isStrictAdmin } = useAuth()
  const [form, setForm] = useState({ name: '', dienstnummer: '', gender: 'male' as 'male' | 'female' })
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile) {
      setForm({ name: profile.name ?? '', dienstnummer: profile.dienstnummer ?? '', gender: profile.gender ?? 'male' })
    }
  }, [profile])

  async function save() {
    setError('')
    setSuccess(false)
    if (!form.name.trim()) { setError('Name ist ein Pflichtfeld.'); return }
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ name: form.name.trim(), dienstnummer: form.dienstnummer.trim() || null, gender: form.gender })
      .eq('id', profile!.id)
    if (error) setError(error.message)
    else setSuccess(true)
    setSaving(false)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mein Profil</h1>
        <p className="text-gray-500 text-sm mt-1">Persönliche Daten bearbeiten</p>
      </div>

      <div className="max-w-md">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100 bg-gray-50">
            <div className="bg-blue-100 p-3 rounded-full">
              <UserCircle className="w-6 h-6 text-blue-700" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{profile?.name || profile?.username}</p>
              <p className="text-xs text-gray-500">{profile?.username}</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Vor- und Nachname"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Dienstnummer</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.dienstnummer}
                onChange={e => setForm(f => ({ ...f, dienstnummer: e.target.value }))}
                placeholder="z. B. 1234"
              />
            </div>
            {!isStrictAdmin && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Geschlecht</label>
              <div className="flex gap-2">
                {(['male', 'female'] as const).map(g => (
                  <button key={g} type="button" onClick={() => setForm(f => ({ ...f, gender: g }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.gender === g ? (g === 'male' ? 'bg-blue-700 text-white border-blue-700' : 'bg-pink-600 text-white border-pink-600') : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                    {g === 'male' ? 'Männlich' : 'Weiblich'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Bestimmt welche Produkte im Katalog angezeigt werden (Herren-, Damen- und Unisex-Artikel)</p>
            </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Organisation</label>
              <p className="text-sm text-gray-700 px-3 py-2 bg-gray-50 rounded-lg">{profile?.organisation ?? 'Stadtpolizei'}</p>
            </div>
            <div className="pt-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Benutzername</label>
              <p className="text-sm text-gray-500 px-3 py-2 bg-gray-50 rounded-lg">{profile?.username}</p>
              <p className="text-xs text-gray-400 mt-1">Benutzername kann nicht geändert werden</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rollen</label>
              <div className="flex gap-2 flex-wrap">
                {(profile?.roles ?? []).map(r => (
                  <span key={r} className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 capitalize">{r}</span>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            {success && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">Profil gespeichert.</p>}
          </div>

          <div className="px-6 py-4 border-t border-gray-100">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white font-medium px-5 py-2 rounded-lg text-sm disabled:opacity-60 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
