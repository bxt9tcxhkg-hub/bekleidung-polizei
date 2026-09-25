import { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { loadOpenAssistanceRequests } from '../../lib/incidentAssistance'
import { loadActiveEreignisse } from '../../lib/ereignis'
import type { IncidentReport } from '../../lib/types'

export default function CentralDutyOverview({ openIncidents }: { openIncidents: IncidentReport[] }) {
  const [openAssistance, setOpenAssistance] = useState(0)
  const [activeEvents, setActiveEvents] = useState(0)
  const [pendingNotifications, setPendingNotifications] = useState(0)
  const [incomplete, setIncomplete] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIncomplete(false)
      try {
        const [requests, events] = await Promise.all([loadOpenAssistanceRequests(), loadActiveEreignisse()])
        if (cancelled) return
        setOpenAssistance(requests.length)
        setActiveEvents(events.length)
        const eventIds = events.map(event => event.id)
        let pending = 0
        if (eventIds.length > 0) {
          const [stepsRes, verstaendigungenRes] = await Promise.all([
            supabase.from('ereignis_verstaendigungsschritte').select('ereignis_id, schluessel, pflicht').in('ereignis_id', eventIds).eq('pflicht', true),
            supabase.from('ereignis_verstaendigungen').select('ereignis_id, empfaenger_key, versucht_at, erreicht_at').in('ereignis_id', eventIds),
          ])
          if (stepsRes.error) throw stepsRes.error
          if (verstaendigungenRes.error) throw verstaendigungenRes.error
          const doneByEvent = new Map<string, Set<string>>()
          for (const row of verstaendigungenRes.data ?? []) {
            if (!row.versucht_at && !row.erreicht_at) continue
            const done = doneByEvent.get(row.ereignis_id) ?? new Set<string>()
            done.add(row.empfaenger_key)
            doneByEvent.set(row.ereignis_id, done)
          }
          for (const step of stepsRes.data ?? []) {
            if (!doneByEvent.get(step.ereignis_id)?.has(step.schluessel)) pending += 1
          }
        }
        if (!cancelled) setPendingNotifications(pending)
      } catch {
        if (!cancelled) setIncomplete(true)
      }
    }

    void load()
    const timer = window.setInterval(() => { void load() }, 15_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [openIncidents.length])

  const hasWork = openIncidents.length > 0 || openAssistance > 0 || pendingNotifications > 0

  return <section className={'rounded-2xl border p-4 ' + (hasWork ? 'border-blue-200 bg-blue-50/60' : 'border-green-200 bg-green-50/60')}>
    <div className="flex items-start gap-3">
      <ClipboardCheck className={'mt-0.5 h-5 w-5 flex-none ' + (hasWork ? 'text-blue-800' : 'text-green-700')} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Arbeitsstand Zentrale</p>
        <p className="mt-0.5 text-sm font-bold text-gray-950">{hasWork ? 'Offene Arbeit für den laufenden Dienst' : 'Keine offene Zentralen-Aufgabe'}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-gray-800">{openIncidents.length} offene Einsätze</span>
          <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-gray-800">{openAssistance} offene Abfragen</span>
          <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-gray-800">{activeEvents} aktive Ereignisse</span>
          {pendingNotifications > 0 ? <span className="rounded-full bg-amber-100 px-2.5 py-1 font-bold text-amber-900">{pendingNotifications} Verständigungen offen</span> : null}
        </div>
        <p className="mt-2 text-[11px] text-gray-600">Dieser Stand ersetzt kein Übergabeprotokoll. Er zeigt ausschließlich noch offene Arbeit aus dem System.</p>
        {incomplete ? <p className="mt-1 text-xs text-amber-700">Der Arbeitsstand konnte nicht vollständig geladen werden.</p> : null}
      </div>
    </div>
  </section>
}
