import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, X, Shield, User, Upload, Download, KeyRound, Printer, Search, Trash2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth as _useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import type { Profile } from '../lib/types'
import { parseCsvUsers, rowToUser, type ImportUser } from '../lib/csvUsers'
import { OFFICER_ROSTER_CSV_TEMPLATE, importUsersFromSeedJson, knownRosterImportUsers, planRosterEnsure } from '../lib/officerRoster'
import { USERNAME_RE, canCreateUsers, canDeactivateUsers, canResetUserPassword, isBoundAdminIdentity, isDnPlaceholderUsername } from '../lib/workflow'
import {
  DEFAULT_START_PASSWORD,
  START_PASSWORD_HINT,
  START_PASSWORD_REQUIRED_MESSAGE,
  buildResetPasswordRequest,
  isValidStartPassword,
  resolveImportStartPassword,
  shouldKeepForceUsernameSet,
} from '../lib/startPassword'
import {
  AREA_ROLE_LABELS,
  defaultEinsatzMtRoleForNewUser,
  defaultFuhrparkRoleForNewUser,
  defaultSchulungenRoleForNewUser,
  defaultZentraleRoleForNewUser,
  parseEinsatzMtRoles,
  parseFuhrparkRoles,
  parseSchulungenRoles,
  parseZentraleRoles,
  type EinsatzMtRole,
  type FuhrparkRole,
  type SchulungenRole,
  type ZentraleRole,
} from '../lib/portalEntitlements'

const CSV_TEMPLATE = `name;benutzername;dienstnummer;organisation;rollen
Max Mustermann;mmustermann;1234;Stadtpolizei;user
Maria Muster;mmuster;5678;Parkaufsicht;user|genehmiger`

const ORGS = ['Stadtpolizei', 'Parkaufsicht', 'Verwaltung'] as const
type Organisation = (typeof ORGS)[number]
type OrgFilter = 'all' | Organisation
type RoleFilter = 'all' | 'sachbearbeiter' | 'genehmiger' | 'admin'
const EINSATZ_MT_OPTIONS: { value: EinsatzMtRole; label: string }[] = [
  { value: 'user', label: AREA_ROLE_LABELS.user },
  { value: 'sachbearbeiter', label: AREA_ROLE_LABELS.sachbearbeiter },
]
const SCHULUNGEN_OPTIONS: { value: SchulungenRole; label: string }[] = [
  { value: 'user', label: AREA_ROLE_LABELS.user },
  { value: 'sachbearbeiter', label: AREA_ROLE_LABELS.sachbearbeiter },
]
const FUHRPARK_OPTIONS: { value: FuhrparkRole; label: string }[] = [
  { value: 'user', label: AREA_ROLE_LABELS.user },
  { value: 'sachbearbeiter', label: AREA_ROLE_LABELS.sachbearbeiter },
]
const ZENTRALE_OPTIONS: { value: ZentraleRole; label: string }[] = [
  { value: 'user', label: AREA_ROLE_LABELS.user },
  { value: 'zentralist', label: AREA_ROLE_LABELS.zentralist },
  { value: 'sachbearbeiter', label: AREA_ROLE_LABELS.sachbearbeiter },
]

const isPortalAdmin = (user: Pick<Profile, 'roles'>) => user.roles.includes('admin')
const clothingRoles = (roles: readonly string[]) => roles.filter(role => role !== 'admin')
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

type AreaRolesByUser = Record<string, { bekleidung?: string[]; einsatz_mt?: string[]; schulungen?: string[]; fuhrpark?: string[]; zentrale?: string[] }>

const emptyForm = () => ({
  name: '',
  username: '',
  initialPassword: DEFAULT_START_PASSWORD,
  dienstnummer: '',
  roles: ['user'] as string[],
  einsatzMtRoles: [defaultEinsatzMtRoleForNewUser()] as EinsatzMtRole[],
  schulungenRoles: [defaultSchulungenRoleForNewUser()] as SchulungenRole[],
  fuhrparkRoles: [defaultFuhrparkRoleForNewUser()] as FuhrparkRole[],
  zentraleRoles: [defaultZentraleRoleForNewUser()] as ZentraleRole[],
  gender: 'male' as 'male' | 'female',
  organisation: 'Stadtpolizei' as string,
  active: true,
})

export default function Users() {
  const { isStrictAdmin, isGenehmiger, isSachbearbeiter, profile: authProfile } = _useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [areaByUser, setAreaByUser] = useState<AreaRolesByUser>({})
  const [orgFilter, setOrgFilter] = useState<OrgFilter>('all')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [search, setSearch] = useState('')
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
  const [importCreds, setImportCreds] = useState<{ email: string; username: string | null; password: string }[]>([])
  const [credsCopied, setCredsCopied] = useState(false)
  const [importStartPassword, setImportStartPassword] = useState(DEFAULT_START_PASSWORD)
  const [importRandomPerUser, setImportRandomPerUser] = useState(false)
  const [resetTarget, setResetTarget] = useState<Profile | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetSaving, setResetSaving] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetCopied, setResetCopied] = useState(false)
  const [revealedStartPassword, setRevealedStartPassword] = useState<{ name: string; password: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const callerRoles = authProfile?.roles ?? []
  const canCreate = canCreateUsers(callerRoles)
  const canDeactivate = canDeactivateUsers(callerRoles)
  const canReset = canResetUserPassword(callerRoles)

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
      if (row.area === 'schulungen') current.schulungen = row.roles
      if (row.area === 'fuhrpark') current.fuhrpark = row.roles
      if (row.area === 'zentrale') current.zentrale = row.roles
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
    if (role === 'sachbearbeiter') return isStrictAdmin || isSachbearbeiter || isGenehmiger
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
      username: u.username ?? '',
      initialPassword: '',
      dienstnummer: u.dienstnummer ?? '',
      roles: u.roles,
      einsatzMtRoles: parseEinsatzMtRoles(areaByUser[u.id]?.einsatz_mt).filter(role => role !== 'admin'),
      schulungenRoles: parseSchulungenRoles(areaByUser[u.id]?.schulungen).filter(role => role !== 'admin'),
      fuhrparkRoles: parseFuhrparkRoles(areaByUser[u.id]?.fuhrpark).filter(role => role !== 'admin'),
      zentraleRoles: parseZentraleRoles(areaByUser[u.id]?.zentrale).filter(role => role !== 'admin'),
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
    if (!form.name) { setError('Name ist Pflicht.'); return }
    const username = form.username.trim().toLowerCase()
    if (username && isDnPlaceholderUsername(username)) { setError('PC-Benutzername darf nicht die Dienstnummer (dn…) sein.'); return }
    if (username && !USERNAME_RE.test(username)) { setError('PC-Benutzername darf nur Kleinbuchstaben, Zahlen, Punkt, Bindestrich und Unterstrich enthalten.'); return }
    if (!editId && !isValidStartPassword(form.initialPassword)) {
      setError(START_PASSWORD_REQUIRED_MESSAGE); return
    }
    const startPassword = form.initialPassword.trim()
    if (editId && startPassword) {
      if (!canReset) { setError('Keine Berechtigung zum Setzen des Startpassworts.'); return }
      if (!isValidStartPassword(startPassword)) { setError(START_PASSWORD_REQUIRED_MESSAGE); return }
    }
    setSaving(true)
    // Bereits vorhandene Rollen bleiben erhalten – nur NEU hinzugefügte Rollen unterliegen der Berechtigungsprüfung.
    const existing = editId ? users.find(u => u.id === editId) : undefined
    const existingRoles = existing?.roles ?? []
    const safeRoles = form.roles.filter(r => existingRoles.includes(r) || canAssignRole(r))
    const existingActive = existing?.active ?? true
    const active = editId && !canDeactivate ? existingActive : form.active
    const forceUsernameSet = shouldKeepForceUsernameSet(username || null, existing?.force_username_set)
    const dbPayload = {
      name: form.name,
      username: username || null,
      dienstnummer: form.dienstnummer || null,
      roles: safeRoles,
      gender: form.gender,
      organisation: form.organisation,
      ...((safeRoles.includes('admin') || form.organisation !== 'Stadtpolizei') ? { dienstgrad: null } : {}),
      active,
      force_username_set: forceUsernameSet,
    }

    if (editId) {
      const { error } = await supabase.rpc('save_portal_profile_v4', {
        p_user_id: editId,
        p_patch: dbPayload,
        p_einsatz_roles: isStrictAdmin && !isSelfEdit ? (safeRoles.includes('admin') ? [] : form.einsatzMtRoles) : null,
        p_schulungen_roles: isStrictAdmin && !isSelfEdit ? (safeRoles.includes('admin') ? [] : form.schulungenRoles) : null,
        p_fuhrpark_roles: isStrictAdmin && !isSelfEdit ? (safeRoles.includes('admin') ? [] : form.fuhrparkRoles) : null,
        p_zentrale_roles: isStrictAdmin && !isSelfEdit ? (safeRoles.includes('admin') ? [] : form.zentraleRoles) : null,
      })
      if (error) { setError(error.message); setSaving(false); return }
      if (startPassword) {
        const resetErr = await callResetPassword(editId, startPassword)
        if (resetErr) { setError(resetErr); setSaving(false); return }
        setRevealedStartPassword({ name: form.name, password: startPassword })
      }
      logAudit('Benutzer bearbeitet', username || form.name)
    } else {
      if (!canCreate) { setError('Keine Berechtigung zum Anlegen.'); setSaving(false); return }
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            ...dbPayload,
            initial_password: startPassword,
            einsatz_mt_roles: isStrictAdmin ? (safeRoles.includes('admin') ? [] : form.einsatzMtRoles) : undefined,
            schulungen_roles: isStrictAdmin ? (safeRoles.includes('admin') ? [] : form.schulungenRoles) : undefined,
            fuhrpark_roles: isStrictAdmin ? (safeRoles.includes('admin') ? [] : form.fuhrparkRoles) : undefined,
            zentrale_roles: isStrictAdmin ? (safeRoles.includes('admin') ? [] : form.zentraleRoles) : undefined,
          }),
        })
        const json = await res.json() as { error?: string; id?: string }
        if (!res.ok) { setError(json.error ?? 'Fehler beim Anlegen'); setSaving(false); return }
        logAudit('Benutzer angelegt', username || form.name)
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
    logAudit(u.active ? 'Benutzer deaktiviert' : 'Benutzer aktiviert', u.username ?? u.name)
    load()
  }

  async function moveUser(u: Profile, organisation: Organisation) {
    if (!isStrictAdmin || isPortalAdmin(u) || u.id === authProfile?.id || u.organisation === organisation) return
    const previous = u.organisation
    const previousDienstgrad = u.dienstgrad ?? null
    const dienstgrad = organisation === 'Stadtpolizei' ? previousDienstgrad : null
    setUsers(current => current.map(row => row.id === u.id ? { ...row, organisation, dienstgrad } : row))
    const { error: moveError } = await supabase.from('profiles').update({ organisation, dienstgrad }).eq('id', u.id)
    if (moveError) {
      setUsers(current => current.map(row => row.id === u.id ? { ...row, organisation: previous, dienstgrad: previousDienstgrad } : row))
      setError(`Organisation konnte nicht geändert werden: ${moveError.message}`)
      return
    }
    setError('')
    logAudit('Benutzer verschoben', `${u.name}: ${previous} → ${organisation}`)
  }

  async function deleteUserPermanently() {
    if (!deleteTarget || !isStrictAdmin || deleteConfirmation.trim() !== deleteTarget.name) return
    setDeleteSaving(true)
    setDeleteError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'delete_user', user_id: deleteTarget.id }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) { setDeleteError(json.error ?? 'Benutzer konnte nicht gelöscht werden.'); return }
      logAudit('Benutzer endgültig gelöscht', deleteTarget.name)
      setDeleteTarget(null)
      setDeleteConfirmation('')
      await load()
    } catch {
      setDeleteError('Netzwerkfehler – bitte nochmals versuchen.')
    } finally {
      setDeleteSaving(false)
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const isExcel = file.name.match(/\.(xlsx|xls|ods)$/i)
    const isJson = file.name.match(/\.json$/i)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        if (isJson) {
          const parsed = importUsersFromSeedJson(String(ev.target?.result ?? ''))
          if (!parsed.ok) { setImportError(parsed.error); return }
          const plan = planRosterEnsure(parsed.users, users)
          setImportRows(plan.create)
          setImportError(plan.already.length || plan.skipped.length
            ? `${plan.already.length} bereits vorhanden, ${plan.skipped.length} übersprungen.`
            : '')
          setImportProgress(null)
          return
        }
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

  async function callResetPassword(userId: string, password: string): Promise<string | null> {
    if (!canReset) return 'Keine Berechtigung zum Setzen des Startpassworts.'
    if (!isValidStartPassword(password)) return START_PASSWORD_REQUIRED_MESSAGE
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify(buildResetPasswordRequest(userId, password)),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) return json.error ?? 'Passwort konnte nicht gesetzt werden.'
      return null
    } catch {
      return 'Netzwerkfehler – bitte nochmals versuchen.'
    }
  }

  async function submitResetDialog() {
    if (!resetTarget) return
    setResetError('')
    if (isBoundAdminIdentity({ username: resetTarget.username })) {
      setResetError('Das Admin-Konto behält sein bestehendes Passwort.')
      return
    }
    if (!isValidStartPassword(resetPassword)) {
      setResetError(START_PASSWORD_REQUIRED_MESSAGE)
      return
    }
    setResetSaving(true)
    const err = await callResetPassword(resetTarget.id, resetPassword)
    setResetSaving(false)
    if (err) { setResetError(err); return }
    setRevealedStartPassword({ name: resetTarget.name, password: resetPassword })
    logAudit('Startpasswort gesetzt', resetTarget.username ?? resetTarget.name)
    setResetTarget(null)
    setResetPassword('')
  }

  async function copyRevealedPassword() {
    if (!revealedStartPassword) return
    try {
      await navigator.clipboard.writeText(revealedStartPassword.password)
      setResetCopied(true)
    } catch {
      setError('Kopieren nicht möglich – bitte Passwort manuell übertragen.')
    }
  }

  async function runImport() {
    if (!canCreate) return
    const resolved = resolveImportStartPassword({
      mode: importRandomPerUser ? 'random' : 'shared',
      startPassword: importStartPassword,
    })
    if (!resolved.ok) { setImportError(resolved.error); return }
    setImporting(true)
    setImportCreds([])
    setCredsCopied(false)
    const { data: { session } } = await supabase.auth.getSession()
    let done = 0, err = 0
    const creds: { email: string; username: string | null; password: string }[] = []
    setImportProgress({ done: 0, total: importRows.length, err: 0 })
    for (const row of importRows) {
      const password = resolved.passwordFor(done + err)
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            name: row.name,
            vorname: row.vorname,
            nachname: row.nachname,
            username: row.username || null,
            dienstnummer: row.dienstnummer || null,
            organisation: row.organisation,
            roles: row.roles,
            gender: row.gender,
            einsatz_mt_roles: isStrictAdmin && row.einsatzMtRole ? [row.einsatzMtRole] : undefined,
            initial_password: password,
          }),
        })
        const json = await res.json() as { error?: string; email?: string; username?: string | null }
        if (res.ok) {
          done++
          creds.push({
            email: json.email ?? row.email,
            username: json.username ?? row.username ?? null,
            password,
          })
        } else err++
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
    const text = importCreds.map(c => `${c.email}\t${c.password}`).join('\n')
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
    setForm(f => {
      if (role === 'admin') {
        const enablingAdmin = !f.roles.includes('admin')
        return {
          ...f,
          roles: enablingAdmin ? ['admin'] : ['user'],
          einsatzMtRoles: enablingAdmin ? [] : [defaultEinsatzMtRoleForNewUser()],
          schulungenRoles: enablingAdmin ? [] : [defaultSchulungenRoleForNewUser()],
          fuhrparkRoles: enablingAdmin ? [] : [defaultFuhrparkRoleForNewUser()],
          zentraleRoles: enablingAdmin ? [] : [defaultZentraleRoleForNewUser()],
        }
      }
      return { ...f, roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role] }
    })
  }

  function toggleEinsatzMtRole(role: EinsatzMtRole) {
    if (isSelfEdit) return
    setForm(current => ({
      ...current,
      einsatzMtRoles: current.einsatzMtRoles.includes(role)
        ? current.einsatzMtRoles.filter(existing => existing !== role)
        : parseEinsatzMtRoles([...current.einsatzMtRoles, role]),
    }))
  }

  function toggleSchulungenRole(role: SchulungenRole) {
    if (isSelfEdit) return
    setForm(current => ({
      ...current,
      schulungenRoles: current.schulungenRoles.includes(role)
        ? current.schulungenRoles.filter(existing => existing !== role)
        : parseSchulungenRoles([...current.schulungenRoles, role]),
    }))
  }

  function toggleFuhrparkRole(role: FuhrparkRole) {
    if (isSelfEdit) return
    setForm(current => ({
      ...current,
      fuhrparkRoles: current.fuhrparkRoles.includes(role)
        ? current.fuhrparkRoles.filter(existing => existing !== role)
        : parseFuhrparkRoles([...current.fuhrparkRoles, role]),
    }))
  }

  function toggleZentraleRole(role: ZentraleRole) {
    if (isSelfEdit) return
    setForm(current => ({
      ...current,
      zentraleRoles: current.zentraleRoles.includes(role)
        ? current.zentraleRoles.filter(existing => existing !== role)
        : parseZentraleRoles([...current.zentraleRoles, role]),
    }))
  }

  const normalizedSearch = search.trim().toLocaleLowerCase('de-AT')
  const filteredUsers = users.filter(user => {
    if (orgFilter !== 'all' && (isPortalAdmin(user) || user.organisation !== orgFilter)) return false
    if (roleFilter !== 'all') {
      const einsatzRoles = parseEinsatzMtRoles(areaByUser[user.id]?.einsatz_mt)
      const schulungenRoles = parseSchulungenRoles(areaByUser[user.id]?.schulungen)
      const fuhrparkRoles = parseFuhrparkRoles(areaByUser[user.id]?.fuhrpark)
      if (!user.roles.includes(roleFilter) && !einsatzRoles.includes(roleFilter as EinsatzMtRole) && !schulungenRoles.includes(roleFilter as SchulungenRole) && !fuhrparkRoles.includes(roleFilter as FuhrparkRole)) return false
    }
    if (!normalizedSearch) return true
    return [user.name, user.dienstnummer, user.username]
      .some(value => (value ?? '').toLocaleLowerCase('de-AT').includes(normalizedSearch))
  })
  const organisationCounts = Object.fromEntries(
    ORGS.map(org => [org, users.filter(user => !isPortalAdmin(user) && user.organisation === org).length]),
  ) as Record<Organisation, number>

  function printDirectory() {
    const escapeHtml = (value: string) => value
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#039;')
    const roleText = (user: Profile) => {
      if (isPortalAdmin(user)) return 'Portalweite Rolle: Admin'
      const bekleidung = clothingRoles(user.roles).map(role => BEKLEIDUNG_ROLE_LABEL[role] ?? role).join(', ')
      const em = parseEinsatzMtRoles(areaByUser[user.id]?.einsatz_mt)
      return `Bekleidung: ${bekleidung || 'kein Zugriff'}; Einsatzmittel & Training: ${em.length > 0 ? em.map(role => AREA_ROLE_LABELS[role]).join(', ') : 'kein Zugriff'}`
    }
    const rows = filteredUsers.map(user => `<tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.dienstnummer ?? '–')}</td><td>${escapeHtml(isPortalAdmin(user) ? 'Übergeordnet' : (user.organisation ?? 'Stadtpolizei'))}</td><td>${escapeHtml(roleText(user))}</td><td>${user.active ? 'Aktiv' : 'Inaktiv'}</td></tr>`).join('')
    const printWindow = window.open('', '_blank')
    if (!printWindow) { setError('Druckansicht konnte nicht geöffnet werden. Bitte Pop-ups erlauben.'); return }
    printWindow.opener = null
    printWindow.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Mitarbeiterliste</title><style>@page{size:A4 landscape;margin:14mm}body{font-family:Arial,sans-serif;color:#111;font-size:10pt}h1{font-size:18pt;margin:0 0 4mm}.meta{color:#555;margin-bottom:6mm}.notice{border:1px solid #999;padding:3mm;margin-bottom:5mm;font-weight:700}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:2.2mm;text-align:left;vertical-align:top}th{background:#eee}tr{break-inside:avoid}.footer{margin-top:5mm;color:#666;font-size:8pt}</style></head><body><h1>Mitarbeiterliste</h1><div class="meta">Bereich: ${escapeHtml(orgFilter === 'all' ? 'Alle Organisationen' : orgFilter)} · Stand: ${escapeHtml(new Date().toLocaleString('de-AT'))}</div><div class="notice">Nur für den internen Dienstgebrauch. Vor unbefugter Einsicht schützen und nach Gebrauch datenschutzgerecht vernichten.</div><table><thead><tr><th>Name</th><th>Dienstnummer</th><th>Zuordnung</th><th>Funktionsrechte</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">Die Druckansicht enthält bewusst keine Login-Daten, Passwörter oder Geschlechtsangaben.</div><script>window.addEventListener('load',()=>{window.print();window.close()})</script></body></html>`)
    printWindow.document.close()
  }

  return (
    <div>
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
      {revealedStartPassword && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Startpasswort für {revealedStartPassword.name} – nur einmal angezeigt</p>
            <p className="font-mono font-semibold break-all mt-1">{revealedStartPassword.password}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button type="button" onClick={() => { void copyRevealedPassword() }} className="text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg">
              {resetCopied ? 'Kopiert ✓' : 'Kopieren'}
            </button>
            <button type="button" onClick={() => { setRevealedStartPassword(null); setResetCopied(false) }} className="text-xs font-medium border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-100">
              Schließen
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-6 gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Benutzer</h1>
          <p className="text-gray-500 text-sm mt-1">Portal-Benutzerverwaltung</p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto sm:flex-shrink-0">
          <button onClick={printDirectory} className="flex items-center justify-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg hover:bg-gray-50 transition-colors" title="Datenschutzfreundliche Mitarbeiterliste drucken">
            <Printer className="w-4 h-4 flex-shrink-0" /><span>Drucken</span>
          </button>
          {canCreate && (
            <button onClick={() => { setShowImport(true); setImportRows([]); setImportProgress(null); setImportError(''); setImportCreds([]); setCredsCopied(false); setImportStartPassword(DEFAULT_START_PASSWORD); setImportRandomPerUser(false) }} className="flex items-center justify-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg hover:bg-gray-50 transition-colors" title="Import">
              <Upload className="w-4 h-4 flex-shrink-0" /><span>Import</span>
            </button>
          )}
          {canCreate && (
            <button onClick={openNew} className="col-span-2 flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors" title="Neuer Benutzer">
              <Plus className="w-4 h-4 flex-shrink-0" /><span>Neuer Benutzer</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-full sm:w-fit max-w-full">
        {(['all', ...ORGS] as const).map(o => (
          <button key={o} onClick={() => setOrgFilter(o)}
            className={`text-sm font-medium px-3 py-2 rounded-lg transition-all whitespace-nowrap ${orgFilter === o ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {o === 'all' ? `Alle (${users.length})` : `${o} (${organisationCounts[o]})`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_13rem] gap-3 mb-4">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Name, Dienstnummer oder Benutzername suchen" />
        </label>
        <select value={roleFilter} onChange={event => setRoleFilter(event.target.value as RoleFilter)} className="border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">Alle Funktionsrechte</option>
          <option value="sachbearbeiter">Sachbearbeiter</option>
          <option value="genehmiger">Genehmiger</option>
          <option value="admin">Administratoren</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {filteredUsers.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 py-10 px-4 text-center text-sm text-gray-500">Keine Mitarbeiter gefunden.</div>
            )}
            {filteredUsers.map(user => {
              const einsatzRoles = parseEinsatzMtRoles(areaByUser[user.id]?.einsatz_mt)
              const protectedAccount = isPortalAdmin(user) || user.id === authProfile?.id || isBoundAdminIdentity({ username: user.username })
              return (
                <article key={user.id} className={`bg-white rounded-xl border border-gray-200 p-4 ${!user.active ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-gray-900 truncate">{user.name}</h2>
                      {!isPortalAdmin(user) && user.organisation === 'Stadtpolizei' && user.dienstgrad && <p className="text-xs font-medium text-blue-700 mt-0.5">{user.dienstgrad}</p>}
                      <p className="text-xs text-gray-500 mt-0.5">{user.dienstnummer ? `DNr. ${user.dienstnummer}` : 'Keine Dienstnummer'}{user.username ? ` · ${user.username}` : ''}</p>
                    </div>
                    {canDeactivate ? (
                      <button onClick={() => toggleActive(user)} className={`flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${user.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {user.active ? 'Aktiv' : 'Inaktiv'}
                      </button>
                    ) : (
                      <span className={`flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${user.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{user.active ? 'Aktiv' : 'Inaktiv'}</span>
                    )}
                  </div>

                  <div className="mt-3">
                    {isStrictAdmin && !protectedAccount ? (
                      <select value={ORGS.includes(user.organisation as Organisation) ? user.organisation : 'Stadtpolizei'} onChange={event => { void moveUser(user, event.target.value as Organisation) }} className="w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label={`${user.name} einer Organisation zuordnen`}>
                        {ORGS.map(org => <option key={org} value={org}>{org}</option>)}
                      </select>
                    ) : (
                      <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ${isPortalAdmin(user) ? 'bg-purple-100 text-purple-700' : user.organisation === 'Parkaufsicht' ? 'bg-orange-100 text-orange-700' : user.organisation === 'Verwaltung' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>{isPortalAdmin(user) ? 'Übergeordnet' : (user.organisation ?? 'Stadtpolizei')}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-gray-400 mb-1">Bekleidung</p>
                      <p className="font-medium text-gray-700">{clothingRoles(user.roles).length > 0 ? clothingRoles(user.roles).map(role => BEKLEIDUNG_ROLE_LABEL[role] ?? role).join(', ') : 'Kein Zugriff'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-gray-400 mb-1">Einsatzmittel & Training</p>
                      <p className="font-medium text-gray-700">{einsatzRoles.length > 0 ? einsatzRoles.map(role => AREA_ROLE_LABELS[role]).join(', ') : 'Kein Zugriff'}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-gray-100">
                    {canReset && !isBoundAdminIdentity({ username: user.username }) && (
                      <button type="button" onClick={() => { setResetTarget(user); setResetPassword(DEFAULT_START_PASSWORD); setResetError(''); setResetCopied(false) }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100"><KeyRound className="w-4 h-4" /> Passwort</button>
                    )}
                    <button onClick={() => openEdit(user)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-50"><Pencil className="w-4 h-4" /> Bearbeiten</button>
                    {isStrictAdmin && !protectedAccount && (
                      <button onClick={() => { setDeleteTarget(user); setDeleteConfirmation(''); setDeleteError('') }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /> Löschen</button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>

          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">PC-Benutzername</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Dienstgrad / DNr.</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Zuordnung</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Geschlecht</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Bekleidung</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Einsatzmittel &amp; Training</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${u.roles.includes('admin') ? 'bg-purple-100' : u.roles.includes('sachbearbeiter') || u.roles.includes('genehmiger') ? 'bg-blue-100' : 'bg-gray-100'}`}>
                        {u.roles.includes('admin') || u.roles.includes('sachbearbeiter') || u.roles.includes('genehmiger') ? <Shield className={`w-3.5 h-3.5 ${u.roles.includes('admin') ? 'text-purple-700' : 'text-blue-700'}`} /> : <User className="w-3.5 h-3.5 text-gray-500" />}
                      </div>
                      <span className="font-medium text-gray-900 truncate max-w-xs">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{u.username || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{!isPortalAdmin(u) && u.organisation === 'Stadtpolizei' && u.dienstgrad ? `${u.dienstgrad} · ` : ''}{u.dienstnummer ? `DNr. ${u.dienstnummer}` : '–'}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {isStrictAdmin && !isPortalAdmin(u) && u.id !== authProfile?.id ? (
                      <select
                        value={ORGS.includes(u.organisation as Organisation) ? u.organisation : 'Stadtpolizei'}
                        onChange={event => { void moveUser(u, event.target.value as Organisation) }}
                        className="border border-gray-300 bg-white rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-label={`${u.name} einer Organisation zuordnen`}
                      >
                        {ORGS.map(org => <option key={org} value={org}>{org}</option>)}
                      </select>
                    ) : (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isPortalAdmin(u) ? 'bg-purple-100 text-purple-700' : u.organisation === 'Parkaufsicht' ? 'bg-orange-100 text-orange-700' : u.organisation === 'Verwaltung' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isPortalAdmin(u) ? 'Übergeordnet' : (u.organisation ?? 'Stadtpolizei')}
                      </span>
                    )}
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
                      {clothingRoles(u.roles).map(r => (
                        <span key={r} className={`text-xs font-medium px-2 py-0.5 rounded-full ${BEKLEIDUNG_ROLE_COLOR[r] ?? 'bg-gray-100 text-gray-600'}`}>
                          {BEKLEIDUNG_ROLE_LABEL[r] ?? r}
                        </span>
                      ))}
                      {clothingRoles(u.roles).length === 0 && <span className="text-xs text-gray-400">Kein Zugriff</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {(() => {
                      const emRoles = areaByUser[u.id]?.einsatz_mt
                      const em = parseEinsatzMtRoles(emRoles)
                      if (em.length > 0) {
                        return (
                          <div className="flex gap-1 flex-wrap">
                            {em.map(role => (
                              <span key={role} className={`text-xs font-medium px-2 py-0.5 rounded-full ${BEKLEIDUNG_ROLE_COLOR[role] ?? 'bg-gray-100 text-gray-600'}`}>
                                {AREA_ROLE_LABELS[role]}
                              </span>
                            ))}
                          </div>
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
                      {canReset && !isBoundAdminIdentity({ username: u.username }) && (
                        <button
                          type="button"
                          onClick={() => { setResetTarget(u); setResetPassword(DEFAULT_START_PASSWORD); setResetError(''); setResetCopied(false) }}
                          title="Startpasswort"
                          className="p-2 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => openEdit(u)} className="p-2 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {isStrictAdmin && u.id !== authProfile?.id && !isBoundAdminIdentity({ username: u.username }) && (
                        <button onClick={() => { setDeleteTarget(u); setDeleteConfirmation(''); setDeleteError('') }} title="Endgültig löschen" className="p-2 hover:bg-red-50 rounded-md text-red-400 hover:text-red-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[min(92dvh,44rem)] flex flex-col">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b flex-shrink-0">
              <h2 className="font-bold text-gray-900">Benutzer importieren (CSV)</h2>
              <button onClick={() => setShowImport(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 sm:px-6 py-4 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <div className="bg-gray-50 rounded-xl p-4 text-xs font-mono text-gray-600 space-y-1">
                <p className="font-semibold text-gray-700 font-sans text-xs mb-2">Offiziersliste (Vorname, Nachname, Dienstnummer):</p>
                <p>vorname;nachname;dienstnummer</p>
                <p>Stefanie;Albrecht;32</p>
                <p className="font-sans text-gray-500 mt-2">ET-/Zuteilung = Stadtpolizei. Parkaufsicht-Liste = Parkaufsicht, nur Bekleidung Benutzer. Login-E-Mail: vorname.nachname@dornbirn.at (Umlaute als ae/oe/ue/ss). Ausnahme: Martin Feurstein / DNr. 3 → martin.feurstein2@dornbirn.at. PC-Benutzername setzt jede Person beim Erstlogin. Vorhandene Dienstnummern werden übersprungen. Alternative: name;benutzername;dienstnummer;organisation;rollen</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
                  <Upload className="w-4 h-4" /> CSV-Datei wählen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const plan = planRosterEnsure(knownRosterImportUsers(), users)
                    setImportRows(plan.create)
                    setImportError(plan.already.length || plan.skipped.length
                      ? `${plan.already.length} bereits vorhanden, ${plan.skipped.length} übersprungen.`
                      : '')
                    setImportProgress(null)
                  }}
                  className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50"
                >
                  Bekannte Offiziere
                </button>
                <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(OFFICER_ROSTER_CSV_TEMPLATE)}`} download="offiziere-vorlage.csv" className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
                  <Download className="w-4 h-4" /> Offiziersliste
                </a>
                <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`} download="benutzer-vorlage.csv" className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
                  <Download className="w-4 h-4" /> Vorlage
                </a>
                <input ref={fileRef} type="file" accept=".csv,.txt,.json,.xlsx,.xls,.ods" className="hidden" onChange={handleFile} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="import-startpasswort">Startpasswort {importRandomPerUser ? '' : '*'}</label>
                <input
                  id="import-startpasswort"
                  type="text"
                  autoComplete="off"
                  disabled={importRandomPerUser}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono disabled:bg-gray-100 disabled:text-gray-400"
                  value={importStartPassword}
                  onChange={e => setImportStartPassword(e.target.value)}
                  placeholder={DEFAULT_START_PASSWORD}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {START_PASSWORD_HINT}
                </p>
                <label className="mt-3 flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded mt-0.5"
                    checked={importRandomPerUser}
                    onChange={e => setImportRandomPerUser(e.target.checked)}
                  />
                  <span className="text-sm text-gray-700">Zufällig pro Person</span>
                </label>
                {importRandomPerUser && (
                  <p className="text-xs text-amber-700 mt-1">Jeder importierte Account erhält ein eigenes Zufallspasswort. Die Liste wird nach dem Import einmal angezeigt.</p>
                )}
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
                  <p className="text-sm font-semibold text-amber-800">Startpasswörter – werden nur einmal angezeigt!</p>
                  <p className="text-xs text-amber-700">{START_PASSWORD_HINT} Bitte jetzt kopieren. Login ist die E-Mail.</p>
                  <div className="border border-amber-200 rounded-lg overflow-hidden overflow-x-auto bg-white">
                    <table className="w-full text-xs font-mono">
                      <thead><tr className="bg-amber-100/60 border-b border-amber-200 font-sans"><th className="text-left px-3 py-2">Login (E-Mail)</th><th className="text-left px-3 py-2">Initialpasswort</th></tr></thead>
                      <tbody className="divide-y divide-amber-100">
                        {importCreds.map(c => (
                          <tr key={c.email}>
                            <td className="px-3 py-1.5">{c.email}</td>
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
                      <thead><tr className="bg-gray-50 border-b"><th className="text-left px-3 py-2">Name</th><th className="text-left px-3 py-2">Login-E-Mail</th><th className="text-left px-3 py-2">Organisation</th><th className="text-left px-3 py-2">DNr.</th><th className="text-left px-3 py-2">Rollen</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {importRows.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium">{r.name}</td>
                            <td className="px-3 py-2">{r.email}</td>
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
            <div className="flex gap-3 px-5 sm:px-6 py-4 border-t flex-shrink-0">
              <button onClick={() => setShowImport(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Schließen</button>
              {importRows.length > 0 && (
                <button
                  onClick={() => { void runImport() }}
                  disabled={importing || (!importRandomPerUser && !isValidStartPassword(importStartPassword))}
                  className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60"
                >
                  {importing ? 'Importiere...' : `${importRows.length} Benutzer importieren`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[min(92dvh,44rem)] flex flex-col">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b flex-shrink-0">
              <h2 className="font-bold text-gray-900">{editId ? 'Benutzer bearbeiten' : 'Neuer Benutzer'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 sm:px-6 py-4 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Vorname Nachname" />
              </div>
              {(!editId || canReset) && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{editId ? 'Startpasswort' : 'Initiales Passwort *'}</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    value={form.initialPassword}
                    onChange={e => setForm(f => ({ ...f, initialPassword: e.target.value }))}
                    placeholder={editId ? 'leer = unverändert' : DEFAULT_START_PASSWORD}
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {editId
                      ? `${START_PASSWORD_HINT} Leer lassen = Passwort unverändert.`
                      : START_PASSWORD_HINT}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">PC-Benutzername</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="leer — setzt die Person beim Erstlogin" />
                  <p className="text-xs text-gray-400 mt-1">Windows-Anmeldename ohne Domäne. Leer lassen: wird beim ersten Anmelden gesetzt. Nicht die Dienstnummer.</p>
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
              {form.roles.includes('admin') ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Zuordnung</label>
                  <p className="text-sm font-medium text-purple-700 px-3 py-2.5 bg-purple-50 border border-purple-100 rounded-lg">Portalweit · übergeordnete Rolle</p>
                  <p className="text-xs text-gray-400 mt-1">Admins gehören keiner Organisationseinheit an.</p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Organisation</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {ORGS.map(org => (
                      <button key={org} type="button" onClick={() => setForm(f => ({ ...f, organisation: org }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.organisation === org ? (org === 'Parkaufsicht' ? 'bg-orange-600 text-white border-orange-600' : org === 'Verwaltung' ? 'bg-violet-700 text-white border-violet-700' : 'bg-blue-700 text-white border-blue-700') : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                        {org}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Bestimmt welche Produkte im Katalog sichtbar sind.</p>
                </div>
              )}
              {isStrictAdmin && (
                <fieldset className="border border-purple-200 bg-purple-50/40 rounded-xl p-3.5">
                  <legend className="px-1 text-sm font-semibold text-purple-800">Portalweite Rolle</legend>
                  <label className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${isSelfEdit ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200' : 'cursor-pointer bg-white border-purple-200 hover:bg-purple-50'}`}>
                    <input type="checkbox" checked={form.roles.includes('admin')} onChange={() => toggleRole('admin')} disabled={isSelfEdit} className="rounded disabled:cursor-not-allowed" />
                    <span className="text-sm font-medium text-gray-700">Admin</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-2">Übergeordneter Zugriff auf das gesamte Portal; keine Zuordnung zu Stadtpolizei, Parkaufsicht oder Verwaltung.</p>
                </fieldset>
              )}
              <fieldset className={`border border-gray-200 rounded-xl p-3.5 ${form.roles.includes('admin') ? 'opacity-50' : ''}`}>
                <legend className="px-1 text-sm font-semibold text-gray-800">Rechte · Bekleidung</legend>
                <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-2 mt-1">
                  {([['user', 'Benutzer'], ['sachbearbeiter', 'Sachbearbeiter'], ['genehmiger', 'Genehmiger']] as [string, string][]).map(([role, label]) => {
                    const restricted = isSelfEdit || form.roles.includes('admin') || !canAssignRole(role)
                    return (
                      <label key={role} className={`flex items-center gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5 ${restricted ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} disabled={restricted} className="rounded disabled:cursor-not-allowed" />
                        <span className="text-sm font-medium text-gray-700">{label}</span>
                      </label>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">Mehrere Funktionen können gleichzeitig vergeben werden.</p>
                {isSelfEdit && (
                  <p className="text-xs text-amber-700 mt-1">Eigene Rollen können nicht geändert werden.</p>
                )}
                {!isSelfEdit && !isStrictAdmin && !isGenehmiger && (
                  <p className="text-xs text-gray-400 mt-1">Die Genehmiger-Rolle kann nur von Admins oder Genehmigern vergeben werden.</p>
                )}
              </fieldset>
              {isStrictAdmin && !form.roles.includes('admin') && (
                <fieldset className="border border-gray-200 rounded-xl p-3.5">
                  <legend className="px-1 text-sm font-semibold text-gray-800">Rechte · Einsatzmittel &amp; Training</legend>
                  <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-2 mt-1">
                    {EINSATZ_MT_OPTIONS.map(option => (
                      <label key={option.label} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${form.einsatzMtRoles.includes(option.value) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'} ${isSelfEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input type="checkbox" value={option.value} checked={form.einsatzMtRoles.includes(option.value)} disabled={isSelfEdit} onChange={() => toggleEinsatzMtRole(option.value)} className="rounded" />
                        <span className="text-sm font-medium text-gray-700">{option.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Mehrere Funktionen können gleichzeitig vergeben werden. Ohne Auswahl besteht kein Zugriff.</p>
                </fieldset>
              )}
              {isStrictAdmin && !form.roles.includes('admin') && (
                <fieldset className="border border-gray-200 rounded-xl p-3.5">
                  <legend className="px-1 text-sm font-semibold text-gray-800">Rechte · Schulungen</legend>
                  <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-2 mt-1">
                    {SCHULUNGEN_OPTIONS.map(option => (
                      <label key={option.label} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${form.schulungenRoles.includes(option.value) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'} ${isSelfEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input type="checkbox" value={option.value} checked={form.schulungenRoles.includes(option.value)} disabled={isSelfEdit} onChange={() => toggleSchulungenRole(option.value)} className="rounded" />
                        <span className="text-sm font-medium text-gray-700">{option.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Benutzer sehen veröffentlichte Inhalte. Sachbearbeiter können Tabs und Unterlagen verwalten.</p>
                </fieldset>
              )}
              {isStrictAdmin && !form.roles.includes('admin') && (
                <fieldset className="border border-gray-200 rounded-xl p-3.5">
                  <legend className="px-1 text-sm font-semibold text-gray-800">Rechte · Fuhrpark &amp; Fahrzeuge</legend>
                  <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-2 mt-1">
                    {FUHRPARK_OPTIONS.map(option => (
                      <label key={option.label} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${form.fuhrparkRoles.includes(option.value) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'} ${isSelfEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input type="checkbox" value={option.value} checked={form.fuhrparkRoles.includes(option.value)} disabled={isSelfEdit} onChange={() => toggleFuhrparkRole(option.value)} className="rounded" />
                        <span className="text-sm font-medium text-gray-700">{option.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Benutzer sehen Fahrzeuge. Sachbearbeiter können Fahrzeuge anlegen, bearbeiten und löschen.</p>
                </fieldset>
              )}
              {isStrictAdmin && !form.roles.includes('admin') && (
                <fieldset className="border border-red-200 bg-red-50/30 rounded-xl p-3.5">
                  <legend className="px-1 text-sm font-semibold text-red-900">Rechte · Zentrale</legend>
                  <div className="grid grid-cols-1 min-[390px]:grid-cols-3 gap-2 mt-1">
                    {ZENTRALE_OPTIONS.map(option => (
                      <label key={option.label} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${form.zentraleRoles.includes(option.value) ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white hover:bg-gray-50'} ${isSelfEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input type="checkbox" value={option.value} checked={form.zentraleRoles.includes(option.value)} disabled={isSelfEdit} onChange={() => toggleZentraleRole(option.value)} className="rounded" />
                        <span className="text-sm font-medium text-gray-700">{option.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Zentralisten und Sachbearbeiter können operative Einträge verwalten. Sensible Einträge sind nur für diese Rollen und Admins sichtbar.</p>
                </fieldset>
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
                  Login mit Stadt-E-Mail (vorname.nachname@dornbirn.at) oder PC-Benutzername. {START_PASSWORD_HINT} PC-Benutzername (Windows-Anmeldename ohne Domäne) setzt die Person beim Erstlogin.
                </p>
              )}
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-5 sm:px-6 py-4 border-t flex-shrink-0">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={save} disabled={saving} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Speichern...' : editId ? 'Speichern' : 'Anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b">
              <h2 className="font-bold text-red-800">Benutzer endgültig löschen</h2>
              <button type="button" onClick={() => setDeleteTarget(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 sm:px-6 py-4 space-y-4">
              <p className="text-sm text-gray-700">Das Auth-Konto von <strong>{deleteTarget.name}</strong> wird endgültig entfernt. Diese Aktion kann nicht rückgängig gemacht werden.</p>
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">Bestehen bereits dienstliche Vorgänge oder Nachweise, verhindert das System die Löschung. In diesem Fall bleibt nur die Deaktivierung, damit die Historie erhalten bleibt.</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Zur Bestätigung den vollständigen Namen eingeben</label>
                <input value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" placeholder={deleteTarget.name} autoComplete="off" />
              </div>
              {deleteError && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{deleteError}</p>}
            </div>
            <div className="flex gap-3 px-5 sm:px-6 py-4 border-t">
              <button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button type="button" onClick={() => { void deleteUserPermanently() }} disabled={deleteSaving || deleteConfirmation.trim() !== deleteTarget.name} className="flex-1 bg-red-700 hover:bg-red-800 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-40">
                {deleteSaving ? 'Lösche…' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[min(92dvh,28rem)] flex flex-col">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b flex-shrink-0">
              <h2 className="font-bold text-gray-900">Startpasswort zurücksetzen</h2>
              <button type="button" onClick={() => setResetTarget(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 sm:px-6 py-4 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              <p className="text-sm text-gray-600">
                Neues Startpasswort für <span className="font-medium text-gray-900">{resetTarget.name}</span>.
                Beim nächsten Login muss die Person das Passwort ändern.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="reset-startpasswort">Startpasswort *</label>
                <input
                  id="reset-startpasswort"
                  type="text"
                  autoComplete="off"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  placeholder={DEFAULT_START_PASSWORD}
                />
                <p className="text-xs text-gray-400 mt-1">{START_PASSWORD_HINT} Wird danach einmal angezeigt.</p>
              </div>
              {resetError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{resetError}</p>}
            </div>
            <div className="flex gap-3 px-5 sm:px-6 py-4 border-t flex-shrink-0">
              <button type="button" onClick={() => setResetTarget(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button type="button" onClick={() => { void submitResetDialog() }} disabled={resetSaving || !isValidStartPassword(resetPassword)} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">
                {resetSaving ? 'Setze...' : 'Startpasswort setzen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
