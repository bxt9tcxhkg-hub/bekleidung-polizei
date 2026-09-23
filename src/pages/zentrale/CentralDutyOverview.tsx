import { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { loadOpenAssistanceRequests } from '../../lib/incidentAssistance'
import { loadActiveEreignisse, loadVerstaendigungen } from '../../lib/ereignis'
import { telefonketteFuer } from '../../lib/einsatzSchema'
import type { IncidentReport } from '../../lib/types'

export default function CentralDutyOverview({ openIncidents }: { openIncidents: IncidentReport[] }) {
  const [openAssistance, setOpenAssistance] = useState(0)
  const [activeEvents, setActiveEvents] = useState(0)
  const [pendingNotifications, setPendingNotifications] = useState(0)
  const [incomplete, setIncomplete] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIncomplete(false)
    void Promise.all([loadOpenAssistanceRequests(), loadActiveEreignisse()])
      .then(async ([requests, events]) => {
        if (cancelled) return
        setOpenAssistance(requests.length)
        setActiveEvents(events.length)
        const notifications = await Promise.all(events.map(async event => {
          const required = telefonketteFuer(event.dimension)
          if (required.length === 0) return 0
          const rows = await loadVerstaendigungen(event.id)
          const done = new Set(rows.filter(row => row.versucht_at || row.erreicht_at).map(row => row.empfaenger_key))
          return required.filter(label => !done.has(label
            .toLocaleLowerCase('de-AT')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, ''))).length
        }))
        if (!cancelled) setPendingNotifications(notifications.reduce((sum, value) => sum + value, 0))
      })
      .catch(() => { if (!cancelled) setIncomplete(true) })
    return () => { cancelled = true }
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
