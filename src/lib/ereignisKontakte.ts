import { supabase } from './supabase'
import type { EreignisVerstaendigungsschritt, ZentraleKontakt } from './types'
import { kontaktTelefonnummern, type KontaktTelefonnummer } from './kontaktTelefon'
import { nummerFuerArt } from './verstaendigungsregeln'
import { profilTelefonClient, profilTelefonnummern, profilNummerFuerArt, type ProfilTelefonnummern } from './profilTelefon'

export type EreignisKontaktTreffer = {
  id: string
  label: string
  name: string
  funktion: string | null
  telefonnummern: KontaktTelefonnummer[]
  erreichbarkeit: string | null
  source: 'kontakt' | 'profil'
}
export async function loadEreignisKontakte(schritte: readonly EreignisVerstaendigungsschritt[]): Promise<Record<string, EreignisKontaktTreffer[]>> {
  const ids = [...new Set(schritte.flatMap(s => [s.kontakt_id, s.vertretung_id].filter((id): id is string => !!id)))]
  const profilIds = [...new Set(schritte.flatMap(s => [s.profil_id, s.vertretung_profil_id].filter((id): id is string => !!id)))]
  if (!ids.length && !profilIds.length) return Object.fromEntries(schritte.map(s => [s.bezeichnung, []]))
  const [kontaktResult, profilResult, telefonResult] = await Promise.all([
    ids.length ? supabase.from('zentrale_kontakte').select('*').in('id', ids) : Promise.resolve({ data: [], error: null }),
    profilIds.length ? supabase.from('profiles').select('id,name,dienstgrad,organisation').in('id', profilIds) : Promise.resolve({ data: [], error: null }),
    profilIds.length ? profilTelefonClient.from('profile_phone_numbers').select('*').in('user_id', profilIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (kontaktResult.error || profilResult.error || telefonResult.error) throw new Error('Kontaktdaten konnten nicht geladen werden.')
  const kontakte = new Map(((kontaktResult.data ?? []) as ZentraleKontakt[]).map(k => [k.id, k]))
  const profile = new Map((profilResult.data ?? []).map(p => [p.id, p]))
  const telefone = new Map(((telefonResult.data ?? []) as ProfilTelefonnummern[]).map(p => [p.user_id, p]))
  return Object.fromEntries(schritte.map(s => {
    const mapped: EreignisKontaktTreffer[] = []
    for (const index of [0, 1]) {
      const kontaktId = index === 0 ? s.kontakt_id : s.vertretung_id
      const profilId = index === 0 ? s.profil_id : s.vertretung_profil_id
      const kontakt = kontaktId ? kontakte.get(kontaktId) : null
      const profil = profilId ? profile.get(profilId) : null
      if (kontakt) {
        const gewaehlt = index === 0 ? nummerFuerArt(kontakt, s.telefon_art) : null
        mapped.push({ id: kontakt.id, label: s.bezeichnung, name: kontakt.name + (index ? ' (Vertretung)' : ''),
          funktion: kontakt.funktion, telefonnummern: index === 0 && s.telefon_art ? (gewaehlt ? [{ art: 'Bevorzugt', nummer: gewaehlt }] : []) : kontaktTelefonnummern(kontakt),
          erreichbarkeit: kontakt.erreichbarkeit, source: 'kontakt' })
      } else if (profil) {
        const telefon = telefone.get(profil.id)
        const bevorzugt = index === 0 && (s.telefon_art === 'diensthandy' || s.telefon_art === 'privathandy') ? profilNummerFuerArt(telefon, s.telefon_art) : null
        mapped.push({ id: profil.id, label: s.bezeichnung, name: profil.name + (index ? ' (Vertretung)' : ''),
          funktion: profil.dienstgrad ?? profil.organisation, telefonnummern: index === 0 && s.telefon_art ? (bevorzugt ? [{ art: 'Bevorzugt', nummer: bevorzugt }] : []) : profilTelefonnummern(telefon),
          erreichbarkeit: null, source: 'profil' })
      }
    }
    return [s.bezeichnung, mapped]
  }))
}

export function telHref(telefon: string): string {
  return 'tel:' + telefon.replace(/[^+\d]/g, '')
}
