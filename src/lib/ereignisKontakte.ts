import { supabase } from './supabase'
import type { EreignisVerstaendigungsschritt, ZentraleKontakt } from './types'
import { kontaktTelefonnummern, type KontaktTelefonnummer } from './kontaktTelefon'
import { nummerFuerArt } from './verstaendigungsregeln'

export type EreignisKontaktTreffer = {
  id: string
  label: string
  name: string
  funktion: string | null
  telefonnummern: KontaktTelefonnummer[]
  erreichbarkeit: string | null
  source: 'kontakt'
}
export async function loadEreignisKontakte(schritte: readonly EreignisVerstaendigungsschritt[]): Promise<Record<string, EreignisKontaktTreffer[]>> {
  const ids = [...new Set(schritte.flatMap(s => [s.kontakt_id, s.vertretung_id].filter((id): id is string => !!id)))]
  if (!ids.length) return Object.fromEntries(schritte.map(s => [s.bezeichnung, []]))
  const result = await supabase.from('zentrale_kontakte').select('*').in('id', ids)
  if (result.error) throw new Error('Kontaktdaten konnten nicht geladen werden.')
  const kontakte = new Map(((result.data ?? []) as ZentraleKontakt[]).map(k => [k.id, k]))
  return Object.fromEntries(schritte.map(s => {
    const mapped = [s.kontakt_id, s.vertretung_id].flatMap((id, index): EreignisKontaktTreffer[] => {
      const kontakt = id ? kontakte.get(id) : null
      if (!kontakt) return []
      const gewaehlt = index === 0 ? nummerFuerArt(kontakt, s.telefon_art) : null
      return [{ id: kontakt.id, label: s.bezeichnung, name: kontakt.name + (index ? ' (Vertretung)' : ''),
        funktion: kontakt.funktion, telefonnummern: s.telefon_art ? (gewaehlt ? [{ art: 'Bevorzugt', nummer: gewaehlt }] : []) : kontaktTelefonnummern(kontakt),
        erreichbarkeit: kontakt.erreichbarkeit, source: 'kontakt' }]
    })
    return [s.bezeichnung, mapped]
  }))
}

export function telHref(telefon: string): string {
  return 'tel:' + telefon.replace(/[^+\d]/g, '')
}
