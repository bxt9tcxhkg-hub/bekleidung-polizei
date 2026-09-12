import { ArrowLeft } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import MailDeliveries from '../../components/MailDeliveries'
import { useAuth } from '../../contexts/AuthContext'

export default function ZentraleRsaRsb() {
  const { hasAreaAccess } = useAuth()
  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />
  return <div>
    <Link to="/zentrale" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4"><ArrowLeft className="w-4 h-4" /> Zur Zentrale</Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich · Zentrale</p><h1 className="text-2xl font-bold text-gray-900 mt-1">RSa/RSb</h1><p className="text-sm text-gray-500 mt-1">Zustellungen und Vernehmungen schwer erreichbarer Personen.</p></div>
    <MailDeliveries />
  </div>
}
