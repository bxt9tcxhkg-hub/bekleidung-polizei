import { useEffect, useState } from 'react'
import { Plus, Pencil, X, Shield, User, UserX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

const emptyForm = () => ({ name: '', username: '', dienstnummer: '', roles: ['user'] as string[], active: true })

export default function Users() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('name')
    setUsers(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setForm(emptyForm())
    setEditId(null)
    setError('')
    setShowForm(true)
  }

  function openEdit(u: Profile) {
    setForm({ name: u.name, username: u.username, dienstnummer: u.dienstnummer ?? '', roles: u.roles, active: u.active })
    setEditId(u.id)
    setError('')
    setShowForm(true)
  }

  async function save() {
    setError('')
    if (!form.name || !form.username) { setError('Name und Benutzername sind Pflicht.'); return }
    setSaving(true)
    const payload = { name: form.name, username: form.username, dienstnummer: form.dienstnummer || null, roles: form.roles, active: form.active }

    if (editId) {
      const { error } = await supabase.from('profiles').update(payload).eq('id', editId)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('profiles').insert({ ...payload, id: crypto.randomUUID() })
      if (error) { setError(error.message); setSaving(false); return }
    }

    setSaving(false)
    setShowForm(false)
    load()
  }

  async function toggleActive(u: Profile) {
    await supabase.from('profiles').update({ active: !u.active }).eq('id', u.id)
    load()
  }

  async function deleteUser(u: Profile) {
    if (!confirm(`Benutzer "${u.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return
    const { error } = await supabase.from('profiles').delete().eq('id', u.id)
    if (error) {
      // Wenn FK-Constraint (Benutzer hat Bestellungen), nur deaktivieren
      await supabase.from('profiles').update({ active: false }).eq('id', u.id)
    }
    load()
  }

  function toggleRole(role: string) {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
    }))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Benutzer</h1>
          <p className="text-gray-500 text-sm mt-1">Benutzerverwaltung</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Neuer Benutzer
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Benutzername</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Dienstnummer</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Rollen</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${u.roles.includes('admin') ? 'bg-blue-100' : 'bg-gray-100'}`}>
                        {u.roles.includes('admin') ? <Shield className="w-3.5 h-3.5 text-blue-700" /> : <User className="w-3.5 h-3.5 text-gray-500" />}
                      </div>
                      <span className="font-medium text-gray-900">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{u.username}</td>
                  <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{u.dienstnummer ?? '–'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {u.roles.map(r => (
                        <span key={r} className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{r}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(u)} className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${u.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {u.active ? 'Aktiv' : 'Inaktiv'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(u)} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteUser(u)} className="p-1.5 hover:bg-red-50 rounded-md text-red-400 hover:text-red-600">
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">{editId ? 'Benutzer bearbeiten' : 'Neuer Benutzer'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Benutzername *</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Dienstnummer</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.dienstnummer} onChange={e => setForm(f => ({ ...f, dienstnummer: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Rollen</label>
                <div className="flex gap-3">
                  {['user', 'admin'].map(role => (
                    <label key={role} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} className="rounded" />
                      <span className="text-sm text-gray-700 capitalize">{role}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="active" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="rounded" />
                <label htmlFor="active" className="text-sm text-gray-700">Aktiv</label>
              </div>
              {!editId && (
                <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                  Das Profil wird angelegt. Der Benutzer muss sich danach mit diesem Benutzernamen einloggen – die Authentifizierung wird über Supabase Auth verknüpft.
                </p>
              )}
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={save} disabled={saving} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Speichern...' : editId ? 'Speichern' : 'Anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
