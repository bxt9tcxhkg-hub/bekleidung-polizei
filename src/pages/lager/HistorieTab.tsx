import { ClipboardList } from 'lucide-react'
import { groupSizes, sizeLabel } from '../../lib/sizes'
import { STOCK_ORDER_STATUS_COLORS, STOCK_ORDER_STATUS_LABELS } from '../../lib/types'
import type { LagerController } from './useLager'

export function HistorieTab({ lager }: { lager: LagerController }) {
  const {
    stockOrders, pagedStockOrders, products, saving, markReceived,
    ordersTotalPages, ordersPage, setOrdersPage, pageSize,
  } = lager

  return stockOrders.length === 0 ? (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-center">
      <ClipboardList className="w-12 h-12 mb-3 text-gray-300" />
      <p className="font-semibold text-gray-500">Keine Lagerbestellungen vorhanden</p>
    </div>
  ) : (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Artikel</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Gr. / Anz.</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Angefordert von</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Datum</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Notiz</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {pagedStockOrders.map(o => (
            <tr key={o.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">{o.products?.name ?? '–'}</p>
                <p className="text-xs text-gray-400">{o.products?.article_number}</p>
              </td>
              <td className="px-4 py-3 text-gray-700">{sizeLabel(o.size, groupSizes(products.find(p => p.id === o.product_id)?.sizes ?? [o.size]) !== null)} · {o.quantity}×</td>
              <td className="px-4 py-3">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STOCK_ORDER_STATUS_COLORS[o.status]}`}>
                  {STOCK_ORDER_STATUS_LABELS[o.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{o.requester?.name ?? '–'}</td>
              <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                {new Date(o.created_at).toLocaleDateString('de-AT')}
              </td>
              <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">{o.note ?? '–'}</td>
              <td className="px-4 py-3 text-right">
                {o.status === 'approved' && (
                  <button onClick={() => markReceived(o)} disabled={saving}
                    className="text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60 whitespace-nowrap">
                    Wareneingang
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {ordersTotalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
          <span>{ordersPage * pageSize + 1}–{Math.min((ordersPage + 1) * pageSize, stockOrders.length)} von {stockOrders.length}</span>
          <div className="flex gap-2">
            <button onClick={() => setOrdersPage(p => p - 1)} disabled={ordersPage === 0}
              className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
              Zurück
            </button>
            <button onClick={() => setOrdersPage(p => p + 1)} disabled={ordersPage >= ordersTotalPages - 1}
              className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
              Weiter
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
