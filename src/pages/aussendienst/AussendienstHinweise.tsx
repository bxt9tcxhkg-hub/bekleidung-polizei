import { Info } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import type { AussendienstContext } from './AussendienstShell'
import { EntryOrIncidentList } from './aussendienstShared'

export default function AussendienstHinweise() {
  const ctx = useOutletContext<AussendienstContext>()
  const lage = ctx.entries.filter(item => item.category === 'lage')
  return <div className="space-y-4">
    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 flex items-start gap-3">
      <Info className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
      <div><p className="text-sm font-semibold text-blue-900">Einsatzbezogene Hinweise erscheinen direkt beim Einsatz.</p><p className="text-xs text-blue-800 mt-1">Schutzmaßnahmen, Fahndungen und Personenhinweise werden hier nicht mehr pauschal aufgelistet, damit der Außendienst nicht mit nicht relevanten Informationen belastet wird.</p></div>
    </div>
    <EntryOrIncidentList kind="entries" entries={lage} />
  </div>
}
