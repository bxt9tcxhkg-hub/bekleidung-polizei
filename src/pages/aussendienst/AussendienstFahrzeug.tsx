import { Link, useOutletContext } from 'react-router-dom'
import type { AussendienstContext } from './AussendienstShell'
import { Empty } from './aussendienstShared'

export default function AussendienstFahrzeug() {
  const ctx = useOutletContext<AussendienstContext>()
  const ownVehicle = ctx.ownVehicle
  if (!ownVehicle) return <Empty text="Kein Fahrzeug zugewiesen." />
  return <div className="rounded-2xl border border-gray-200 bg-white p-5">
    <h2 className="font-bold text-gray-900">{ownVehicle.name}</h2>
    <dl className="text-sm mt-3 space-y-1.5">
      <div className="flex justify-between"><dt className="text-gray-500">Rufname</dt><dd className="font-medium">{ownVehicle.call_sign || '–'}</dd></div>
      <div className="flex justify-between"><dt className="text-gray-500">Kennzeichen</dt><dd className="font-medium">{ownVehicle.license_plate || '–'}</dd></div>
      <div className="flex justify-between"><dt className="text-gray-500">Marke/Modell</dt><dd className="font-medium">{[ownVehicle.make, ownVehicle.model].filter(Boolean).join(' ') || '–'}</dd></div>
    </dl>
    <Link to={`/fuhrpark/${ownVehicle.id}`} className="inline-block mt-4 text-sm font-semibold text-blue-700">Fahrzeugdetails im Fuhrpark →</Link>
  </div>
}
