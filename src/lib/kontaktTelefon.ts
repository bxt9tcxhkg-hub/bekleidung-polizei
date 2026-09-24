import type { ZentraleKontakt } from './types'

export type KontaktTelefonnummer = { art: string; nummer: string }

/** Bestehende Nummern behalten ihre unbekannte Art, bis sie zugeordnet werden. */
export function kontaktTelefonnummern(kontakt: Pick<ZentraleKontakt, 'telefon' | 'telefon_buero' | 'telefon_diensthandy' | 'telefon_privathandy'>): KontaktTelefonnummer[] {
  return ([
    ['Büro', kontakt.telefon_buero],
    ['Diensthandy', kontakt.telefon_diensthandy],
    ['Privathandy', kontakt.telefon_privathandy],
    ['Weitere Nummer', kontakt.telefon],
  ] as const).flatMap(([art, nummer]) => nummer?.trim() ? [{ art, nummer: nummer.trim() }] : [])
}
