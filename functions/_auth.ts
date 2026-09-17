// Verifiziert Supabase-Access-Tokens für Pages Functions.
// URL/Key müssen per Env gesetzt sein (Cloudflare Pages → Settings → Environment variables).
// Kein Fallback-JWT im Quellcode — ohne Env schlägt die Prüfung fehl.

export interface AuthEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
}

export function bearerHeaders(request: Request, env: AuthEnv): HeadersInit | null {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ') || !env.SUPABASE_ANON_KEY) return null
  return {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: authHeader,
    'Content-Type': 'application/json',
  }
}

export async function canManageEinsatz(request: Request, env: AuthEnv): Promise<boolean> {
  if (!env.SUPABASE_URL) return false
  const headers = bearerHeaders(request, env)
  if (!headers) return false
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/can_manage_einsatzmittel`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    return response.ok && await response.json() === true
  } catch {
    return false
  }
}

export async function canManageSchulungen(request: Request, env: AuthEnv): Promise<boolean> {
  if (!env.SUPABASE_URL) return false
  const headers = bearerHeaders(request, env)
  if (!headers) return false
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/can_manage_schulungen`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    return response.ok && await response.json() === true
  } catch {
    return false
  }
}

export async function canManageFuhrpark(request: Request, env: AuthEnv): Promise<boolean> {
  if (!env.SUPABASE_URL) return false
  const headers = bearerHeaders(request, env)
  if (!headers) return false
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/can_manage_fuhrpark`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    return response.ok && await response.json() === true
  } catch {
    return false
  }
}

export async function canManageZentrale(request: Request, env: AuthEnv): Promise<boolean> {
  if (!env.SUPABASE_URL) return false
  const headers = bearerHeaders(request, env)
  if (!headers) return false
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/can_manage_zentrale`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    return response.ok && await response.json() === true
  } catch {
    return false
  }
}

export async function isZentralistOnDuty(request: Request, env: AuthEnv): Promise<boolean> {
  if (!env.SUPABASE_URL) return false
  const headers = bearerHeaders(request, env)
  if (!headers) return false
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_zentralist_on_duty`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    return response.ok && await response.json() === true
  } catch {
    return false
  }
}

/** Archivierte Straßenzustandsberichte: Leserecht folgt RLS auf strassenzustand_berichte (has_portal_area_access('zentrale')). */
export async function canReadStrassenzustandBericht(request: Request, env: AuthEnv, key: string): Promise<boolean> {
  if (!env.SUPABASE_URL) return false
  const headers = bearerHeaders(request, env)
  if (!headers) return false
  const encodedKey = encodeURIComponent(key)
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/strassenzustand_berichte?select=id&pdf_file_key=eq.${encodedKey}&limit=1`, { headers })
    if (!response.ok) return false
    const rows = await response.json() as { id: string }[]
    return rows.length > 0
  } catch {
    return false
  }
}

export async function canReadEinsatzMaterial(request: Request, env: AuthEnv, key: string): Promise<boolean> {
  if (!env.SUPABASE_URL) return false
  const headers = bearerHeaders(request, env)
  if (!headers) return false
  const encodedKey = encodeURIComponent(key)
  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/einsatz_materials?select=id&file_key=eq.${encodedKey}&archived_at=is.null&limit=1`,
      { headers },
    )
    if (!response.ok) return false
    const rows = await response.json() as { id: string }[]
    return rows.length > 0
  } catch {
    return false
  }
}

/** Fahrzeuggebundene Dokumente: Leserecht folgt RLS auf fleet_documents (has_portal_area_access('fuhrpark')). */
export async function canReadFleetDocument(request: Request, env: AuthEnv, key: string): Promise<boolean> {
  if (!env.SUPABASE_URL) return false
  const headers = bearerHeaders(request, env)
  if (!headers) return false
  const encodedKey = encodeURIComponent(key)
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/fleet_documents?select=id&file_key=eq.${encodedKey}&limit=1`, { headers })
    if (!response.ok) return false
    const rows = await response.json() as { id: string }[]
    return rows.length > 0
  } catch {
    return false
  }
}

/** Anlegen/Löschen von Fahrzeugdokumenten: Fuhrpark-Verwaltung oder Fahrzeugverantwortliche/r. */
export async function canManageFleetVehicle(request: Request, env: AuthEnv, vehicleId: string): Promise<boolean> {
  if (!env.SUPABASE_URL) return false
  const headers = bearerHeaders(request, env)
  if (!headers) return false
  try {
    const [managerResponse, responsibleResponse] = await Promise.all([
      fetch(`${env.SUPABASE_URL}/rest/v1/rpc/can_manage_fuhrpark`, { method: 'POST', headers, body: '{}' }),
      fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_vehicle_responsible`, { method: 'POST', headers, body: JSON.stringify({ p_vehicle_id: vehicleId }) }),
    ])
    const [isManager, isResponsible] = await Promise.all([
      managerResponse.ok ? managerResponse.json() : false,
      responsibleResponse.ok ? responsibleResponse.json() : false,
    ])
    return isManager === true || isResponsible === true
  } catch {
    return false
  }
}

/**
 * Liest den Access-Token aus dem Authorization-Header (Bearer)
 * und prüft ihn gegen Supabase Auth. Query-Parameter werden nicht akzeptiert.
 */
export async function isAuthenticated(request: Request, env: AuthEnv): Promise<boolean> {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return false

  const supabaseUrl = env.SUPABASE_URL
  const anonKey = env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return false

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return false
    const user = await res.json() as { id?: string }
    if (!user.id) return false
    const profile = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id&id=eq.${encodeURIComponent(user.id)}&active=eq.true&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    })
    if (!profile.ok) return false
    const rows: unknown = await profile.json()
    return Array.isArray(rows) && rows.length === 1
  } catch {
    return false
  }
}

/** Concrete object authorization uses the caller's database RLS. Unknown folders fail closed. */
export async function canReadFile(request: Request, env: AuthEnv, key: string): Promise<boolean> {
  if (key.startsWith('einsatz-unterlagen/') || key.startsWith('schulungs-unterlagen/')) {
    return canReadEinsatzMaterial(request, env, key)
  }
  // Einsatz-Unterlagen (ZMR-Auszug etc.) haben keine eigene DB-Tabelle; Berechtigung folgt
  // der beim Upload/Löschen: angemeldetes aktives Profil reicht (isAuthenticated bereits geprüft).
  if (key.startsWith('einsatz-dokumente/')) {
    return true
  }
  if (key.startsWith('fuhrpark-dokumente/')) {
    return canReadFleetDocument(request, env, key)
  }
  if (key.startsWith('strassenzustandsberichte/')) {
    return canReadStrassenzustandBericht(request, env, key)
  }
  const headers = bearerHeaders(request, env)
  if (!headers || !env.SUPABASE_URL || !key.startsWith('vorrechnungen/')) return false
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/deliveries?select=id&vorrechnung_url=eq.${encodeURIComponent(`/files/${key}`)}&limit=1`, { headers })
    if (!response.ok) return false
    const rows: unknown = await response.json()
    return Array.isArray(rows) && rows.length > 0
  } catch { return false }
}

export async function canManageBekleidung(request: Request, env: AuthEnv): Promise<boolean> {
  const headers = bearerHeaders(request, env)
  if (!headers || !env.SUPABASE_URL) return false
  try {
    for (const role of ['admin', 'sachbearbeiter']) {
      const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/has_role`, {
        method: 'POST', headers, body: JSON.stringify({ role }),
      })
      if (response.ok && await response.json() === true) return true
    }
    return false
  } catch { return false }
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function serviceUnavailable(): Response {
  return new Response(JSON.stringify({ error: 'Upload/Dateien nicht konfiguriert (SUPABASE_URL, SUPABASE_ANON_KEY)' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  })
}
