import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { canManageEinsatztraining } from '../../lib/einsatztraining'
import TrainingProtokollPanel from './TrainingProtokoll'

export default function EinsatztrainingProtokoll() {
  const { hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const canManage = canManageEinsatztraining({ isStrictAdmin, isGenehmiger, rows: areaRoles, operativeModeActive })
  if (!hasAreaAccess('einsatz_mt')) return <Navigate to="/" replace />
  return <div>
    <div className="mb-4"><h1 className="text-2xl font-bold text-gray-900">Einsatztraining – Protokoll</h1></div>
    <TrainingProtokollPanel canManage={canManage} />
  </div>
}
