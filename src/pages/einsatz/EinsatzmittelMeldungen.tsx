import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { canManagePersonalEinsatzmittel } from '../../lib/personalEinsatzmittel'
import PersonalEinsatzmittelRequestsPanel from './PersonalEinsatzmittelRequests'

export default function EinsatzmittelMeldungen() {
  const { hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const canManage = canManagePersonalEinsatzmittel({ isStrictAdmin, isGenehmiger, rows: areaRoles, operativeModeActive })
  if (!hasAreaAccess('einsatz_mt')) return <Navigate to="/" replace />
  return <div>
    <div className="mb-5"><h1 className="text-2xl font-bold text-gray-900">Einsatzmittel – {canManage ? 'Zur Bestätigung' : 'Meine Meldungen'}</h1></div>
    <PersonalEinsatzmittelRequestsPanel canManage={canManage} />
  </div>
}
