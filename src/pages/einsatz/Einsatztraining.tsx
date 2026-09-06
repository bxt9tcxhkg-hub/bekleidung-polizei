import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { cadenceSummary, canManageEinsatztraining } from '../../lib/einsatztraining'
import TrainingModulesPanel from './TrainingModules'
import TrainingProtokollPanel from './TrainingProtokoll'
import TrainingExternPanel from './TrainingExtern'

type TrainingSubTab = 'module' | 'protokoll' | 'extern'

const SUB_TABS: { id: TrainingSubTab; label: string }[] = [
  { id: 'module', label: 'Module' },
  { id: 'protokoll', label: 'Internes Protokoll' },
  { id: 'extern', label: 'Externes Training' },
]

export default function EinsatztrainingPanel() {
  const { isStrictAdmin, areaRoles } = useAuth()
  const canManage = canManageEinsatztraining({ isStrictAdmin, rows: areaRoles })
  const [subTab, setSubTab] = useState<TrainingSubTab>('module')

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Einsatztraining</h2>
        <p className="text-sm text-gray-500 mt-1">
          {canManage ? 'Module und Protokoll' : 'Nur Leserecht'}
          {' · '}
          {cadenceSummary()}
        </p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit max-w-full flex-wrap">
        {SUB_TABS.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSubTab(item.id)}
            className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-all ${
              subTab === item.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {subTab === 'module' ? (
        <TrainingModulesPanel canManage={canManage} />
      ) : subTab === 'protokoll' ? (
        <TrainingProtokollPanel canManage={canManage} />
      ) : (
        <TrainingExternPanel canManage={canManage} />
      )}
    </div>
  )
}
