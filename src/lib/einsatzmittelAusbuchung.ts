/**
 * Ausbuchung von Einsatzmitteln (persönlich und Pool).
 * Soft-Delete mit Zeitstempel und optionalem Grund — kein Hard-Delete.
 */

export type AusbuchungInput = {
  reason: string
}

export type AusbuchungPayload = {
  removed_at: string
  removed_by: string | null
  removal_reason: string | null
}

export type AusbuchungOk = { ok: true; payload: Omit<AusbuchungPayload, 'removed_at' | 'removed_by'> & { removal_reason: string | null } }
export type AusbuchungErr = { ok: false; error: string }
export type AusbuchungValidateResult = AusbuchungOk | AusbuchungErr

export function isEinsatzmittelRemoved(item: { removed_at?: string | null }): boolean {
  return Boolean(item.removed_at)
}

export function isEinsatzmittelActive(item: { removed_at?: string | null }): boolean {
  return !isEinsatzmittelRemoved(item)
}

export function activeEinsatzmittel<T extends { removed_at?: string | null }>(items: readonly T[]): T[] {
  return items.filter(isEinsatzmittelActive)
}

export function removedEinsatzmittel<T extends { removed_at?: string | null }>(items: readonly T[]): T[] {
  return items.filter(isEinsatzmittelRemoved)
}

export function validateAusbuchung(input: AusbuchungInput): AusbuchungValidateResult {
  const reason = input.reason.trim()
  if (reason.length > 500) {
    return { ok: false, error: 'Der Grund darf höchstens 500 Zeichen haben.' }
  }
  return { ok: true, payload: { removal_reason: reason.length > 0 ? reason : null } }
}

export function ausbuchungPayload(input: {
  reason: string
  removedBy: string | null
  removedAt?: string
}): AusbuchungValidateResult & { payload?: AusbuchungPayload } {
  const validated = validateAusbuchung({ reason: input.reason })
  if (!validated.ok) return validated
  return {
    ok: true,
    payload: {
      removed_at: input.removedAt ?? new Date().toISOString(),
      removed_by: input.removedBy,
      removal_reason: validated.payload.removal_reason,
    },
  }
}

export function formatRemovalReason(reason: string | null | undefined): string {
  const trimmed = reason?.trim()
  return trimmed ? trimmed : 'ohne Angabe'
}

export type CountedAusbuchungMode = 'decrement' | 'remove'

export type CountedAusbuchungPlan = {
  mode: CountedAusbuchungMode
  qty: number
  nextAnzahl: number
}

/**
 * Pool/Lager: Anzahl verringern, Rest bleibt. Volle Menge → Soft-Delete.
 * Ohne Bestand (null) bleibt die bisherige Voll-Ausbuchung.
 */
export function planCountedAusbuchung(input: {
  currentAnzahl: number | null | undefined
  qtyRaw: string
}): { ok: true; payload: CountedAusbuchungPlan } | { ok: false; error: string } {
  if (input.currentAnzahl == null) {
    return { ok: false, error: 'Für diesen Eintrag ist keine Anzahl hinterlegt.' }
  }
  const trimmed = input.qtyRaw.trim()
  if (!trimmed) return { ok: false, error: 'Bitte die auszubuchende Anzahl angeben.' }
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: 'Anzahl muss eine ganze Zahl sein.' }
  const qty = Number(trimmed)
  if (!Number.isSafeInteger(qty) || qty <= 0) {
    return { ok: false, error: 'Anzahl muss mindestens 1 sein.' }
  }
  if (qty > input.currentAnzahl) {
    return { ok: false, error: `Höchstens ${input.currentAnzahl} Stück ausbuchbar.` }
  }
  const nextAnzahl = input.currentAnzahl - qty
  return {
    ok: true,
    payload: {
      mode: nextAnzahl === 0 ? 'remove' : 'decrement',
      qty,
      nextAnzahl,
    },
  }
}

/** Pool-Kategorien mit Anzahl/Menge — Soft-Delete allein reicht nicht. */
export const COUNTABLE_POOL_CATEGORIES = [
  'magazine',
  'munition',
  'pfefferspray_gross',
  'schild',
  'ballistischer_helm',
  'schwere_westen',
  'spuckschutzhaube',
] as const

export function poolItemUsesCountedAusbuchung(item: {
  category?: string
  anzahl?: number | null
}): boolean {
  if (item.category && (COUNTABLE_POOL_CATEGORIES as readonly string[]).includes(item.category)) {
    return true
  }
  return item.anzahl != null
}
