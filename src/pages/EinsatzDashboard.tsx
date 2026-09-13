import { Link, Navigate } from 'react-router-dom'
import { BookOpen, ClipboardCheck, Shield, Target } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { canManagePersonalEinsatzmittel } from '../lib/personalEinsatzmittel'

export default function EinsatzDashboard() {
  const { hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  if (!hasAreaAccess('einsatz_mt')) return <Navigate to="/" replace />

  const canManage = canManagePersonalEinsatzmittel({ isStrictAdmin, isGenehmiger, rows: areaRoles, operativeModeActive })
  const cards = [
    {
      to: '/einsatz/einsatzmittel',
      label: 'Einsatzmittel',
      description: canManage ? 'Persönliche Ausrüstung, Pool, Lager und Bestätigungen' : 'Eigene Ausrüstung ansehen oder erfassen',
      icon: Shield,
      color: 'bg-blue-50 text-blue-700',
      iconBg: 'bg-blue-100',
    },
    {
      to: '/einsatz/training',
      label: 'Einsatztraining',
      description: canManage ? 'Module, offene Teilnehmer, Termine und Protokolle' : 'Status, Termine und Protokolle',
      icon: Target,
      color: 'bg-green-50 text-green-700',
      iconBg: 'bg-green-100',
    },
    {
      to: '/einsatz/unterlagen',
      label: 'Unterlagen',
      description: 'Dienstanweisungen und Schulungsmaterial',
      icon: BookOpen,
      color: 'bg-indigo-50 text-indigo-700',
      iconBg: 'bg-indigo-100',
    },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Einsatzmittel & Training</h1>
        <p className="text-gray-500 text-sm mt-1">Eigener Bereich für Ausrüstung, Ausbildung und Unterlagen</p>
      </div>

      {canManage ? (
        <Link
          to="/einsatz/einsatzmittel?tab=meldungen"
          className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-amber-800 hover:bg-amber-100 transition-colors"
        >
          <ClipboardCheck className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-sm">Benutzermeldungen prüfen</p>
            <p className="text-xs mt-0.5">Offene Meldungen werden erst nach Bestätigung in den Bestand übernommen.</p>
          </div>
        </Link>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map(({ to, label, description, icon: Icon, color, iconBg }) => (
          <Link key={to} to={to} className={`rounded-xl p-5 ${color} hover:brightness-95 transition-all`}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold">{label}</span>
              <div className={`${iconBg} p-2.5 rounded-lg`}><Icon className="w-5 h-5" /></div>
            </div>
            <p className="text-sm opacity-80">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
