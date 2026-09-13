import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { canManagePersonalEinsatzmittel } from '../../lib/personalEinsatzmittel'
import PoolEinsatzmittelRequestsPanel from './PoolEinsatzmittelRequests'

export default function EinsatzmittelBeschaffung() {
  const { hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const canManage = canManagePersonalEinsatzmittel({ isStrictAdmin, isGenehmiger, rows: areaRoles, operativeModeActive })
  if (!hasAreaAccess('einsatz_mt')) return <Navigate to="/" replace />
  if (!canManage) return <Navigate to="/einsatz/einsatzmittel/persoenlich" replace />
  return <div>
    <div className="mb-5"><h1 className="text-2xl font-bold text-gray-900">Einsatzmittel – Beschaffung</h1></div>
    <PoolEinsatzmittelRequestsPanel canManage={canManage} />
  </div>
}
