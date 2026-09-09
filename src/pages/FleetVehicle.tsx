import { AlertTriangle, ArrowLeft, Bike, CalendarDays, Car, ClipboardCheck, Construction, PackageCheck, Sparkles, Wrench } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import PortalChrome from '../components/PortalChrome'
import { FLEET_VEHICLES, vehicleTitle } from '../data/fleet'

const WORK_AREAS = [
  { title: 'Fahrzeugkontrolle', description: 'Checkliste vor Dienstbeginn und letzte Kontrollen.', icon: ClipboardCheck, tone: 'blue' },
  { title: 'Bestand & Füllliste', description: 'Sollbestand im Fahrzeug prüfen und Fehlmengen erfassen.', icon: PackageCheck, tone: 'blue' },
  { title: 'Offene Mängel', description: 'Fehlende, beschädigte oder abgelaufene Ausstattung.', icon: AlertTriangle, tone: 'amber' },
  { title: 'Reinigung & Pflege', description: 'Durchgeführte Reinigung und offene Pflegeaufgaben.', icon: Sparkles, tone: 'emerald' },
  { title: 'Werkstatt & Termine', description: 'Werkstatttermine, Wartungen und Reparaturen.', icon: Wrench, tone: 'slate' },
  { title: 'Fristen', description: 'Anstehende Prüfungen und fahrzeugbezogene Termine.', icon: CalendarDays, tone: 'slate' },
] as const

const TONE = {
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  slate: 'bg-slate-50 text-slate-700 border-slate-200',
}

export default function FleetVehicle() {
  const { vehicleId } = useParams()
  const vehicle = FLEET_VEHICLES.find(item => item.id === vehicleId)

  if (!vehicle) {
    return (
      <PortalChrome>
        <Link to="/planung/fuhrpark" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Zur Fahrzeugübersicht
        </Link>
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900">Fahrzeug nicht gefunden</h1>
        </div>
      </PortalChrome>
    )
  }

  const VehicleIcon = vehicle.kind === 'Motorrad' ? Bike : Car

  return (
    <PortalChrome wide>
      <Link to="/planung/fuhrpark" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" /> Zur Fahrzeugübersicht
      </Link>

      <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="bg-blue-50 text-blue-700 p-3 rounded-xl w-fit"><VehicleIcon className="w-7 h-7" /></div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{vehicle.kind}</p>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">{vehicleTitle(vehicle)}</h1>
            <p className="text-sm text-gray-500 mt-1">{vehicle.callSign ?? 'Rufname wird ergänzt'}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg w-fit">
            <Construction className="w-3.5 h-3.5" /> In Planung
          </span>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-gray-200">
          <div className="bg-white p-4"><dt className="text-xs text-gray-500">Hersteller</dt><dd className="font-semibold text-gray-900 mt-1">{vehicle.make ?? 'Noch offen'}</dd></div>
          <div className="bg-white p-4"><dt className="text-xs text-gray-500">Modell</dt><dd className="font-semibold text-gray-900 mt-1">{vehicle.model ?? 'Noch offen'}</dd></div>
          <div className="bg-white p-4"><dt className="text-xs text-gray-500">Kennzeichen</dt><dd className="font-semibold text-gray-900 mt-1">{vehicle.licensePlate ?? 'Noch offen'}</dd></div>
        </dl>
      </section>

      {vehicle.detailsPending ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-gray-900">Fahrzeugdaten folgen</h2>
          <p className="text-sm text-gray-600 mt-1">Hersteller, Modell, Rufname und Kennzeichen werden ergänzt, sobald die Angaben feststehen.</p>
        </div>
      ) : null}

      <section className="mt-6">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900">Fahrzeugbezogene Bearbeitung</h2>
          <p className="text-sm text-gray-500 mt-1">Alle weiteren Funktionen werden für dieses Fahrzeug an dieser Stelle zusammengeführt.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {WORK_AREAS.map(({ title, description, icon: Icon, tone }) => (
            <article key={title} className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className={`w-fit p-2.5 rounded-xl border ${TONE[tone]}`}><Icon className="w-5 h-5" /></div>
              <h3 className="font-semibold text-gray-900 mt-4">{title}</h3>
              <p className="text-sm text-gray-500 mt-1">{description}</p>
              <p className="text-xs font-medium text-gray-400 mt-4">Funktion in Planung</p>
            </article>
          ))}
        </div>
      </section>
    </PortalChrome>
  )
}
