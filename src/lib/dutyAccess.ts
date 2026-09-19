import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { operationalToday } from './zentraleShared'
import type { DutyFunction } from './types'

// Zugriff auf Zentrale/Innendienst/Außendienst ist eine TAGESFUNKTION aus
// der Diensteinteilung, keine Dauerberechtigung mehr (siehe Migration
// 20260919070000_tagesfunktion_zugriff.sql) - jede/r Benutzer/in kann an
// einem Tag Zentrale, an einem anderen Innendienst oder Außendienst (jd/vd)
// haben. operationalToday() statt eines simplen Kalendertags, damit ein über
// Mitternacht laufender Nachtdienst nicht schon um Mitternacht die eigene
// Tagesfunktion verliert.

export type OperativBereich = 'zentrale' | 'innendienst' | 'aussendienst'

export function bereichFuerFunktion(func: DutyFunction): OperativBereich | null {
  if (func === 'zentrale') return 'zentrale'
  if (func === 'innendienst') return 'innendienst'
  if (func === 'jd' || func === 'vd') return 'aussendienst'
  return null
}

/** Eigene, heute zugeteilte operative Bereiche (kann bei mehreren Schichten
 * am selben Tag auch mehrere sein) - leeres Set = heute nicht operativ. */
export function useOwnOperativBereicheToday(userId: string | undefined): { bereiche: Set<OperativBereich>; loading: boolean } {
  const [bereiche, setBereiche] = useState<Set<OperativBereich>>(new Set())
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!userId) { setBereiche(new Set()); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    void supabase.from('duty_assignments').select('function').eq('user_id', userId).eq('duty_date', operationalToday()).then(({ data }) => {
      if (cancelled) return
      const next = new Set<OperativBereich>()
      for (const row of (data ?? []) as { function: DutyFunction }[]) {
        const bereich = bereichFuerFunktion(row.function)
        if (bereich) next.add(bereich)
      }
      setBereiche(next)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [userId])
  return { bereiche, loading }
}
