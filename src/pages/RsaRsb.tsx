import { ArrowLeft } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import MailDeliveries from '../components/MailDeliveries'
import { useAuth } from '../contexts/AuthContext'
import type { ContextualReference } from '../lib/contextualReference'

/**
 * Eigenständiger Einstiegspunkt für RSa/RSb-Zustellungen und Vernehmungen –
 * unabhängig vom heutigen Dienst nutzbar (kein Erfordernis, eine Funktion
 * gewählt oder "operativ" zu sein). Bereichsübergreifender Datenpool mit
 * eigener Portal-Kachel, kein Unterpunkt von Zentrale, Außendienst oder
 * Innendienst - die Zentrale-Übersicht zeigt dafür nur die Anzahl offener Fälle.
 */
export default function RsaRsb({ context }: { context?: ContextualReference }) {
  // Für jeden aktiven Benutzer der Stadtpolizei offen (unabhängig von jedem
  // Portalbereich, siehe RLS-Migration 20260919060000) - schwer erreichbare
  // Personen können unabhängig von der eigenen Tagesfunktion auftauchen.
  const { profile, loading } = useAuth()
  if (!loading && !profile) return <Navigate to="/" replace />

  return <div>
    <Link to={context?.backTo ?? '/'} className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4">
      <ArrowLeft className="w-4 h-4" /> {context?.backLabel ?? 'Zum Portal'}
    </Link>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Operativer Bereich</p><h1 className="text-2xl font-bold text-gray-900 mt-1">RSa/RSb & Vernehmungen</h1><p className="text-sm text-gray-500 mt-1">Schwer erreichbare Personen – unabhängig vom heutigen Dienst erfassbar.</p></div>
    <MailDeliveries />
  </div>
}
