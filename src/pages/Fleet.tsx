import { ArrowLeft, Bike, Car, ChevronRight, Construction } from 'lucide-react'
import { Link } from 'react-router-dom'
import PortalChrome from '../components/PortalChrome'
import { FLEET_VEHICLES, vehicleTitle } from '../data/fleet'

export default function Fleet() {
  return (
    <PortalChrome wide>
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" /> Zurück zum Portal
      </Link>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 flex items-start gap-4">
        <div className="bg-amber-100 text-amber-700 p-2.5 rounded-xl"><Construction className="w-5 h-5" /></div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">Grundstruktur · nur für Admin sichtbar</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Fuhrpark &amp; Fahrzeuge</h1>
          <p className="text-gray-600 mt-2">Fahrzeug auswählen, um Stammdaten, Kontrollen, Bestand, Mängel und Termine fahrzeugbezogen weiterzuführen.</p>
        </div>
      </div>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">Dienstfahrzeuge</h2>
          <p className="text-sm text-gray-500 mt-1">Jedes Fahrzeug besitzt einen eigenen Bearbeitungsbereich.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FLEET_VEHICLES.map(vehicle => {
            const Icon = vehicle.kind === 'Motorrad' ? Bike : Car
            return (
              <Link key={vehicle.id} to={`/planung/fuhrpark/${vehicle.id}`} className="group rounded-2xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all">
                <div className="flex items-start gap-4">
                  <div className="bg-blue-50 text-blue-700 p-3 rounded-xl"><Icon className="w-6 h-6" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{vehicle.kind}</p>
                        <h3 className="font-bold text-gray-900 mt-1">{vehicleTitle(vehicle)}</h3>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-700 flex-shrink-0" />
                    </div>
                    <dl className="text-sm mt-4 space-y-2">
                      <div className="flex justify-between gap-3"><dt className="text-gray-500">Rufname</dt><dd className="font-medium text-gray-700 text-right">{vehicle.callSign ?? 'Details folgen'}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-gray-500">Kennzeichen</dt><dd className="font-medium text-gray-700 text-right">{vehicle.licensePlate ?? 'Noch offen'}</dd></div>
                    </dl>
                    <p className="text-xs font-semibold text-blue-700 mt-4">Fahrzeug öffnen</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </PortalChrome>
  )
}
