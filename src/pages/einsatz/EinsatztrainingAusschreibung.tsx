import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { canManageEinsatztraining } from '../../lib/einsatztraining'
import TrainingAusschreibungPanel from './TrainingAusschreibung'

export default function EinsatztrainingAusschreibung() {
  const { hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const canManage = canManageEinsatztraining({ isStrictAdmin, isGenehmiger, rows: areaRoles, operativeModeActive })
  if (!hasAreaAccess('einsatz_mt')) return <Navigate to="/" replace />
  return <div>
    <div className="mb-4"><h1 className="text-2xl font-bold text-gray-900">Einsatztraining – Ausschreibung</h1></div>
    <TrainingAusschreibungPanel canManage={canManage} isGenehmiger={isGenehmiger} />
  </div>
}
