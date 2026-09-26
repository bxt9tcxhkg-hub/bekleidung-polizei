// Organisatorische Sonderregeln für die Dienstplan-Planung, vom Kommandanten
// vorgegeben. Anhand der Dienstnummer (stabiler, eindeutiger als der Name -
// siehe die mehrfach vorkommenden Nachnamen Schwendinger/Gisinger in
// src/data/users-seed.json) statt Namensvergleich identifiziert.
//
// Kommando (Schwendinger Hans-Peter #1, Gisinger Andreas #2, Feurstein
// Martin #3) ist NICHT Teil der automatisch einzuteilenden Grundbesetzung -
// sie können sich aber weiterhin manuell auf bestimmte Dienste einteilen
// lassen, bleiben also als Zeile im Planer-Grid sichtbar.
//
// Dienstführung (Aukenthaler Silvano #25, Hummer Hannes #27, Ellensohn Jörg
// #28, Nenning Bernhard #35) bleibt voll Teil des einteilbaren Pools -
// beide Gruppen sollen aber im Grid als jeweils eigener Block
// zusammenstehen statt alphabetisch verstreut zu sein.
export const KOMMANDO_DIENSTNUMMERN = ['1', '2', '3']
export const DIENSTFUEHRUNG_DIENSTNUMMERN = ['25', '27', '28', '35']

export type DienstplanGruppe = 'kommando' | 'dienstfuehrung' | 'einsatz'

export function dienstplanGruppe(dienstnummer: string | null): DienstplanGruppe {
  if (dienstnummer && KOMMANDO_DIENSTNUMMERN.includes(dienstnummer)) return 'kommando'
  if (dienstnummer && DIENSTFUEHRUNG_DIENSTNUMMERN.includes(dienstnummer)) return 'dienstfuehrung'
  return 'einsatz'
}

export const DIENSTPLAN_GRUPPE_LABEL: Record<DienstplanGruppe, string> = {
  kommando: 'Kommando',
  dienstfuehrung: 'Dienstführung',
  einsatz: 'Beamte',
}

/** Kommando wird nicht automatisch für Grundbesetzung vorgeschlagen/gezählt - Dienstführung schon. */
export function istAutomatischEinteilbar(dienstnummer: string | null): boolean {
  return dienstplanGruppe(dienstnummer) !== 'kommando'
}

const GRUPPEN_RANG: Record<DienstplanGruppe, number> = { kommando: 0, dienstfuehrung: 1, einsatz: 2 }

/** Sortiert eine Personenliste so, dass Kommando und Dienstführung jeweils als eigener Block zusammenstehen (Rang). Innerhalb des Kommando-Blocks in der vom Kommandanten vorgegebenen festen Reihenfolge (KOMMANDO_DIENSTNUMMERN: Hans-Peter, Andreas, Martin), innerhalb der anderen Blöcke alphabetisch nach Nachname. */
export function sortiereNachDienstplanGruppe<T extends { name: string; dienstnummer: string | null }>(personen: readonly T[]): T[] {
  return [...personen].sort((a, b) => {
    const gruppeA = dienstplanGruppe(a.dienstnummer)
    const gruppeB = dienstplanGruppe(b.dienstnummer)
    const rang = GRUPPEN_RANG[gruppeA] - GRUPPEN_RANG[gruppeB]
    if (rang !== 0) return rang
    if (gruppeA === 'kommando') return KOMMANDO_DIENSTNUMMERN.indexOf(a.dienstnummer ?? '') - KOMMANDO_DIENSTNUMMERN.indexOf(b.dienstnummer ?? '')
    return nachnameVon(a.name).localeCompare(nachnameVon(b.name), 'de-AT')
  })
}

/** Ob ein Profil laut roles-Array Admin-Rechte hat - Admin-Konten sind nie Teil der einteilbaren Beamten (siehe has_role('admin') serverseitig, hier nur für die Anzeige/Auswahl). */
export function istAdminProfil(roles: readonly string[] | null | undefined): boolean {
  return roles?.includes('admin') ?? false
}

/** profiles.name ist "Vorname Nachname" (z. B. "Hans-Peter Schwendinger") - letztes Wort ist der Nachname. */
function nachnameVon(name: string): string {
  const teile = name.trim().split(/\s+/)
  return teile[teile.length - 1] ?? name
}

function vornameInitialVon(name: string): string {
  const teile = name.trim().split(/\s+/)
  return teile[0]?.charAt(0).toUpperCase() ?? ''
}

/**
 * Kurzname fürs Planer-Grid: nur Nachname - bei Namensgleichheit
 * (z. B. zwei Schwendinger) ergänzt um den Anfangsbuchstaben des Vornamens.
 */
export function kurznamen<T extends { id: string; name: string }>(personen: readonly T[]): Map<string, string> {
  const nachnameAnzahl = new Map<string, number>()
  for (const person of personen) {
    const nachname = nachnameVon(person.name)
    nachnameAnzahl.set(nachname, (nachnameAnzahl.get(nachname) ?? 0) + 1)
  }
  const ergebnis = new Map<string, string>()
  for (const person of personen) {
    const nachname = nachnameVon(person.name)
    const eindeutig = (nachnameAnzahl.get(nachname) ?? 0) <= 1
    ergebnis.set(person.id, eindeutig ? nachname : `${nachname} ${vornameInitialVon(person.name)}.`)
  }
  return ergebnis
}
