import { AlertTriangle, ArrowLeft, CheckCircle2, Construction, PackageCheck, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import PortalChrome from '../components/PortalChrome'

export type PlannedAreaId = 'zentrale' | 'schulungen' | 'fuhrpark' | 'ueberstunden'

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
  fuhrpark: {
    title: 'Fuhrpark & Fahrzeuge',
    group: 'Organisatorische Angelegenheiten',
    description: 'Fahrzeugzustand, Kontrollen, Instandhaltung und Aufgaben der Fahrzeugverantwortlichen.',
    items: ['Übersicht', 'Fahrzeuge', 'Fahrzeugkontrolle & Bestandsaufnahme', 'Offene Mängel', 'Reinigung & Pflege', 'Fülllisten', 'Werkstatttermine', 'Unterlagen'],
  },
  ueberstunden: {
    title: 'Überstundenmeldung',
    group: 'Mein Bereich',
    description: 'Überstunden über das vorgegebene Formular erfassen und zur Prüfung abgeben.',
    items: ['Neue Überstundenmeldung', 'PDF-Vorschau', 'Meldung abgeben', 'Meine Meldungen', 'Rückfragen & Bearbeitungsstatus'],
  },
}

const PLANNED_FLEET = [
  { type: 'Dienstfahrzeug', make: 'Mercedes-Benz', model: 'Vito', callSign: 'Dornbirn Peter 1' },
  { type: 'Dienstfahrzeug', make: 'Volkswagen', model: 'Tiguan', callSign: 'Dornbirn Peter 2' },
  { type: 'Dienstfahrzeug', make: 'Mazda', model: 'CX-5', callSign: 'Dornbirn Peter 30' },
  { type: 'Motorrad', make: 'Details folgen', model: null, callSign: null },
  { type: 'Motorrad', make: 'Details folgen', model: null, callSign: null },
]

export default function PlannedArea({ area }: { area: PlannedAreaId }) {
  const content = AREA_CONTENT[area]
  return (
    <PortalChrome wide>
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" /> Zurück zum Portal
      </Link>

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

      {area === 'fuhrpark' ? (
        <>
          <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden mt-6">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Kontrolle vor jedem Dienst</h2>
              <p className="text-sm text-gray-500 mt-1">Fahrzeugbezogene Kofferraum- und Beladungsliste mit Sollbestand.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-5">
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-4"><PackageCheck className="w-5 h-5 text-blue-700 mb-3" /><h3 className="font-semibold text-gray-900">Bestand prüfen</h3><p className="text-sm text-gray-600 mt-1">Vollständig, fehlend, beschädigt oder abgelaufen je Position erfassen.</p></div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4"><AlertTriangle className="w-5 h-5 text-amber-700 mb-3" /><h3 className="font-semibold text-gray-900">Abweichung melden</h3><p className="text-sm text-gray-600 mt-1">Istmenge, Bemerkung und bei Bedarf ein Foto dokumentieren.</p></div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4"><Wrench className="w-5 h-5 text-emerald-700 mb-3" /><h3 className="font-semibold text-gray-900">Auffüllen & beheben</h3><p className="text-sm text-gray-600 mt-1">Sofort aufgefüllt bestätigen oder dem Fahrzeugverantwortlichen zuweisen.</p></div>
            </div>
            <div className="mx-5 mb-5 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
              Eine Kontrolle wird erst abgeschlossen, wenn jede Position geprüft wurde. Offene Abweichungen bleiben auf der Übersicht des zuständigen Fahrzeugverantwortlichen sichtbar.
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden mt-6">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Vorgesehener Fahrzeugbestand</h2>
              <p className="text-sm text-gray-500 mt-1">Vorläufige Stammdaten – Kennzeichen und Motorrad-Details werden später ergänzt.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-5">
              {PLANNED_FLEET.map((vehicle, index) => (
                <article key={`${vehicle.type}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{vehicle.type}</span>
                    <span className="text-xs text-gray-400">In Planung</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mt-2">{vehicle.make}{vehicle.model ? ` ${vehicle.model}` : ''}</h3>
                  <dl className="text-sm mt-3 space-y-1.5">
                    <div className="flex justify-between gap-3"><dt className="text-gray-500">Rufname</dt><dd className="font-medium text-gray-700 text-right">{vehicle.callSign ?? 'Noch offen'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gray-500">Kennzeichen</dt><dd className="font-medium text-gray-700">Noch offen</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </PortalChrome>
  )
}
