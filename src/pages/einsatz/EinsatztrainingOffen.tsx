import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { canManageEinsatztraining } from '../../lib/einsatztraining'
import TrainingOffenPanel from './TrainingOffen'

export default function EinsatztrainingOffen() {
  const { hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const canManage = canManageEinsatztraining({ isStrictAdmin, isGenehmiger, rows: areaRoles, operativeModeActive })
  if (!hasAreaAccess('einsatz_mt')) return <Navigate to="/" replace />
  if (!canManage) return <Navigate to="/einsatz/training/module" replace />
  return <div>
    <div className="mb-4"><h1 className="text-2xl font-bold text-gray-900">Einsatztraining – Offen</h1></div>
    <TrainingOffenPanel canManage={canManage} isGenehmiger={isGenehmiger} />
  </div>
}
