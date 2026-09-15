import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  console.error('VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY müssen gesetzt sein (.env / Build-Umgebung).')
}

// createClient wirft bei leerem URL — Platzhalter, damit die UI den Hinweis zeigen kann.
export const supabase = createClient<Database>(
  supabaseUrl || 'https://unavailable.invalid',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.x',
)

const PAGE_SIZE = 1000

/**
 * Ruft eine Abfrage vollständig ab, statt sich auf die von PostgREST
 * serverseitig gedeckelte Standard-Seitengröße zu verlassen (die bei
 * wachsenden Tabellen sonst unbemerkt nur die erste Seite liefert, z. B.
 * bei der Überstunden-Genehmiger-Warteschlange oder der Monatsübersicht).
 * `queryFor(from, to)` muss bei jedem Aufruf eine FRISCHE Query liefern -
 * Supabase-Query-Builder sind nicht wiederverwendbar - und für stabile
 * Seitengrenzen eine eindeutige Sortierung (z. B. bis auf die id) haben,
 * sonst kann Postgres zwischen zwei .range()-Aufrufen Zeilen doppelt
 * liefern oder überspringen.
 *
 * Bricht erst bei einer LEEREN Seite ab, nicht wenn weniger als PAGE_SIZE
 * Zeilen zurückkommen - liegt der von PostgREST selbst konfigurierte
 * Zeilen-Cap unter PAGE_SIZE, käme sonst schon die erste (unvollständige)
 * Seite kleiner als angefragt zurück und würde fälschlich als letzte Seite
 * gewertet. Der nächste Range-Start folgt deshalb der TATSÄCHLICH
 * zurückgegebenen Zeilenzahl, nicht der angefragten.
 */
export async function fetchAllPages<T>(
  queryFor: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await queryFor(from, from + PAGE_SIZE - 1)
    if (error) return { data: all, error }
    const rows = data ?? []
    if (rows.length === 0) break
    all.push(...rows)
    from += rows.length
  }
  return { data: all, error: null }
}
