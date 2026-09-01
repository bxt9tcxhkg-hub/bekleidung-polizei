import type { ElementType } from 'react'
import { Check, ClipboardList, Plus, ShoppingBag, Warehouse, X } from 'lucide-react'
import type { Tab } from './types'
import { useLager } from './useLager'
import { BestandTab } from './BestandTab'
import { BestellenTab } from './BestellenTab'
import { HistorieTab } from './HistorieTab'
import { LagerModals } from './LagerModals'

export default function LagerPage() {
  const lager = useLager()
  const {
    tab, setTab,
    error, setError,
    pendingOrdersCount, approvedOrdersCount,
    setAddForm, setCartOpen, cartCount,
    loading, submitted, setSubmitted,
  } = lager

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lagerverwaltung</h1>
        <p className="text-gray-500 text-sm mt-1">Bestand erfassen und Nachbestellungen verwalten</p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <span className="flex-1 text-sm font-medium text-red-700">{error}</span>
          <button onClick={() => setError('')} className="p-1 rounded hover:bg-red-100"><X className="w-4 h-4 text-red-500" /></button>
        </div>
      )}

      {/* Tabs + action button */}
      <div className="flex items-center gap-2 mb-5">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-1 min-w-0">
        {([
          { key: 'bestand', label: 'Bestand', shortLabel: 'Bestand', icon: Warehouse },
          { key: 'bestellen', label: 'Nachbestellen', shortLabel: 'Bestellen', icon: ShoppingBag },
          { key: 'historie', label: 'Bestellhistorie', shortLabel: 'Historie', icon: ClipboardList },
        ] as { key: Tab; label: string; shortLabel: string; icon: ElementType }[]).map(({ key, label, shortLabel, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium px-2 py-2 rounded-lg transition-all relative ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{shortLabel}</span>
            {key === 'historie' && (pendingOrdersCount + approvedOrdersCount) > 0 && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {pendingOrdersCount + approvedOrdersCount}
              </span>
            )}
          </button>
        ))}
        </div>
        {tab === 'bestand' && (
          <button onClick={() => setAddForm({ product_id: '', size: '', quantity: '' })}
            className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors flex-shrink-0">
            <Plus className="w-4 h-4 flex-shrink-0" /><span className="hidden sm:inline">Bestand erfassen</span>
          </button>
        )}
        {tab === 'bestellen' && (
          <button onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-xl transition-colors flex-shrink-0">
            <ShoppingBag className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">Warenkorb</span>
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <>
          {/* Erfolgsbanner – sichtbar unabhängig vom aktiven Tab */}
          {submitted && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
              <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-sm text-green-800">Lagerbestellung eingereicht</p>
                <p className="text-xs text-green-700 mt-0.5">Die Bestellung wartet auf Freigabe durch den Genehmiger.</p>
              </div>
              <button onClick={() => setSubmitted(false)} className="p-1 rounded hover:bg-green-100"><X className="w-4 h-4 text-green-600" /></button>
            </div>
          )}

          {/* ── Bestand ── */}
          {tab === 'bestand' && <BestandTab lager={lager} />}

          {/* ── Bestellen ── */}
          {tab === 'bestellen' && <BestellenTab lager={lager} />}

          {/* ── Bestellhistorie ── */}
          {tab === 'historie' && <HistorieTab lager={lager} />}
        </>
      )}

      <LagerModals lager={lager} />
    </div>
  )
}
