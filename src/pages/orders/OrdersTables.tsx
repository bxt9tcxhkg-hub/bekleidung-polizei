import type { Dispatch, SetStateAction } from 'react'
import { FileText } from 'lucide-react'
import type { Order } from '../../lib/types'
import { fmtEUR } from '../../lib/format'
import { inventoryKey } from '../../lib/inventory'
import { generateAusgabeliste } from '../../lib/printDocs'
import { PAGE_SIZE, type AdminTab } from './types'

const thClass = 'text-left px-3 py-2.5 md:px-4 md:py-3 font-semibold text-gray-600 whitespace-nowrap text-xs md:text-sm'
const thCClass = 'text-center px-3 py-2.5 md:px-4 md:py-3 font-semibold text-gray-600 whitespace-nowrap text-xs md:text-sm'

export interface OrdersTablesProps {
  activeTab: AdminTab
  orders: Order[]
  paginated: Order[]
  sortedLength: number
  allSelected: boolean
  selectedIds: Set<string>
  inventoryMap: Record<string, number>
  receivedInputs: Record<string, string>
  issuedInputs: Record<string, string>
  saving: boolean
  page: number
  toggleSelect: (id: string) => void
  toggleSelectAll: () => void
  setReceivedInputs: Dispatch<SetStateAction<Record<string, string>>>
  setIssuedInputs: Dispatch<SetStateAction<Record<string, string>>>
  saveReceived: (order: Order) => Promise<void>
  issueOrder: (order: Order) => Promise<void>
  setPage: Dispatch<SetStateAction<number>>
}

export default function OrdersTables({
  activeTab,
  orders,
  paginated,
  sortedLength,
  allSelected,
  selectedIds,
  inventoryMap,
  receivedInputs,
  issuedInputs,
  saving,
  page,
  toggleSelect,
  toggleSelectAll,
  setReceivedInputs,
  setIssuedInputs,
  saveReceived,
  issueOrder,
  setPage,
}: OrdersTablesProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">

      {/* ── Eingereicht ── */}
      {activeTab === 'eingereicht' && (
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2.5 md:px-4 md:py-3 w-8"><input type="checkbox" className="rounded" checked={allSelected} onChange={toggleSelectAll} /></th>
            <th className={thClass}>Benutzer</th>
            <th className={thClass}>Produkt</th>
            <th className={`${thClass} hidden sm:table-cell`}>Quartal</th>
            <th className={thClass}>Gr. / Anz.</th>
            <th className={`${thCClass} hidden sm:table-cell`}>Lager</th>
            <th className="hidden sm:table-cell text-right px-3 py-2.5 md:px-4 md:py-3 font-semibold text-gray-600 whitespace-nowrap text-xs md:text-sm">Preis</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.map(o => {
              const stock = inventoryMap[inventoryKey(o.product_id, o.size)] ?? 0
              return (
                <tr key={o.id} className={`hover:bg-gray-50 ${selectedIds.has(o.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-3 py-2.5 md:px-4 md:py-3"><input type="checkbox" className="rounded" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900 truncate max-w-xs">{o.profiles?.name}</p><p className="text-xs text-gray-400">{o.profiles?.dienstnummer ? `DNr. ${o.profiles.dienstnummer}` : o.profiles?.username}</p></td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900 truncate max-w-xs">{o.products?.name}</p><p className="text-xs text-gray-400">{o.products?.category}</p></td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-500 text-sm hidden sm:table-cell">{o.quarters?.name}</td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-600">{o.size} · {o.quantity}×</td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3 text-center hidden sm:table-cell">
                    {stock >= o.quantity ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">{stock}× lagernd</span>
                    ) : stock > 0 ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{stock}× lagernd</span>
                    ) : (
                      <span className="text-xs text-gray-400">–</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3 text-right font-medium text-gray-700 hidden sm:table-cell">{fmtEUR(o.unit_price * o.quantity)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* ── Beim Lieferanten ── */}
      {activeTab === 'lieferant' && (
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2.5 md:px-4 md:py-3 w-8"><input type="checkbox" className="rounded" checked={allSelected} onChange={toggleSelectAll} /></th>
            <th className={thClass}>Benutzer</th>
            <th className={thClass}>Produkt</th>
            <th className={thClass}>Gr.</th>
            <th className={thCClass}>Bestellt</th>
            <th className={thCClass}>Erhalten</th>
            <th className="px-3 py-2.5 md:px-4 md:py-3" />
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.map(o => {
              const saved = o.quantity_received != null
              const dirty = receivedInputs[o.id] !== undefined && receivedInputs[o.id] !== String(o.quantity_received ?? '')
              return (
                <tr key={o.id} className={`hover:bg-gray-50 ${selectedIds.has(o.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-3 py-2.5 md:px-4 md:py-3"><input type="checkbox" className="rounded" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900 truncate max-w-xs">{o.profiles?.name}</p><p className="text-xs text-gray-400">{o.profiles?.dienstnummer ? `DNr. ${o.profiles.dienstnummer}` : ''}</p></td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900 truncate max-w-xs">{o.products?.name}</p><p className="text-xs text-gray-400">{o.products?.category}</p></td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-600">{o.size}</td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3 text-center font-semibold text-gray-800">{o.quantity}</td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3"><div className="flex justify-center">
                    <input type="number" min="0" max={o.quantity}
                      className={`w-14 text-center border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${dirty ? 'border-amber-400 bg-amber-50' : saved ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}
                      placeholder={String(o.quantity)} value={receivedInputs[o.id] ?? ''}
                      onChange={e => setReceivedInputs(prev => ({ ...prev, [o.id]: e.target.value }))} />
                  </div></td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3">
                    <button onClick={() => saveReceived(o)} disabled={saving || !dirty}
                      className="text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white px-3 py-2 rounded-lg disabled:opacity-60 whitespace-nowrap">
                      Speichern
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* ── Beim Schneider ── */}
      {activeTab === 'schneider' && (
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2.5 md:px-4 md:py-3 w-8"><input type="checkbox" className="rounded" checked={allSelected} onChange={toggleSelectAll} /></th>
            <th className={thClass}>Benutzer</th>
            <th className={thClass}>Produkt</th>
            <th className={thClass}>Gr.</th>
            <th className={thCClass}>Bestellt</th>
            <th className={thCClass}>Erhalten</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.map(o => (
              <tr key={o.id} className={`hover:bg-gray-50 ${selectedIds.has(o.id) ? 'bg-blue-50' : ''}`}>
                <td className="px-3 py-2.5 md:px-4 md:py-3"><input type="checkbox" className="rounded" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900 truncate max-w-xs">{o.profiles?.name}</p><p className="text-xs text-gray-400">{o.profiles?.dienstnummer ? `DNr. ${o.profiles.dienstnummer}` : ''}</p></td>
                <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900 truncate max-w-xs">{o.products?.name}</p><p className="text-xs text-gray-400">{o.products?.category}</p></td>
                <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-600">{o.size}</td>
                <td className="px-3 py-2.5 md:px-4 md:py-3 text-center font-semibold text-gray-800">{o.quantity}</td>
                <td className="px-3 py-2.5 md:px-4 md:py-3 text-center text-gray-600">{o.quantity_received ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Bereit zur Ausgabe ── */}
      {activeTab === 'ausgabe' && (
        <>
        <div className="flex justify-end px-4 py-3 border-b border-gray-100">
          <button onClick={() => generateAusgabeliste(orders)}
            className="flex items-center gap-2 border border-blue-300 text-blue-700 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-blue-50 transition-colors">
            <FileText className="w-4 h-4" /> Ausgabeliste als PDF
          </button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2.5 md:px-4 md:py-3 w-8"><input type="checkbox" className="rounded" checked={allSelected} onChange={toggleSelectAll} /></th>
            <th className={thClass}>Benutzer</th>
            <th className={thClass}>Produkt</th>
            <th className={thClass}>Gr.</th>
            <th className={`${thCClass} hidden sm:table-cell`}>Bestellt</th>
            <th className={`${thCClass} hidden sm:table-cell`}>Geliefert</th>
            <th className={thCClass}>Verfügbar</th>
            <th className={thCClass}>Auszugeben</th>
            <th className="px-3 py-2.5 md:px-4 md:py-3" />
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.map(o => {
              const qtyRef = o.quantity_received ?? o.quantity
              const qtyIssued = o.quantity_issued ?? 0
              const outstanding = qtyRef - qtyIssued
              return (
                <tr key={o.id} className={`hover:bg-gray-50 ${selectedIds.has(o.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-3 py-2.5 md:px-4 md:py-3"><input type="checkbox" className="rounded" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900 truncate max-w-xs">{o.profiles?.name}</p><p className="text-xs text-gray-400">{o.profiles?.dienstnummer ? `DNr. ${o.profiles.dienstnummer}` : ''}</p></td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900 truncate max-w-xs">{o.products?.name}</p><p className="text-xs text-gray-400">{o.products?.category}</p></td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-600">{o.size}</td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3 text-center text-gray-700 hidden sm:table-cell">{o.quantity}</td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3 text-center text-gray-700 hidden sm:table-cell">{o.quantity_received ?? '–'}</td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3 text-center font-semibold text-blue-700">{outstanding}</td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3"><div className="flex justify-center">
                    <input type="number" min="1" max={outstanding}
                      className="w-14 text-center border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={String(outstanding)} value={issuedInputs[o.id] ?? ''}
                      onChange={e => setIssuedInputs(prev => ({ ...prev, [o.id]: e.target.value }))} />
                  </div></td>
                  <td className="px-3 py-2.5 md:px-4 md:py-3">
                    <button onClick={() => issueOrder(o)} disabled={saving || !(parseInt(issuedInputs[o.id] ?? '') > 0)}
                      className="text-xs font-medium bg-green-700 hover:bg-green-800 text-white px-3 py-2 rounded-lg disabled:opacity-60 whitespace-nowrap">
                      Ausgeben
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </>
      )}

      {/* ── Ausgegeben ── */}
      {activeTab === 'ausgegeben' && (
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2.5 md:px-4 md:py-3 w-8"><input type="checkbox" className="rounded" checked={allSelected} onChange={toggleSelectAll} /></th>
            <th className={thClass}>Benutzer</th>
            <th className={thClass}>Produkt</th>
            <th className={thClass}>Gr.</th>
            <th className={thCClass}>Bestellt</th>
            <th className={thCClass}>Ausgegeben</th>
            <th className={thClass}>Quartal</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.map(o => (
              <tr key={o.id} className={`hover:bg-gray-50 ${selectedIds.has(o.id) ? 'bg-blue-50' : ''}`}>
                <td className="px-3 py-2.5 md:px-4 md:py-3"><input type="checkbox" className="rounded" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900 truncate max-w-xs">{o.profiles?.name}</p><p className="text-xs text-gray-400">{o.profiles?.dienstnummer ? `DNr. ${o.profiles.dienstnummer}` : ''}</p></td>
                <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900 truncate max-w-xs">{o.products?.name}</p><p className="text-xs text-gray-400">{o.products?.category}</p></td>
                <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-600">{o.size}</td>
                <td className="px-3 py-2.5 md:px-4 md:py-3 text-center text-gray-700">{o.quantity}</td>
                <td className="px-3 py-2.5 md:px-4 md:py-3 text-center text-gray-700">{o.quantity_issued ?? o.quantity}</td>
                <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-500">{o.quarters?.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Storniert ── */}
      {activeTab === 'storniert' && (
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2.5 md:px-4 md:py-3 w-8"><input type="checkbox" className="rounded" checked={allSelected} onChange={toggleSelectAll} /></th>
            <th className={thClass}>Benutzer</th>
            <th className={thClass}>Produkt</th>
            <th className={thClass}>Gr. / Anz.</th>
            <th className={thClass}>Grund</th>
            <th className={thClass}>Quartal</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.map(o => (
              <tr key={o.id} className={`hover:bg-gray-50 opacity-75 ${selectedIds.has(o.id) ? 'bg-blue-50 !opacity-100' : ''}`}>
                <td className="px-3 py-2.5 md:px-4 md:py-3"><input type="checkbox" className="rounded" checked={selectedIds.has(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900 truncate max-w-xs">{o.profiles?.name}</p><p className="text-xs text-gray-400">{o.profiles?.dienstnummer ? `DNr. ${o.profiles.dienstnummer}` : ''}</p></td>
                <td className="px-3 py-2.5 md:px-4 md:py-3"><p className="font-medium text-gray-900 truncate max-w-xs">{o.products?.name}</p><p className="text-xs text-gray-400">{o.products?.category}</p></td>
                <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-600">{o.size} · {o.quantity}×</td>
                <td className="px-3 py-2.5 md:px-4 md:py-3 text-red-600">{o.cancel_reason ?? '–'}</td>
                <td className="px-3 py-2.5 md:px-4 md:py-3 text-gray-500">{o.quarters?.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {sortedLength > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 px-1">
          <button onClick={() => setPage(p => p - 1)} disabled={page === 0} className="text-sm text-blue-700 hover:text-blue-900 disabled:text-gray-300 font-medium">← Zurück</button>
          <span className="text-xs text-gray-500">Seite {page + 1} von {Math.ceil(sortedLength / PAGE_SIZE)} · {sortedLength} Einträge</span>
          <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= sortedLength} className="text-sm text-blue-700 hover:text-blue-900 disabled:text-gray-300 font-medium">Weiter →</button>
        </div>
      )}
    </div>
  )
}
