import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, X, Shield, User, UserX, Upload, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth as _useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import type { Profile } from '../lib/types'
import { parseCsvUsers, rowToUser, type ImportUser } from '../lib/csvUsers'
import { USERNAME_RE, canCreateUsers, canDeactivateUsers } from '../lib/workflow'
import {
  AREA_ROLE_LABELS,
  defaultEinsatzMtRoleForNewUser,
  parseEinsatzMtRole,
  profilesRolesFromBekleidung,
  type EinsatzMtRole,
} from '../lib/portalEntitlements'

const CSV_TEMPLATE = `name;benutzername;dienstnummer;organisation;rollen
Max Mustermann;mmustermann;1234;Stadtpolizei;user
Maria Muster;mmuster;5678;Parkaufsicht;user|genehmiger`

/** Zufälliges Initialpasswort: 10 Zeichen, mind. 1 Großbuchstabe und 1 Zahl. */
function generateInitialPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const all = 'abcdefghjkmnpqrstuvwxyz' + upper + digits
  const pick = (chars: string) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length]
  const out = [pick(upper), pick(digits)]
  while (out.length < 10) out.push(pick(all))
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out.join('')
}

const ORGS = ['Stadtpolizei', 'Parkaufsicht'] as const
const EINSATZ_MT_OPTIONS: { value: EinsatzMtRole | ''; label: string }[] = [
  { value: 'user', label: AREA_ROLE_LABELS.user },
  { value: 'sachbearbeiter', label: AREA_ROLE_LABELS.sachbearbeiter },
  { value: 'admin', label: AREA_ROLE_LABELS.admin },
  { value: '', label: 'Kein Zugriff' },
]
const BEKLEIDUNG_ROLE_LABEL: Record<string, string> = {
  user: 'Benutzer',
  sachbearbeiter: 'Sachbearbeiter',
  admin: 'Admin',
  genehmiger: 'Genehmiger',
  approver: 'Genehmiger',
}
const BEKLEIDUNG_ROLE_COLOR: Record<string, string> = {
  user: 'bg-gray-100 text-gray-600',
  sachbearbeiter: 'bg-blue-100 text-blue-700',
  admin: 'bg-purple-100 text-purple-700',
  genehmiger: 'bg-green-100 text-green-700',
  approver: 'bg-green-100 text-green-700',
}

type AreaRolesByUser = Record<string, { bekleidung?: string[]; einsatz_mt?: string[] }>

const emptyForm = () => ({
  name: '',
  username: '',
  initialPassword: '',
  dienstnummer: '',
  roles: ['user'] as string[],
  einsatzMtRole: defaultEinsatzMtRoleForNewUser() as EinsatzMtRole | '',
  gender: 'male' as 'male' | 'female',
  organisation: 'Stadtpolizei' as string,
  active: true,
})

async function persistAreaRoles(
  userId: string,
  bekleidungRoles: string[],
  einsatzMt: EinsatzMtRole | '',
): Promise<string | null> {
  const { error: bekErr } = await supabase.from('portal_area_roles').upsert({
    user_id: userId,
    area: 'bekleidung',
    roles: profilesRolesFromBekleidung(bekleidungRoles),
  })
  if (bekErr) return bekErr.message
  if (einsatzMt) {
    const { error } = await supabase.from('portal_area_roles').upsert({
      user_id: userId,
      area: 'einsatz_mt',
      roles: [einsatzMt],
    })
    return error?.message ?? null
  }
  const { error } = await supabase.from('portal_area_roles').delete().eq('user_id', userId).eq('area', 'einsatz_mt')
  return error?.message ?? null
}

export default function Users() {
  const { isStrictAdmin, isGenehmiger, isSachbearbeiter, profile: authProfile } = _useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [areaByUser, setAreaByUser] = useState<AreaRolesByUser>({})
  const [orgFilter, setOrgFilter] = useState<'all' | 'Stadtpolizei' | 'Parkaufsicht'>('all')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<ImportUser[]>([])
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; err: number } | null>(null)
  const [importCreds, setImportCreds] = useState<{ username: string; password: string }[]>([])
  const [credsCopied, setCredsCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const callerRoles = authProfile?.roles ?? []
  const canCreate = canCreateUsers(callerRoles)
  const canDeactivate = canDeactivateUsers(callerRoles)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('name')
    setUsers(data ?? [])
    const { data: areas } = await supabase.from('portal_area_roles').select('user_id, area, roles')
    const map: AreaRolesByUser = {}
    for (const row of areas ?? []) {
      const current = map[row.user_id] ?? {}
      if (row.area === 'bekleidung') current.bekleidung = row.roles
      if (row.area === 'einsatz_mt') current.einsatz_mt = row.roles
      map[row.user_id] = current
    }
    setAreaByUser(map)
    setLoading(false)
  }

  useEffect(() => { load().catch(() => setError('Benutzer konnten nicht geladen werden.')) }, [])

  const isSelfEdit = editId === authProfile?.id

  function canAssignRole(role: string) {
    if (role === 'admin') return isStrictAdmin
    if (role === 'genehmiger') return isStrictAdmin || isGenehmiger
    if (role === 'sachbearbeiter') return isStrictAdmin || isSachbearbeiter
    return true
  }

  function openNew() {
    setForm(emptyForm())
    setEditId(null)
    setError('')
    setShowForm(true)
  }

  function openEdit(u: Profile) {
    setForm({
      name: u.name,
      username: u.username,
      initialPassword: '',
      dienstnummer: u.dienstnummer ?? '',
      roles: u.roles,
      einsatzMtRole: parseEinsatzMtRole(areaByUser[u.id]?.einsatz_mt) ?? '',
      gender: u.gender ?? 'male',
      organisation: u.organisation ?? 'Stadtpolizei',
      active: u.active,
    })
    setEditId(u.id)
    setError('')
    setShowForm(true)
  }

  async function save() {
    setError('')
    if (!form.name || !form.username.trim()) { setError('Name und Benutzername sind Pflicht.'); return }
    const username = form.username.trim().toLowerCase()
    if (!USERNAME_RE.test(username)) { setError('Benutzername darf nur Kleinbuchstaben, Zahlen, Punkt, Bindestrich und Unterstrich enthalten.'); return }
    if (!editId && !form.initialPassword) { setError('Initiales Passwort ist Pflicht.'); return }
    if (!editId && (form.initialPassword.length < 8 || !/[0-9]/.test(form.initialPassword) || !/[A-Z]/.test(form.initialPassword))) {
      setError('Initiales Passwort muss mindestens 8 Zeichen haben und mindestens eine Zahl und einen Großbuchstaben enthalten.'); return
    }
    setSaving(true)
    // Bereits vorhandene Rollen bleiben erhalten – nur NEU hinzugefügte Rollen unterliegen der Berechtigungsprüfung.
    const existingRoles = editId ? (users.find(u => u.id === editId)?.roles ?? []) : []
    let safeRoles = form.roles.filter(r => existingRoles.includes(r) || canAssignRole(r))
    if (safeRoles.length === 0) safeRoles = ['user']
    const existingActive = editId ? (users.find(u => u.id === editId)?.active ?? true) : form.active
    const active = editId && !canDeactivate ? existingActive : form.active
    const dbPayload = { name: form.name, username, dienstnummer: form.dienstnummer || null, roles: safeRoles, gender: form.gender, organisation: form.organisation, active }

    if (editId) {
      const { error } = await supabase.from('profiles').update(dbPayload).eq('id', editId)
      if (error) { setError(error.message); setSaving(false); return }
      if (isStrictAdmin && !isSelfEdit) {
        const areaErr = await persistAreaRoles(editId, safeRoles, form.einsatzMtRole)
        if (areaErr) { setError(areaErr); setSaving(false); return }
      }
      logAudit('Benutzer bearbeitet', username)
    } else {
      if (!canCreate) { setError('Keine Berechtigung zum Anlegen.'); setSaving(false); return }
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ ...dbPayload, initial_password: form.initialPassword }),
        })
        const json = await res.json() as { error?: string; id?: string }
        if (!res.ok) { setError(json.error ?? 'Fehler beim Anlegen'); setSaving(false); return }
        if (isStrictAdmin && json.id) {
          const areaErr = await persistAreaRoles(json.id, safeRoles, form.einsatzMtRole)
          if (areaErr) { setError(areaErr); setSaving(false); return }
        }
        logAudit('Benutzer angelegt', username)
      } catch {
        setError('Netzwerkfehler – bitte nochmals versuchen.'); setSaving(false); return
      }
    }

    setSaving(false)
    setShowForm(false)
    load()
  }

  async function toggleActive(u: Profile) {
    if (!canDeactivate) return
    const { error } = await supabase.from('profiles').update({ active: !u.active }).eq('id', u.id)
    if (error) { setError(`Status konnte nicht geändert werden: ${error.message}`); return }
    logAudit(u.active ? 'Benutzer deaktiviert' : 'Benutzer aktiviert', u.username)
    load()
  }

  // Es existiert keine 'delete-user' Edge Function – ein Löschen der profiles-Zeile
  // würde den Auth-Account verwaisen lassen. Daher wird der Benutzer nur deaktiviert.
  async function deactivateUser(u: Profile) {
    if (!canDeactivate) return
    if (!confirm(`Benutzer "${u.name}" deaktivieren?\n\nDas Konto wird nicht gelöscht, sondern nur deaktiviert. Es kann jederzeit wieder aktiviert werden.`)) return
    const { error } = await supabase.from('profiles').update({ active: false }).eq('id', u.id)
    if (error) { setError(`Benutzer konnte nicht deaktiviert werden: ${error.message}`); return }
    logAudit('Benutzer deaktiviert', u.username)
    setError('')
    load()
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const isExcel = file.name.match(/\.(xlsx|xls|ods)$/i)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        let rawRows: Record<string, string>[]
        if (isExcel) {
          const wb = XLSX.read(ev.target?.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          rawRows = (XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[])
            .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), String(v ?? '')])))
        } else {
          rawRows = parseCsvUsers(ev.target?.result as string)
        }
        const rows = rawRows.map(rowToUser).filter(Boolean) as ImportUser[]
        if (rows.length === 0) { setImportError('Keine gültigen Zeilen gefunden. Spalten prüfen.'); return }
        setImportError('')
        setImportRows(rows)
        setImportProgress(null)
      } catch {
        setImportError('Datei konnte nicht gelesen werden.')
      }
    }
    if (isExcel) reader.readAsArrayBuffer(file)
    else reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  async function runImport() {
    if (!canCreate) return
    setImporting(true)
    setImportCreds([])
    setCredsCopied(false)
    const { data: { session } } = await supabase.auth.getSession()
    let done = 0, err = 0
    const creds: { username: string; password: string }[] = []
    setImportProgress({ done: 0, total: importRows.length, err: 0 })
    for (const row of importRows) {
      const password = generateInitialPassword()
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ name: row.name, username: row.username, dienstnummer: row.dienstnummer || null, organisation: row.organisation, roles: row.roles, initial_password: password }),
        })
        if (res.ok) { done++; creds.push({ username: row.username, password }) } else err++
      } catch {
        err++
      }
      setImportProgress({ done: done + err, total: importRows.length, err })
    }
    setImportCreds(creds)
    setImporting(false)
    setImportRows([])
    if (done > 0) logAudit('Benutzer importiert', `${done} Benutzer`)
    load()
  }

  async function copyCreds() {
    const text = importCreds.map(c => `${c.username}\t${c.password}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCredsCopied(true)
    } catch {
      setImportError('Kopieren nicht möglich – bitte Liste manuell übertragen.')
    }
  }

  function toggleRole(role: string) {
    if (isSelfEdit) return
    if (!canAssignRole(role)) return
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
    }))
  }

  return (
    <div>
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Benutzer</h1>
          <p className="text-gray-500 text-sm mt-1">Portal-Benutzerverwaltung</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {canCreate && (
            <button onClick={() => { setShowImport(true); setImportRows([]); setImportProgress(null); setImportError(''); setImportCreds([]); setCredsCopied(false) }} className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg hover:bg-gray-50 transition-colors" title="Import">
              <Upload className="w-4 h-4 flex-shrink-0" /><span className="hidden sm:inline">Import</span>
            </button>
          )}
          {canCreate && (
            <button onClick={openNew} className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors" title="Neuer Benutzer">
              <Plus className="w-4 h-4 flex-shrink-0" /><span className="hidden sm:inline">Neuer Benutzer</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        {(['all', 'Stadtpolizei', 'Parkaufsicht'] as const).map(o => (
          <button key={o} onClick={() => setOrgFilter(o)}
            className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-all ${orgFilter === o ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {o === 'all' ? 'Alle' : o}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Benutzername</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Dienstnummer</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Organisation</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Geschlecht</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Bekleidung</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Einsatzmittel &amp; Training</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.filter(u => orgFilter === 'all' || u.organisation === orgFilter).map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${u.roles.includes('admin') ? 'bg-purple-100' : u.roles.includes('sachbearbeiter') || u.roles.includes('genehmiger') ? 'bg-blue-100' : 'bg-gray-100'}`}>
                        {u.roles.includes('admin') || u.roles.includes('sachbearbeiter') || u.roles.includes('genehmiger') ? <Shield className={`w-3.5 h-3.5 ${u.roles.includes('admin') ? 'text-purple-700' : 'text-blue-700'}`} /> : <User className="w-3.5 h-3.5 text-gray-500" />}
                      </div>
                      <span className="font-medium text-gray-900 truncate max-w-xs">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{u.username}</td>
                  <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{u.dienstnummer ?? '–'}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.organisation === 'Parkaufsicht' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                      {u.organisation ?? 'Stadtpolizei'}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {!u.roles.includes('admin') && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.gender === 'female' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                        {u.gender === 'female' ? 'Weiblich' : 'Männlich'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {u.roles.map(r => (
                        <span key={r} className={`text-xs font-medium px-2 py-0.5 rounded-full ${BEKLEIDUNG_ROLE_COLOR[r] ?? 'bg-gray-100 text-gray-600'}`}>
                          {BEKLEIDUNG_ROLE_LABEL[r] ?? r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {(() => {
                      const emRoles = areaByUser[u.id]?.einsatz_mt
                      const em = parseEinsatzMtRole(emRoles)
                      if (em) {
                        return (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BEKLEIDUNG_ROLE_COLOR[em] ?? 'bg-gray-100 text-gray-600'}`}>
                            {AREA_ROLE_LABELS[em]}
                          </span>
                        )
                      }
                      if (isStrictAdmin || emRoles) {
                        return <span className="text-xs text-gray-400">Kein Zugriff</span>
                      }
                      return <span className="text-xs text-gray-400">–</span>
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {canDeactivate ? (
                      <button onClick={() => toggleActive(u)} className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${u.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {u.active ? 'Aktiv' : 'Inaktiv'}
                      </button>
                    ) : (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.active ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(u)} className="p-2 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {canDeactivate && (
                        <button onClick={() => deactivateUser(u)} title="Deaktivieren" className="p-2 hover:bg-red-50 rounded-md text-red-400 hover:text-red-600 disabled:opacity-30" disabled={!u.active}>
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Benutzer importieren (CSV)</h2>
              <button onClick={() => setShowImport(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              <div className="bg-gray-50 rounded-xl p-4 text-xs font-mono text-gray-600 space-y-1">
                <p className="font-semibold text-gray-700 font-sans text-xs mb-2">Format (Semikolon-getrennt, Rollen mit |):</p>
                <p>name;benutzername;dienstnummer;organisation;rollen</p>
                <p>Max Mustermann;mmustermann;1234;Stadtpolizei;user</p>
                <p>Maria Muster;mmuster;5678;Parkaufsicht;user|genehmiger</p>
                <p className="font-sans text-gray-500 mt-2">Für jeden Benutzer wird automatisch ein zufälliges Initialpasswort erzeugt und nach dem Import einmalig angezeigt.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
                  <Upload className="w-4 h-4" /> CSV-Datei wählen
                </button>
                <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`} download="benutzer-vorlage.csv" className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
                  <Download className="w-4 h-4" /> Vorlage herunterladen
                </a>
                <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls,.ods" className="hidden" onChange={handleFile} />
              </div>
              {importError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{importError}</p>}
              {importProgress && (
                <p className={`text-sm px-3 py-2 rounded-lg ${importProgress.err === 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                  {importProgress.done}/{importProgress.total} verarbeitet{importProgress.err > 0 ? `, ${importProgress.err} Fehler` : ''}
                  {importProgress.done === importProgress.total ? ' – abgeschlossen.' : ' …'}
                </p>
              )}
              {importCreds.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-amber-800">Initialpasswörter – werden nur einmal angezeigt!</p>
                  <p className="text-xs text-amber-700">Bitte jetzt kopieren oder notieren und an die Benutzer verteilen. Jeder Benutzer muss das Passwort beim ersten Login ändern.</p>
                  <div className="border border-amber-200 rounded-lg overflow-hidden overflow-x-auto bg-white">
                    <table className="w-full text-xs font-mono">
                      <thead><tr className="bg-amber-100/60 border-b border-amber-200 font-sans"><th className="text-left px-3 py-2">Benutzername</th><th className="text-left px-3 py-2">Initialpasswort</th></tr></thead>
                      <tbody className="divide-y divide-amber-100">
                        {importCreds.map(c => (
                          <tr key={c.username}>
                            <td className="px-3 py-1.5">{c.username}</td>
                            <td className="px-3 py-1.5 font-semibold">{c.password}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={copyCreds} className="text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                    {credsCopied ? 'Kopiert ✓' : 'Liste kopieren'}
                  </button>
                </div>
              )}
              {importRows.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">{importRows.length} Benutzer erkannt – Vorschau:</p>
                  <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-gray-50 border-b"><th className="text-left px-3 py-2">Name</th><th className="text-left px-3 py-2">Benutzername</th><th className="text-left px-3 py-2">Organisation</th><th className="text-left px-3 py-2">DG-Nr.</th><th className="text-left px-3 py-2">Rollen</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {importRows.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium">{r.name}</td>
                            <td className="px-3 py-2">{r.username}</td>
                            <td className="px-3 py-2">{r.organisation}</td>
                            <td className="px-3 py-2">{r.dienstnummer || '–'}</td>
                            <td className="px-3 py-2">{r.roles.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowImport(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Schließen</button>
              {importRows.length > 0 && (
                <button onClick={runImport} disabled={importing} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                  {importing ? 'Importiere...' : `${importRows.length} Benutzer importieren`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
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
              {!form.roles.includes('admin') && (
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
                <p className="text-xs text-gray-400 mt-1">Bestimmt welche Produkte im Katalog angezeigt werden (Herren-, Damen- und Unisex-Artikel).</p>
              </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Organisation</label>
                <div className="flex gap-2">
                  {ORGS.map(org => (
                    <button key={org} type="button" onClick={() => setForm(f => ({ ...f, organisation: org }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.organisation === org ? (org === 'Parkaufsicht' ? 'bg-orange-600 text-white border-orange-600' : 'bg-blue-700 text-white border-blue-700') : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                      {org}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">Bestimmt welche Produkte im Katalog sichtbar sind.</p>
              </div>
              {!editId && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Initiales Passwort *</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" value={form.initialPassword} onChange={e => setForm(f => ({ ...f, initialPassword: e.target.value }))} placeholder="z.B. Vorname2025" autoComplete="off" />
                  <p className="text-xs text-gray-400 mt-1">Der Benutzer muss beim ersten Login ein neues Passwort festlegen.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Bekleidung</label>
                <div className="flex gap-3 flex-wrap">
                  {([['user', 'Benutzer'], ['sachbearbeiter', 'Sachbearbeiter'], ['admin', 'Admin'], ['genehmiger', 'Genehmiger']] as [string, string][]).map(([role, label]) => {
                    const restricted = isSelfEdit || !canAssignRole(role)
                    return (
                      <label key={role} className={`flex items-center gap-2 ${restricted ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} disabled={restricted} className="rounded disabled:cursor-not-allowed" />
                        <span className="text-sm text-gray-700">{label}</span>
                      </label>
                    )
                  })}
                </div>
                {isSelfEdit && (
                  <p className="text-xs text-amber-700 mt-1">Eigene Rollen können nicht geändert werden.</p>
                )}
                {!isSelfEdit && !isStrictAdmin && (
                  <p className="text-xs text-gray-400 mt-1">Die Admin-Rolle kann nur von Admins vergeben werden{!isGenehmiger ? ', die Genehmiger-Rolle nur von Admins oder Genehmigern' : ''}.</p>
                )}
              </div>
              {isStrictAdmin && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="einsatz-mt-role">Einsatzmittel &amp; Training</label>
                  <select
                    id="einsatz-mt-role"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    value={form.einsatzMtRole}
                    disabled={isSelfEdit}
                    onChange={e => {
                      const value = e.target.value
                      if (value === '' || value === 'user' || value === 'sachbearbeiter' || value === 'admin') {
                        setForm(f => ({ ...f, einsatzMtRole: value }))
                      }
                    }}
                  >
                    {EINSATZ_MT_OPTIONS.map(opt => (
                      <option key={opt.label} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Benutzer = Leserecht. Kein Genehmiger in diesem Bereich.</p>
                </div>
              )}
              {(!editId || canDeactivate) && (
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="active" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="rounded" />
                  <label htmlFor="active" className="text-sm text-gray-700">Aktiv</label>
                </div>
              )}
              {!canDeactivate && editId && (
                <p className="text-xs text-gray-400">Benutzer deaktivieren können nur Genehmiger.</p>
              )}
              {!editId && (
                <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                  Das Profil wird angelegt. Der Benutzer muss sich danach mit diesem Benutzernamen einloggen – die Authentifizierung wird über Supabase Auth verknüpft.
                </p>
              )}
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={save} disabled={saving} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Speichern...' : editId ? 'Speichern' : 'Anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
