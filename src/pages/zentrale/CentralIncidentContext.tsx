import { useEffect, useState } from 'react'
import { AlertTriangle, Info, KeyRound, ShieldAlert } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { IncidentContextItem } from '../../lib/types'

function iconFor(item: IncidentContextItem) {
  if (item.kind === 'schluessel') return <KeyRound className="h-4 w-4 flex-none" />
  if (item.severity === 'sicherheit') return <ShieldAlert className="h-4 w-4 flex-none" />
  if (item.severity === 'achtung' || item.severity === 'nahbereich') return <AlertTriangle className="h-4 w-4 flex-none" />
  return <Info className="h-4 w-4 flex-none" />
}

function styleFor(item: IncidentContextItem) {
  if (item.severity === 'sicherheit') return 'border-red-200 bg-red-50 text-red-900'
  if (item.severity === 'achtung') return 'border-orange-200 bg-orange-50 text-orange-900'
  if (item.severity === 'nahbereich') return 'border-amber-200 bg-amber-50 text-amber-900'
  return 'border-blue-100 bg-blue-50 text-blue-900'
}

export default function CentralIncidentContext({ incidentId }: { incidentId: string }) {
  const [items, setItems] = useState<IncidentContextItem[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setError('')
    void supabase.rpc('incident_context', { p_incident_id: incidentId }).then(({ data, error: loadError }) => {
      if (cancelled) return
      if (loadError) {
        setItems([])
        setError('Einsatzbezogene Hinweise konnten nicht geladen werden.')
        return
      }
      setItems((data ?? []) as IncidentContextItem[])
    })
    return () => { cancelled = true }
  }, [incidentId])

  if (items.length === 0 && !error) return null

  return <section className="space-y-2">
    {items.map((item, index) => <div key={item.kind + '-' + index} className={'rounded-xl border px-3 py-2 ' + styleFor(item)}>
      <div className="flex items-start gap-2">
        {iconFor(item)}
        <div className="min-w-0">
          <p className="text-xs font-bold">{item.title}</p>
          {item.detail ? <p className="mt-0.5 text-xs">{item.detail}</p> : null}
          {item.distance_m !== null ? <p className="mt-0.5 text-[11px] opacity-75">{item.distance_m} m vom Einsatzort</p> : null}
        </div>
      </div>
    </div>)}
    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </section>
}
