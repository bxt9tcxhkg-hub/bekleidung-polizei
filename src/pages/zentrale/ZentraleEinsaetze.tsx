import { useEffect, useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { IncidentReport } from '../../lib/types'
import type { ZentraleContext } from './ZentraleShell'
import EinsaetzeBoard from './EinsaetzeBoard'

export default function ZentraleEinsaetze() {
  const ctx = useOutletContext<ZentraleContext>()
  const [params] = useSearchParams()
  const abgeschlossen = params.get('liste') === 'abgeschlossen'
  const [done, setDone] = useState<IncidentReport[]>([])

  useEffect(() => {
    if (!abgeschlossen) return
    void supabase.from('incident_reports').select('*').eq('status', 'erledigt').order('reported_at', { ascending: false }).limit(200).then(result => {
      setDone((result.data ?? []) as IncidentReport[])
    })
  }, [abgeschlossen, ctx.visibleIncidents])

  const openItems = useMemo(
    () => ctx.visibleIncidents.filter(item => item.status !== 'erledigt'),
    [ctx.visibleIncidents],
  )

  return <EinsaetzeBoard
    title={abgeschlossen ? 'Abgeschlossene Einsätze' : 'Einsätze'}
    items={abgeschlossen ? done : openItems}
    canOperate={ctx.canOperateZentrale}
    onEdit={ctx.openEditIncident}
    onComplete={ctx.completeIncident}
    onDelete={ctx.deleteIncident}
    showComplete={!abgeschlossen}
  />
}
