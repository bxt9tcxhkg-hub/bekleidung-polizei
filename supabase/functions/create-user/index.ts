// Edge Function: legt Auth-User + Profil an (Service Role).
// Wird von src/pages/Users.tsx (Portal-Benutzerseite) aufgerufen.
// Auth-E-Mail: {Vorname}.{Nachname}@dornbirn.at (ASCII-Fold; Feurstein2-Ausnahme).
// profiles.username = PC-Anmeldename (Platzhalter + force_username_set).
// Anlegen: aktive Sachbearbeiter, Genehmiger (inkl. approver) und Admins.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Keep in sync with src/lib/appOrigins.ts — never Access-Control-Allow-Origin: *
const STATIC_APP_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
  'https://bekleidung-polizei.pages.dev',
]

function extraAllowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false
  if (STATIC_APP_ORIGINS.includes(origin)) return true
  if (extraAllowedOrigins().includes(origin)) return true
  try {
    const u = new URL(origin)
    return u.protocol === 'https:' && u.hostname.endsWith('.bekleidung-polizei.pages.dev')
  } catch {
    return false
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  if (isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

const USERNAME_RE = /^[a-z0-9._-]+$/
const AUTH_EMAIL_DOMAIN = 'dornbirn.at'
const FEURSTEIN_MARTIN_EMAIL = 'Martin.Feurstein2@dornbirn.at'

/** Keep in sync with src/lib/officerAuthEmail.ts */
function foldGermanAscii(input: string): string {
  return input
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function splitOfficerName(name: string): { vorname: string; nachname: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { vorname: '', nachname: '' }
  if (parts.length === 1) return { vorname: parts[0], nachname: '' }
  return { vorname: parts[0], nachname: parts.slice(1).join(' ') }
}

function normalizeDienstnummer(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? ''
  if (!trimmed) return ''
  const stripped = trimmed.replace(/^0+/, '')
  return stripped || '0'
}

function isFeursteinMartinException(vorname: string, nachname: string, dienstnummer?: string | null): boolean {
  const first = foldGermanAscii(vorname).trim().toLowerCase()
  const last = foldGermanAscii(nachname).trim().toLowerCase()
  const dn = normalizeDienstnummer(dienstnummer)
  if (first === 'martin' && last === 'feurstein') return true
  if (dn === '3' && last === 'feurstein') return true
  return false
}

function officerAuthEmail(input: {
  vorname?: string
  nachname?: string
  name?: string
  dienstnummer?: string | null
}): string {
  let vorname = (input.vorname ?? '').trim()
  let nachname = (input.nachname ?? '').trim()
  if (!vorname || !nachname) {
    const split = splitOfficerName(input.name ?? '')
    if (!vorname) vorname = split.vorname
    if (!nachname) nachname = split.nachname
  }
  if (!vorname || !nachname) return ''
  if (isFeursteinMartinException(vorname, nachname, input.dienstnummer)) {
    return FEURSTEIN_MARTIN_EMAIL
  }
  const localFirst = foldGermanAscii(vorname).replace(/\s+/g, '')
  const localLast = foldGermanAscii(nachname).replace(/\s+/g, '-')
  if (!localFirst || !localLast) return ''
  return `${localFirst}.${localLast}@${AUTH_EMAIL_DOMAIN}`
}

function provisionalUsernameFromEmail(email: string): string {
  return (email.split('@')[0] ?? '').trim().toLowerCase()
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
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
  if (role === 'sachbearbeiter') return isSachbearbeiter || isGenehmiger
  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json(req, { error: 'Server nicht konfiguriert (SUPABASE_SERVICE_ROLE_KEY)' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json(req, { error: 'Unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)
  const token = authHeader.slice(7)
  const { data: authData, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !authData.user) return json(req, { error: 'Unauthorized' }, 401)

  const { data: caller, error: callerErr } = await admin
    .from('profiles')
    .select('roles, active')
    .eq('id', authData.user.id)
    .single()
  if (callerErr || !caller?.active) return json(req, { error: 'Keine Berechtigung' }, 403)
  const callerRoles: string[] = caller.roles ?? []
  if (!canCreateUsers(callerRoles)) {
    return json(req, { error: 'Keine Berechtigung' }, 403)
  }

  let body: {
    name?: string
    vorname?: string
    nachname?: string
    username?: string
    dienstnummer?: string | null
    roles?: string[]
    gender?: 'male' | 'female'
    organisation?: string
    active?: boolean
    initial_password?: string
    einsatz_mt_role?: string
  }
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Ungültiger JSON-Body' }, 400)
  }

  const name = (body.name ?? '').trim()
  const password = body.initial_password ?? ''
  const dienstnummer = body.dienstnummer?.trim() || null
  const email = officerAuthEmail({
    vorname: body.vorname,
    nachname: body.nachname,
    name,
    dienstnummer,
  })
  const requestedUsername = (body.username ?? '').trim().toLowerCase()
  const username = requestedUsername || provisionalUsernameFromEmail(email)
  if (!name) return json(req, { error: 'Name ist Pflicht.' }, 400)
  if (!email) {
    return json(req, { error: 'Login-E-Mail konnte nicht gebildet werden (Vor- und Nachname nötig).' }, 400)
  }
  if (!username) return json(req, { error: 'Benutzername ist Pflicht oder muss aus der E-Mail ableitbar sein.' }, 400)
  if (!USERNAME_RE.test(username)) {
    return json(req, { error: 'Benutzername darf nur Kleinbuchstaben, Zahlen, Punkt, Bindestrich und Unterstrich enthalten.' }, 400)
  }
  if (password.length < 8 || !/[0-9]/.test(password) || !/[A-Z]/.test(password)) {
    return json(req, { error: 'Initiales Passwort muss mindestens 8 Zeichen haben und mindestens eine Zahl und einen Großbuchstaben enthalten.' }, 400)
  }

  const requested = Array.isArray(body.roles) && body.roles.length > 0 ? body.roles : ['user']
  const roles = requested.filter((r) => canAssign(callerRoles, r))
  if (roles.length === 0) roles.push('user')

  const gender = body.gender === 'female' ? 'female' : 'male'
  const organisation = body.organisation === 'Parkaufsicht' ? 'Parkaufsicht' : 'Stadtpolizei'
  const active = body.active !== false

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      force_password_change: true,
      force_username_set: true,
      username,
      name,
      gender,
      organisation,
    },
  })
  if (createErr || !created.user) {
    const msg = createErr?.message ?? 'Benutzer konnte nicht angelegt werden'
    const status = /already|exists|registered/i.test(msg) ? 409 : 400
    return json(req, { error: msg }, status)
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
    force_username_set: true,
  })
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id)
    return json(req, { error: profileErr.message }, 400)
  }

  const bekleidungRoles = (() => {
    const mapped = roles.map((r) => (r === 'approver' ? 'genehmiger' : r))
    const allowed = new Set(['user', 'sachbearbeiter', 'genehmiger', 'admin'])
    const out = [...new Set(mapped.filter((r) => allowed.has(r)))]
    return out.length > 0 ? out : ['user']
  })()
  const areaRows: { user_id: string; area: string; roles: string[] }[] = [
    { user_id: created.user.id, area: 'bekleidung', roles: bekleidungRoles },
  ]
  if (active) {
    const requestedEinsatz = body.einsatz_mt_role
    const einsatzMt = callerRoles.includes('admin') && (requestedEinsatz === 'sachbearbeiter' || requestedEinsatz === 'admin')
      ? requestedEinsatz
      : 'user'
    areaRows.push({ user_id: created.user.id, area: 'einsatz_mt', roles: [einsatzMt] })
  }
  const { error: areaErr } = await admin.from('portal_area_roles').upsert(areaRows)
  if (areaErr) {
    console.error('portal_area_roles:', areaErr.message)
  }

  return json(req, { id: created.user.id, username, email })
})
