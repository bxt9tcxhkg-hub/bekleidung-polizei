import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { canManageEinsatztraining, fachlogikSummary } from '../../lib/einsatztraining'
import TrainingModulesPanel from './TrainingModules'
import TrainingOffenPanel from './TrainingOffen'
import TrainingAusschreibungPanel from './TrainingAusschreibung'
import TrainingProtokollPanel from './TrainingProtokoll'

type TrainingSubTab = 'module' | 'offen' | 'ausschreibung' | 'protokoll'

const MANAGE_TABS: { id: TrainingSubTab; label: string }[] = [
  { id: 'module', label: 'Module' },
  { id: 'offen', label: 'Offen' },
  { id: 'ausschreibung', label: 'Ausschreibung' },
  { id: 'protokoll', label: 'Protokoll' },
]

const USER_TABS: { id: TrainingSubTab; label: string }[] = [
  { id: 'module', label: 'Mein Status' },
  { id: 'ausschreibung', label: 'Ausschreibung' },
  { id: 'protokoll', label: 'Protokoll' },
]

export default function EinsatztrainingPanel() {
  const { isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const canManage = canManageEinsatztraining({ isStrictAdmin, isGenehmiger, rows: areaRoles })
  const tabs = canManage ? MANAGE_TABS : USER_TABS
  const [subTab, setSubTab] = useState<TrainingSubTab>('module')
  const visibleTab = tabs.some(tab => tab.id === subTab) ? subTab : 'module'

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Einsatztraining</h2>
        <p className="text-sm text-gray-500 mt-1">
          {canManage ? fachlogikSummary() : 'Eigener Stand und Anmeldung'}
        </p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit max-w-full flex-wrap">
        {tabs.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSubTab(item.id)}
            className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-all ${
              visibleTab === item.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visibleTab === 'module' ? (
        <TrainingModulesPanel canManage={canManage} />
      ) : visibleTab === 'offen' ? (
        <TrainingOffenPanel canManage={canManage} />
      ) : visibleTab === 'ausschreibung' ? (
        <TrainingAusschreibungPanel canManage={canManage} />
      ) : (
        <TrainingProtokollPanel canManage={canManage} />
      )}
    </div>
  )
}
