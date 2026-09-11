import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import PortalChrome from '../components/PortalChrome'
import PersonalEinsatzmittelPanel from './einsatz/PersonalEinsatzmittel'
import PoolEinsatzmittelPanel from './einsatz/PoolEinsatzmittel'
import LagerbestandPanel from './einsatz/Lagerbestand'
import EinsatztrainingPanel from './einsatz/Einsatztraining'
import { canManagePersonalEinsatzmittel } from '../lib/personalEinsatzmittel'
import {
  sanitizeEmSubTab,
  visibleEmSubTabs,
  type EmSubTab,
} from '../lib/einsatzmittelVisibility'

type EinsatzTab = 'einsatzmittel' | 'einsatztraining'

const TABS: { id: EinsatzTab; label: string }[] = [
  { id: 'einsatzmittel', label: 'Einsatzmittel' },
  { id: 'einsatztraining', label: 'Einsatztraining' },
]

export default function Einsatz() {
  const { hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const [tab, setTab] = useState<EinsatzTab>('einsatzmittel')
  const [emTab, setEmTab] = useState<EmSubTab>('persoenlich')

  if (!hasAreaAccess('einsatz_mt')) return <Navigate to="/" replace />

  const canManage = canManagePersonalEinsatzmittel({ isStrictAdmin, isGenehmiger, rows: areaRoles })
  const subTabs = visibleEmSubTabs(canManage)
  const visibleEmTab = sanitizeEmSubTab(emTab, canManage)

  return (
    <PortalChrome wide>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Einsatzmittel & Training</h1>
        <p className="text-gray-500 text-sm mt-1">Unterbereiche</p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-all ${
              tab === item.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'einsatzmittel' ? (
        <div>
          <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit max-w-full flex-wrap">
            {subTabs.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setEmTab(item.id)}
                className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-all ${
                  visibleEmTab === item.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {visibleEmTab === 'persoenlich' ? (
            <PersonalEinsatzmittelPanel />
          ) : visibleEmTab === 'pool' ? (
            <PoolEinsatzmittelPanel />
          ) : canManage ? (
            <LagerbestandPanel />
          ) : (
            <PersonalEinsatzmittelPanel />
          )}
        </div>
      ) : (
        <EinsatztrainingPanel />
      )}
    </PortalChrome>
  )
}
