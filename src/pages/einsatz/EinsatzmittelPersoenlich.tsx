import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import PersonalEinsatzmittelPanel from './PersonalEinsatzmittel'

export default function EinsatzmittelPersoenlich() {
  const { hasAreaAccess } = useAuth()
  if (!hasAreaAccess('einsatz_mt')) return <Navigate to="/" replace />
  return <div>
    <div className="mb-5"><h1 className="text-2xl font-bold text-gray-900">Einsatzmittel – Persönlich</h1><p className="text-gray-500 text-sm mt-1">Eigene und gemeinsam verwendete Einsatzmittel</p></div>
    <PersonalEinsatzmittelPanel />
  </div>
}
