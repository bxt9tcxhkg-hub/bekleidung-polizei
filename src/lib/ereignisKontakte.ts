import { supabase } from './supabase'
import type { WichtigeTelefonnummer, ZentraleKontakt } from './types'
import { kontaktTelefonnummern, type KontaktTelefonnummer } from './kontaktTelefon'

export type EreignisKontaktTreffer = {
  id: string
  label: string
  name: string
  funktion: string | null
  telefonnummern: KontaktTelefonnummer[]
  erreichbarkeit: string | null
  source: 'kontakt' | 'telefonnummer'
}

const NORMALIZE = (value: string) => value
  .toLocaleLowerCase('de-AT')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const ROLE_ALIASES: Record<string, string[]> = {
  'Bürgermeisterin': ['burgermeisterin', 'burgermeister'],
  'Notfallkoordinator': ['notfallkoordinator'],
  'Stadtamtsdirektor': ['stadtamtsdirektor'],
  'Leitung Gruppe 2': ['leitung gruppe 2', 'gruppe 2'],
  'Öffentlichkeitsarbeit': ['offentlichkeitsarbeit'],
  'Kdo Stadtpolizei': ['kdo stadtpolizei', 'kommandant stadtpolizei', 'kdt stadtpolizei', 'kdt'],
}

function matches(label: string, values: Array<string | null | undefined>): boolean {
  const aliases = ROLE_ALIASES[label] ?? [NORMALIZE(label)]
  const haystack = NORMALIZE(values.filter(Boolean).join(' '))
  return aliases.some(alias => haystack.includes(NORMALIZE(alias)))
}

export async function loadEreignisKontakte(labels: readonly string[]): Promise<Record<string, EreignisKontaktTreffer[]>> {
  const [kontakteResult, nummernResult] = await Promise.all([
    supabase.from('zentrale_kontakte').select('id,name,funktion,telefon,telefon_buero,telefon_diensthandy,telefon_privathandy,erreichbarkeit,institution,restricted').order('name'),
    supabase.from('wichtige_telefonnummern').select('*').order('sortierung').order('bezeichnung'),
  ])

  if (kontakteResult.error || nummernResult.error) throw new Error('Kontaktdaten konnten nicht geladen werden.')

  const kontakte = (kontakteResult.data ?? []) as unknown as Array<Pick<ZentraleKontakt, 'id' | 'name' | 'funktion' | 'telefon' | 'telefon_buero' | 'telefon_diensthandy' | 'telefon_privathandy' | 'erreichbarkeit' | 'institution'>>
  const nummern = (nummernResult.data ?? []) as unknown as WichtigeTelefonnummer[]

  return Object.fromEntries(labels.map(label => {
    const fromContacts: EreignisKontaktTreffer[] = kontakte
      .filter(row => matches(label, [row.name, row.funktion, row.institution]))
      .map(row => ({
        id: row.id,
        label,
        name: row.name,
        funktion: row.funktion,
        telefonnummern: kontaktTelefonnummern(row),
        erreichbarkeit: row.erreichbarkeit,
        source: 'kontakt',
      }))

    const fromNumbers: EreignisKontaktTreffer[] = nummern
      .filter(row => matches(label, [row.bezeichnung, row.hinweis]))
      .map(row => ({
        id: row.id,
        label,
        name: row.bezeichnung,
        funktion: null,
        telefonnummern: [{ art: 'Telefon', nummer: row.nummer }],
        erreichbarkeit: row.hinweis,
        source: 'telefonnummer',
      }))

    const seen = new Set<string>()
    const merged = [...fromContacts, ...fromNumbers].filter(row => {
      const keys = row.telefonnummern.length > 0
        ? row.telefonnummern.map(({ nummer }) => [NORMALIZE(row.name), NORMALIZE(nummer)].join('|'))
        : [[NORMALIZE(row.name), ''].join('|')]
      if (keys.every(key => seen.has(key))) return false
      keys.forEach(key => seen.add(key))
      return true
    })
    return [label, merged]
  }))
}

export function telHref(telefon: string): string {
  return 'tel:' + telefon.replace(/[^+\d]/g, '')
}
