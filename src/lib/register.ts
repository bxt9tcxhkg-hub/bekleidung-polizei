import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { OperationalObject, OperationalPerson } from './types'

// Lade-Hooks + reine Hilfsfunktionen für das Personen-/Objekte-Register,
// getrennt von den Auswahlkomponenten in ../components/RegisterPickers.tsx
// (react-refresh erlaubt in einer Komponentendatei keine Objekt-/Funktions-Exports).

export function usePersons() {
  const [persons, setPersons] = useState<OperationalPerson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('operational_persons').select('*').order('nachname').order('vorname')
    setError(!!result.error)
    setPersons((result.data ?? []) as OperationalPerson[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  return { persons, setPersons, loading, error, reload: load }
}

export function useObjects() {
  const [objects, setObjects] = useState<OperationalObject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('operational_objects').select('*').order('address')
    setError(!!result.error)
    setObjects((result.data ?? []) as OperationalObject[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  return { objects, setObjects, loading, error, reload: load }
}

/** Baut aus den strukturierten Adressfeldern eine Anzeige-/Speicheradresse ("Straße Hausnummer, PLZ Ort"). Fehlt eines der Pflichtfelder (Straße/PLZ/Ort), wird null zurückgegeben - der Aufrufer fällt dann auf das Freitextfeld `address` zurück. */
export function composeObjectAddress(fields: { strasse?: string | null; hausnummer?: string | null; plz?: string | null; ort?: string | null }) {
  if (!fields.strasse?.trim() || !fields.plz?.trim() || !fields.ort?.trim()) return null
  const strasseHausnummer = [fields.strasse.trim(), fields.hausnummer?.trim()].filter(Boolean).join(' ')
  return `${strasseHausnummer}, ${fields.plz.trim()} ${fields.ort.trim()}`
}
export function objectLabel(object: Pick<OperationalObject, 'address' | 'label'> & Partial<Pick<OperationalObject, 'strasse' | 'hausnummer' | 'plz' | 'ort'>>) {
  const address = composeObjectAddress(object) ?? object.address
  return object.label ? `${object.label} (${address})` : address
}
/** Vorname und Nachname sind beide optional (am Telefon oft erst eines bekannt) - hier zur Anzeige kombiniert. */
export function personDisplayName(person: Pick<OperationalPerson, 'vorname' | 'nachname'> | null | undefined) {
  if (!person) return 'Unbekannte Person'
  return [person.vorname, person.nachname].filter(Boolean).join(' ') || 'Unbekannte Person'
}
export function personLabel(person: Pick<OperationalPerson, 'vorname' | 'nachname' | 'birth_date'>) {
  const name = personDisplayName(person)
  return person.birth_date ? `${name} (geb. ${new Date(person.birth_date).toLocaleDateString('de-AT')})` : name
}

/**
 * Mögliche Duplikate vor dem Anlegen einer neuen Person: gleicher Nachname
 * oder gleicher Vorname (case-insensitive, exakt) bei einer bestehenden
 * Person, ohne dass Vor- UND Nachname bereits exakt übereinstimmen (das wäre
 * bereits ein eindeutiger Treffer, kein bloßer Verdacht). Bewusst kein Fuzzy-
 * Abgleich (Tippfehler) - das würde bei Polizeidaten (gleicher Name, andere
 * Person ist normal) zu viele falsche Warnungen erzeugen.
 */
/**
 * Mögliche Duplikate vor dem Anlegen eines neuen Objekts, z. B. wenn ein
 * Einsatzort als Objekt übernommen werden soll: dieselbe Adresse kann schon
 * über einen Schlüssel oder eine frühere Meldung im Register stehen - und
 * andersherum soll ein aus einem Einsatzort erzeugtes Objekt später bei
 * einer Schlüsselanlage wiedergefunden werden, statt doppelt zu entstehen.
 */
export function findSimilarObjects(objects: OperationalObject[], addressQuery: string): OperationalObject[] {
  const q = addressQuery.trim().toLowerCase()
  if (!q) return []
  return objects.filter(object => {
    const addr = (object.address ?? '').trim().toLowerCase()
    if (!addr) return false
    return addr === q || addr.includes(q) || q.includes(addr)
  })
}

export function findSimilarPersons(persons: OperationalPerson[], vorname: string, nachname: string, excludeId?: string | null): OperationalPerson[] {
  const v = vorname.trim().toLowerCase()
  const n = nachname.trim().toLowerCase()
  if (!v && !n) return []
  return persons.filter(person => {
    if (person.id === excludeId) return false
    const pv = (person.vorname ?? '').trim().toLowerCase()
    const pn = (person.nachname ?? '').trim().toLowerCase()
    if (v && n && pv === v && pn === n) return false
    return (n && pn === n) || (v && pv === v)
  })
}
