import { CheckCircle2, Construction } from 'lucide-react'
import BackLink from '../components/BackLink'
import PortalChrome from '../components/PortalChrome'

export type PlannedAreaId = 'zentrale' | 'schulungen'

const AREA_CONTENT: Record<PlannedAreaId, { title: string; group: string; description: string; items: string[] }> = {
  zentrale: {
    title: 'Zentrale',
    group: 'Operativer Bereich',
    description: 'Interne Informationen und Arbeitshilfen für den Zentralisten – als Ergänzung zum bestehenden Aktenprogramm.',
    items: ['Operative Übersicht', 'Interne Informationen', 'Schichtübergabe', 'Straßenzustandsbericht mit PDF', 'Schlüsselregister', 'Kontakte', 'Alarmierung & Unterlagen'],
  },
  schulungen: {
    title: 'Schulungen',
    group: 'Organisatorische Angelegenheiten',
    description: 'Allgemeine Aus- und Fortbildungen außerhalb des operativen Einsatztrainings.',
    items: ['Übersicht', 'PAD', 'Weitere Schulungen', 'Rechtsinformationen zu KFG, StVO und weiteren Themen', 'Meine Schulungen', 'Unterlagen'],
  },
}

export default function PlannedArea({ area }: { area: PlannedAreaId }) {
  const content = AREA_CONTENT[area]
  return (
    <PortalChrome wide>
      <BackLink to="/" label="Zurück zum Portal" className="mb-6" />

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 flex items-start gap-4">
        <div className="bg-amber-100 text-amber-700 p-2.5 rounded-xl"><Construction className="w-5 h-5" /></div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">In Planung · nur für Admin sichtbar</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{content.title}</h1>
          <p className="text-sm font-medium text-gray-500 mt-1">{content.group}</p>
          <p className="text-gray-600 mt-3 max-w-3xl">{content.description}</p>
        </div>
      </div>

      <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Vorgesehene Grundstruktur</h2>
          <p className="text-sm text-gray-500 mt-1">Die einzelnen Abläufe und Formulare werden anschließend gemeinsam festgelegt.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-5">
          {content.items.map(item => (
            <div key={item} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700">{item}</span>
            </div>
          ))}
        </div>
      </section>
    </PortalChrome>
  )
}
