import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { WichtigeTelefonnummer } from './types'

export function useWichtigeTelefonnummern() {
  const [nummern, setNummern] = useState<WichtigeTelefonnummer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('wichtige_telefonnummern').select('*').order('kategorie').order('sortierung')
    setError(!!result.error)
    setNummern((result.data ?? []) as unknown as WichtigeTelefonnummer[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  return { nummern, loading, error, reload: load }
}

/** Nur Ziffern, +, Klammern und Leerzeichen zulassen, damit der tel:-Link auch bei "059 133 8140" oder "0676 8989 50029" funktioniert. */
export function telHref(nummer: string) {
  return `tel:${nummer.replace(/[^\d+]/g, '')}`
}
