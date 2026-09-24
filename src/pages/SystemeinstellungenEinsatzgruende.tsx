import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import EinsatzgrundEinstellungen from '../components/EinsatzgrundEinstellungen'

export default function SystemeinstellungenEinsatzgruende() {
  return <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
    <Link to="/portal/systemeinstellungen" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4" /> Zu Systemeinstellungen</Link>
    <h1 className="mt-5 text-2xl font-bold text-gray-900">Einsatzgründe</h1>
    <p className="mt-2 text-sm text-gray-600">Diese Angaben steuern die Auswahl in der Einsatzaufnahme tatsächlich.</p>
    <EinsatzgrundEinstellungen />
  </div>
}
