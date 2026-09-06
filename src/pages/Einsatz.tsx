import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import PortalChrome from '../components/PortalChrome'
import PersonalEinsatzmittelPanel from './einsatz/PersonalEinsatzmittel'

type EinsatzTab = 'einsatzmittel' | 'einsatztraining'

const TABS: { id: EinsatzTab; label: string }[] = [
  { id: 'einsatzmittel', label: 'Einsatzmittel' },
  { id: 'einsatztraining', label: 'Einsatztraining' },
]

export default function Einsatz() {
  const { hasAreaAccess } = useAuth()
  const [tab, setTab] = useState<EinsatzTab>('einsatzmittel')

  if (!hasAreaAccess('einsatz_mt')) return <Navigate to="/" replace />

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
        <PersonalEinsatzmittelPanel />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Einsatztraining</h2>
          <p className="text-sm text-gray-500">folgt</p>
        </div>
      )}
    </PortalChrome>
  )
}
