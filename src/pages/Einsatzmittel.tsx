import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { canManagePersonalEinsatzmittel } from '../lib/personalEinsatzmittel'
import { canPurchasePoolEinsatzmittel } from '../lib/poolEinsatzmittel'
import { supabase } from '../lib/supabase'
import LagerbestandPanel from './einsatz/Lagerbestand'
import PersonalEinsatzmittelPanel from './einsatz/PersonalEinsatzmittel'
import PersonalEinsatzmittelRequestsPanel from './einsatz/PersonalEinsatzmittelRequests'
import PoolEinsatzmittelPanel from './einsatz/PoolEinsatzmittel'
import PoolEinsatzmittelRequestsPanel from './einsatz/PoolEinsatzmittelRequests'

type TabId = 'persoenlich' | 'pool' | 'lager' | 'meldungen' | 'beschaffung'

export default function Einsatzmittel() {
  const { hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, operativeModeActive } = useAuth()
  const [params, setParams] = useSearchParams()
  const canManage = canManagePersonalEinsatzmittel({ isStrictAdmin, isGenehmiger, rows: areaRoles, operativeModeActive })
  const canPurchase = canPurchasePoolEinsatzmittel({ isStrictAdmin, isGenehmiger })
  const requested = params.get('tab') as TabId | null
  const allowed: TabId[] = canManage
    ? ['persoenlich', 'pool', 'lager', 'beschaffung', 'meldungen']
    : ['persoenlich', 'pool', 'meldungen']
  const active = requested && allowed.includes(requested) ? requested : 'persoenlich'
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingPoolCount, setPendingPoolCount] = useState(0)
  const [pendingRefresh, setPendingRefresh] = useState(0)

  useEffect(() => {
    if (!canManage) return
    supabase
      .from('personal_einsatzmittel_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPendingCount(count ?? 0))
    if (canPurchase) {
      supabase
        .from('pool_einsatzmittel_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .then(({ count }) => setPendingPoolCount(count ?? 0))
    }
  }, [canManage, canPurchase, active, pendingRefresh])

  if (!hasAreaAccess('einsatz_mt')) return <Navigate to="/" replace />

  const tabs: { id: TabId; label: string }[] = [
    { id: 'persoenlich', label: 'Persönlich' },
    { id: 'pool', label: 'Pool' },
    ...(canManage ? [{ id: 'lager' as const, label: 'Lagerbestand' }] : []),
    ...(canManage ? [{ id: 'beschaffung' as const, label: 'Beschaffung' }] : []),
    { id: 'meldungen', label: canManage ? 'Zur Bestätigung' : 'Meine Meldungen' },
  ]

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Einsatzmittel</h1>
        <p className="text-gray-500 text-sm mt-1">
          {canManage ? 'Zuteilungen, Poolbestand und Benutzermeldungen' : 'Eigene und gemeinsam verwendete Einsatzmittel'}
        </p>
      </div>
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit max-w-full flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setParams({ tab: tab.id })}
            className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-all ${
              active === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.id === 'meldungen' && canManage && pendingCount > 0 ? (
              <span className="ml-2 bg-amber-100 text-amber-800 text-xs px-1.5 py-0.5 rounded-full">{pendingCount}</span>
            ) : null}
            {tab.id === 'beschaffung' && canPurchase && pendingPoolCount > 0 ? (
              <span className="ml-2 bg-amber-100 text-amber-800 text-xs px-1.5 py-0.5 rounded-full">{pendingPoolCount}</span>
            ) : null}
          </button>
        ))}
      </div>
      {active === 'persoenlich' ? <PersonalEinsatzmittelPanel />
        : active === 'pool' ? <PoolEinsatzmittelPanel />
          : active === 'lager' && canManage ? <LagerbestandPanel />
            : active === 'beschaffung' && canManage ? <PoolEinsatzmittelRequestsPanel canManage={canManage} />
              : <PersonalEinsatzmittelRequestsPanel canManage={canManage} onChanged={() => setPendingRefresh(value => value + 1)} />}
    </div>
  )
}
