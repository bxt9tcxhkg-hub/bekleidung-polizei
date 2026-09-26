import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { canManageSchulungen } from '../lib/schulungen'
import EinsatzMaterials from './EinsatzMaterials'
import SchulungenModulePanel from './schulungen/SchulungenModule'
import SchulungenOffenPanel from './schulungen/SchulungenOffen'
import SchulungenAusschreibungPanel from './schulungen/SchulungenAusschreibung'
import SchulungenProtokollPanel from './schulungen/SchulungenProtokoll'

type SchulungenTab = 'module' | 'offen' | 'ausschreibung' | 'protokoll' | 'unterlagen'

const MANAGE_TABS: { id: SchulungenTab; label: string }[] = [
  { id: 'module', label: 'Module' },
  { id: 'offen', label: 'Offen' },
  { id: 'ausschreibung', label: 'Ausschreibung' },
  { id: 'protokoll', label: 'Protokoll' },
  { id: 'unterlagen', label: 'Unterlagen' },
]

const USER_TABS: { id: SchulungenTab; label: string }[] = [
  { id: 'module', label: 'Mein Status' },
  { id: 'ausschreibung', label: 'Ausschreibung' },
  { id: 'unterlagen', label: 'Unterlagen' },
]

export default function Schulungen() {
  const { hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const canManage = canManageSchulungen({ isStrictAdmin, isGenehmiger, rows: areaRoles })
  const tabs = canManage ? MANAGE_TABS : USER_TABS
  const [subTab, setSubTab] = useState<SchulungenTab>('module')
  const visibleTab = tabs.some(tab => tab.id === subTab) ? subTab : 'module'

  if (!hasAreaAccess('schulungen')) return <Navigate to="/" replace />

  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline mb-4">
        <ArrowLeft className="w-4 h-4" /> Zum Portal
      </Link>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Schulungen</h1>
        <p className="text-gray-500 text-sm mt-1">
          {canManage ? 'Module, Termine, Anmeldungen und Unterlagen' : 'Eigener Stand, Anmeldung und Unterlagen'}
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
        <SchulungenModulePanel canManage={canManage} />
      ) : visibleTab === 'offen' ? (
        <SchulungenOffenPanel canManage={canManage} />
      ) : visibleTab === 'ausschreibung' ? (
        <SchulungenAusschreibungPanel canManage={canManage} />
      ) : visibleTab === 'protokoll' ? (
        <SchulungenProtokollPanel canManage={canManage} />
      ) : (
        <EinsatzMaterials fixedArea="schulungen" />
      )}
    </div>
  )
}
