import { isDnPlaceholderUsername } from './workflow'

export { canResetUserPassword } from './workflow'

/** Owner-gewähltes gemeinsames Startpasswort — bewusst schwach und nur temporär bis zum Erstlogin. */
export const DEFAULT_START_PASSWORD = '123456'

export const START_PASSWORD_HINT =
  'Startpasswort (z. B. 123456) — beim Erstlogin muss die Person ein eigenes Passwort setzen.'

export const START_PASSWORD_REQUIRED_MESSAGE = 'Startpasswort ist Pflicht.'

export function isValidStartPassword(pw: string): boolean {
  return pw.trim().length > 0
}

export type ImportPasswordMode = 'shared' | 'random'

export type ResetPasswordRequest = {
  action: 'reset_password'
  user_id: string
  initial_password: string
}

/** Username fehlt oder ist noch dn{N} → Erstlogin muss den PC-Namen setzen. */
export function shouldKeepForceUsernameSet(
  username: string | null | undefined,
  forceUsernameSet?: boolean | null,
): boolean {
  if (forceUsernameSet === true) return true
  const trimmed = (username ?? '').trim()
  return !trimmed || isDnPlaceholderUsername(trimmed)
}

/** Zufälliges Initialpasswort: 10 Zeichen, mind. 1 Großbuchstabe und 1 Zahl. */
export function generateRandomInitialPassword(): string {
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

/**
 * Import-Passwörter: Standard ist ein gemeinsames Startpasswort für alle Zeilen.
 * Zufall nur bei explizitem mode === 'random'.
 */
export function resolveImportStartPassword(
  options: { mode: ImportPasswordMode; startPassword: string },
  generate: () => string = generateRandomInitialPassword,
): { ok: true; passwordFor: (index: number) => string } | { ok: false; error: string } {
  if (options.mode === 'random') {
    return { ok: true, passwordFor: () => generate() }
  }
  const pw = options.startPassword.trim()
  if (!pw || !isValidStartPassword(pw)) return { ok: false, error: START_PASSWORD_REQUIRED_MESSAGE }
  return { ok: true, passwordFor: () => pw }
}

export function buildResetPasswordRequest(userId: string, password: string): ResetPasswordRequest {
  return {
    action: 'reset_password',
    user_id: userId,
    initial_password: password.trim(),
  }
}
