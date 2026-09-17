import { Navigate } from 'react-router-dom'
import MailDeliveries from '../components/MailDeliveries'
import { useAuth } from '../contexts/AuthContext'

/**
 * Eigenständiger Einstiegspunkt für RSa/RSb-Zustellungen und Vernehmungen –
 * unabhängig vom heutigen Dienst nutzbar (kein Erfordernis, eine Funktion
 * gewählt oder "operativ" zu sein). Bereichsübergreifender Datenpool mit
 * eigener Portal-Kachel, kein Unterpunkt von Zentrale, Außendienst oder
 * Innendienst - die Zentrale-Übersicht zeigt dafür nur die Anzahl offener Fälle.
 */
export default function RsaRsb() {
  const { hasAreaAccess } = useAuth()
  if (!hasAreaAccess('zentrale')) return <Navigate to="/" replace />

  return <div>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">RSa/RSb & Vernehmungen</h1><p className="text-sm text-gray-500 mt-1">Schwer erreichbare Personen – unabhängig vom heutigen Dienst erfassbar.</p></div>
    <MailDeliveries />
  </div>
}
