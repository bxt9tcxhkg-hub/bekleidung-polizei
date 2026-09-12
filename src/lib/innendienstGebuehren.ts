/**
 * Innendienst: Gebührenordnung (reine Referenztabelle). Positionen (z. B.
 * Bundesabgabe, Verwaltungsgebühr) werden zu benannten Sätzen (z. B.
 * "Bescheid Straßenmusik") zusammengesetzt. Schreibrechte liegen bewusst
 * ausschließlich beim Genehmiger (is_genehmiger() in RLS) – Innendienst
 * selbst hat dafür keine eigene Verwaltungsrolle.
 */
import type { InnendienstGebuehrensatzPosition } from './types'

/** Summe eines Gebührensatzes: Summe der Beträge aller verknüpften Positionen. */
export function gebuehrensatzTotal(items: readonly Pick<InnendienstGebuehrensatzPosition, 'position'>[]): number {
  return items.reduce((sum, item) => sum + (item.position?.betrag ?? 0), 0)
}

export function validateGebuehrenpositionName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Bitte einen Namen angeben.'
  if (trimmed.length > 120) return 'Name ist zu lang (max. 120 Zeichen).'
  return null
}

export function validateGebuehrensatzName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Bitte einen Namen angeben.'
  if (trimmed.length > 160) return 'Name ist zu lang (max. 160 Zeichen).'
  return null
}

export function parseGebuehrenBetrag(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.')
  if (normalized === '') return null
  const value = Number(normalized)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100) / 100
}
