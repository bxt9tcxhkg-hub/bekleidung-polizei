// Edge Function: legt Auth-User + Profil an (Service Role).
// Wird von src/pages/Users.tsx aufgerufen.
// Anlegen: aktive Sachbearbeiter, Genehmiger (inkl. approver) und Admins.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const USERNAME_RE = /^[a-z0-9._-]+$/
const LOCAL_DOMAIN = 'stadtpolizei-dornbirn.local'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function canCreateUsers(callerRoles: string[]): boolean {
  return (
    callerRoles.includes('admin') ||
    callerRoles.includes('sachbearbeiter') ||
    callerRoles.includes('genehmiger') ||
    callerRoles.includes('approver')
  )
}

function canAssign(callerRoles: string[], role: string): boolean {
  const isAdmin = callerRoles.includes('admin')
  const isGenehmiger = isAdmin || callerRoles.includes('genehmiger') || callerRoles.includes('approver')
  const isSachbearbeiter = isAdmin || callerRoles.includes('sachbearbeiter')
  if (role === 'admin') return isAdmin
  if (role === 'genehmiger') return isGenehmiger
  if (role === 'sachbearbeiter') return isSachbearbeiter
  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server nicht konfiguriert (SUPABASE_SERVICE_ROLE_KEY)' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)
  const token = authHeader.slice(7)
  const { data: authData, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !authData.user) return json({ error: 'Unauthorized' }, 401)

  const { data: caller, error: callerErr } = await admin
    .from('profiles')
    .select('roles, active')
    .eq('id', authData.user.id)
    .single()
  if (callerErr || !caller?.active) return json({ error: 'Keine Berechtigung' }, 403)
  const callerRoles: string[] = caller.roles ?? []
  if (!canCreateUsers(callerRoles)) {
    return json({ error: 'Keine Berechtigung' }, 403)
  }

  let body: {
    name?: string
    username?: string
    dienstnummer?: string | null
    roles?: string[]
    gender?: 'male' | 'female'
    organisation?: string
    active?: boolean
    initial_password?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Ungültiger JSON-Body' }, 400)
  }

  const name = (body.name ?? '').trim()
  const username = (body.username ?? '').trim().toLowerCase()
  const password = body.initial_password ?? ''
  if (!name || !username) return json({ error: 'Name und Benutzername sind Pflicht.' }, 400)
  if (!USERNAME_RE.test(username)) {
    return json({ error: 'Benutzername darf nur Kleinbuchstaben, Zahlen, Punkt, Bindestrich und Unterstrich enthalten.' }, 400)
  }
  if (password.length < 8 || !/[0-9]/.test(password) || !/[A-Z]/.test(password)) {
    return json({ error: 'Initiales Passwort muss mindestens 8 Zeichen haben und mindestens eine Zahl und einen Großbuchstaben enthalten.' }, 400)
  }

  const requested = Array.isArray(body.roles) && body.roles.length > 0 ? body.roles : ['user']
  const roles = requested.filter((r) => canAssign(callerRoles, r))
  if (roles.length === 0) roles.push('user')

  const email = `${username}@${LOCAL_DOMAIN}`
  const gender = body.gender === 'female' ? 'female' : 'male'
  const organisation = body.organisation === 'Parkaufsicht' ? 'Parkaufsicht' : 'Stadtpolizei'
  const active = body.active !== false
  const dienstnummer = body.dienstnummer?.trim() || null

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      force_password_change: true,
      username,
      name,
      gender,
      organisation,
    },
  })
  if (createErr || !created.user) {
    const msg = createErr?.message ?? 'Benutzer konnte nicht angelegt werden'
    const status = /already|exists|registered/i.test(msg) ? 409 : 400
    return json({ error: msg }, status)
  }

  const { error: profileErr } = await admin.from('profiles').upsert({
    id: created.user.id,
    name,
    username,
    dienstnummer,
    roles,
    gender,
    organisation,
    active,
  })
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id)
    return json({ error: profileErr.message }, 400)
  }

  return json({ id: created.user.id, username })
})
