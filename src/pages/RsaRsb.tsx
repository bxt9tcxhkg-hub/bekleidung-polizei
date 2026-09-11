import { ArrowLeft } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import PortalChrome from '../components/PortalChrome'
import MailDeliveries from '../components/MailDeliveries'
import { useAuth } from '../contexts/AuthContext'

/**
 * Eigenständiger Einstiegspunkt für RSa/RSb-Zustellungen und Vernehmungen –
 * unabhängig vom heutigen Dienst nutzbar (kein Erfordernis, eine Funktion
 * gewählt oder "operativ" zu sein). Dieselbe Übersicht ist zusätzlich in
 * Zentrale, Außendienst und Innendienst als Reiter eingebettet.
 */
export default function RsaRsb() {
  const { hasAreaAccess } = useAuth()
  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  return <PortalChrome wide>
    <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-5"><ArrowLeft className="w-4 h-4" /> Zurück zum Portal</Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">RSa/RSb & Vernehmungen</h1><p className="text-sm text-gray-500 mt-1">Schwer erreichbare Personen – unabhängig vom heutigen Dienst erfassbar.</p></div>
    <MailDeliveries />
  </PortalChrome>
}
