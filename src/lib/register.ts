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
    const result = await supabase.from('operational_persons').select('*').order('name')
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

export function objectLabel(object: Pick<OperationalObject, 'address' | 'label'>) {
  return object.label ? `${object.label} (${object.address})` : object.address
}
export function personLabel(person: Pick<OperationalPerson, 'name' | 'birth_date'>) {
  return person.birth_date ? `${person.name} (geb. ${new Date(person.birth_date).toLocaleDateString('de-AT')})` : person.name
}
