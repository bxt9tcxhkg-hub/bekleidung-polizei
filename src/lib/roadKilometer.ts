import { supabase } from './supabase'

export interface RoadKilometerSuggestion {
  roadNumber: string
  roadName: string
  fromKm: number
  toKm: number
}

export interface RoadKilometerPoint {
  roadNumber: string
  kilometer: string
  lat: number
  lng: number
}

export function normalizeRoadNumber(value: string): string {
  return value.toLocaleUpperCase('de-AT').replace(/\s+/g, '').trim()
}

export function formatRoadNumber(value: string): string {
  const normalized = normalizeRoadNumber(value)
  const match = normalized.match(/^([A-ZÄÖÜ]+)(\d.*)$/)
  return match ? `${match[1]} ${match[2]}` : normalized
}

export function normalizeKilometer(value: string): string | null {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d+(?:\.\d)?$/.test(normalized)) return null
  const number = Number(normalized)
  if (!Number.isFinite(number) || number < 0) return null
  return number.toFixed(1)
}

export function formatKilometer(value: string | number): string {
  const number = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(number)
    ? number.toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : String(value)
}

export function composeKilometerLocation(roadName: string, roadNumber: string, kilometer: string | number): string {
  return `${roadName.trim()} (${formatRoadNumber(roadNumber)}), km ${formatKilometer(kilometer)}`
}

export interface ParsedKilometerLocation {
  roadName: string
  roadNumber: string
  kilometer: string
}

export function parseKilometerLocation(location: string | null | undefined): ParsedKilometerLocation | null {
  const match = (location ?? '').trim().match(/^(.+?)\s*\(([A-Za-zÄÖÜäöü]+\s*\d+[A-Za-z0-9/-]*)\),?\s*km\s*(\d+(?:[.,]\d)?)$/i)
  if (!match) return null
  const kilometer = normalizeKilometer(match[3])
  if (!kilometer) return null
  return {
    roadName: match[1].trim(),
    roadNumber: formatRoadNumber(match[2]),
    kilometer: formatKilometer(kilometer),
  }
}

async function authorizedGet<T>(path: string): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Nicht angemeldet.')
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
  const body = await response.json().catch(() => null) as ({ error?: string } & T) | null
  if (!response.ok) throw new Error(body?.error || 'Kilometrierung konnte nicht geladen werden.')
  return body as T
}

export async function suggestRoadKilometers(query: string): Promise<RoadKilometerSuggestion[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const result = await authorizedGet<{ roads: RoadKilometerSuggestion[] }>(`/strassenkilometer?action=suggest&q=${encodeURIComponent(trimmed)}`)
  return result.roads
}

export async function locateRoadKilometer(roadNumber: string, kilometerInput: string): Promise<RoadKilometerPoint> {
  const kilometer = normalizeKilometer(kilometerInput)
  if (!kilometer) throw new Error('Kilometer bitte in 100-Meter-Schritten eingeben, z. B. 5,7.')
  return authorizedGet<RoadKilometerPoint>(
    `/strassenkilometer?action=locate&road=${encodeURIComponent(normalizeRoadNumber(roadNumber))}&km=${encodeURIComponent(kilometer)}`,
  )
}
