import { Package } from 'lucide-react'
import Lieferungen from '../Lieferungen'
import { ADMIN_TABS } from './types'
import { useOrders } from './useOrders'
import OrdersTables from './OrdersTables'
import OrdersActionBars from './OrdersActionBars'

export default function OrdersPage() {
  const o = useOrders()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bestellungen</h1>
        <p className="text-gray-500 text-sm mt-1">Bestellverwaltung</p>
      </div>

      {o.error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium">{o.error}</div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 scrollbar-hide flex-nowrap">
        {ADMIN_TABS.map(tab => (
          <button key={tab.key} onClick={() => o.switchTab(tab.key)}
            className={`flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-lg border transition-colors ${
              o.activeTab === tab.key ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'
            }`}>
            {tab.label}
            {o.counts[tab.key] > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full leading-none ${o.activeTab === tab.key ? 'bg-white/20' : 'bg-blue-100 text-blue-700'}`}>
                {o.counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {o.activeTab === 'lieferungen' && <Lieferungen />}

      {o.activeTab !== 'lieferungen' && o.loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : o.activeTab !== 'lieferungen' && o.sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-center">
          <Package className="w-12 h-12 mb-3 text-gray-300" />
          <p className="font-semibold text-gray-500">Keine Bestellungen</p>
        </div>
      ) : o.activeTab !== 'lieferungen' ? (
        <OrdersTables
          activeTab={o.activeTab}
          orders={o.orders}
          paginated={o.paginated}
          sortedLength={o.sorted.length}
          allSelected={o.allSelected}
          selectedIds={o.selectedIds}
          inventoryMap={o.inventoryMap}
          receivedInputs={o.receivedInputs}
          issuedInputs={o.issuedInputs}
          saving={o.saving}
          page={o.page}
          toggleSelect={o.toggleSelect}
          toggleSelectAll={o.toggleSelectAll}
          setReceivedInputs={o.setReceivedInputs}
          setIssuedInputs={o.setIssuedInputs}
          saveReceived={o.saveReceived}
          issueOrder={o.issueOrder}
          setPage={o.setPage}
        />
      ) : null}

      <OrdersActionBars
        activeTab={o.activeTab}
        selectedIds={o.selectedIds}
        saving={o.saving}
        cancelModal={o.cancelModal}
        cancelReason={o.cancelReason}
        massaDraft={o.massaDraft}
        massaResult={o.massaResult}
        setSelectedIds={o.setSelectedIds}
        setCancelModal={o.setCancelModal}
        setCancelReason={o.setCancelReason}
        setMassaDraft={o.setMassaDraft}
        setMassaResult={o.setMassaResult}
        createSammelbestellung={o.createSammelbestellung}
        readyFromStock={o.readyFromStock}
        openMassaPreview={o.openMassaPreview}
        confirmSupplierGoodsIn={o.confirmSupplierGoodsIn}
        stepBack={o.stepBack}
        advanceSelected={o.advanceSelected}
        cancelSelected={o.cancelSelected}
        downloadMassaCsv={o.downloadMassaCsv}
        confirmMassaSend={o.confirmMassaSend}
      />
    </div>
  )
}
