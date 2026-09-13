import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { canManageEinsatztraining, fachlogikSummary } from '../../lib/einsatztraining'
import TrainingModulesPanel from './TrainingModules'

export default function EinsatztrainingModule() {
  const { hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const canManage = canManageEinsatztraining({ isStrictAdmin, isGenehmiger, rows: areaRoles, operativeModeActive })
  if (!hasAreaAccess('einsatz_mt')) return <Navigate to="/" replace />
  return <div>
    <div className="mb-4"><h1 className="text-2xl font-bold text-gray-900">Einsatztraining – {canManage ? 'Module' : 'Mein Status'}</h1><p className="text-sm text-gray-500 mt-1">{canManage ? fachlogikSummary() : 'Eigener Stand und Anmeldung'}</p></div>
    <TrainingModulesPanel canManage={canManage} />
  </div>
}
