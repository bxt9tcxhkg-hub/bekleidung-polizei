import { Check, Minus, Search, Trash2, Warehouse, X } from 'lucide-react'
import { groupSizes, sizeLabel } from '../../lib/sizes'
import type { LagerController } from './useLager'

export function BestandTab({ lager }: { lager: LagerController }) {
  const {
    minStockProducts,
    editingMinId, setEditingMinId,
    editMinVal, setEditMinVal,
    saveMinQty, savingMin,
    invByProduct,
    pagedInvEntries,
    editingId, setEditingId,
    editQty, setEditQty,
    saveQty, saving,
    invTotalPages, invPage, setInvPage,
    invEntries, pageSize,
    setConfirmDelete,
    invSearch, setInvSearch,
    takeOutId, setTakeOutId, takeOutQty, setTakeOutQty, takingOut, takeOut,
  } = lager

  return (
    <div className="space-y-6">
    {/* Mindestmengen */}
    {minStockProducts.length > 0 && (
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Mindestmengen</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Artikel</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Mindestmenge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {minStockProducts.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.article_number} · {p.category}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editingMinId === p.id ? (
                      <div className="flex items-center justify-center gap-2">
                        <input type="number" min="1"
                          className="w-16 text-center border border-blue-400 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={editMinVal}
                          onChange={e => setEditMinVal(e.target.value)}
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') saveMinQty(p.id); if (e.key === 'Escape') setEditingMinId(null) }}
                        />
                        <button onClick={() => saveMinQty(p.id)} disabled={savingMin}
                          className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-60">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setEditingMinId(null)}
                          className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingMinId(p.id); setEditMinVal(String(p.min_quantity)) }}
                        className="inline-flex items-center gap-2 hover:bg-gray-100 px-3 py-1 rounded-lg transition-colors group">
                        <span className="text-sm font-semibold text-gray-700">{p.min_quantity}×</span>
                        <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">bearbeiten</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}

    {/* Lagerbestand */}
    {Object.keys(invByProduct).length > 0 ? (
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={invSearch}
          onChange={e => setInvSearch(e.target.value)}
          placeholder="Artikel, Artikelnummer oder Größe suchen…"
          className="w-full sm:max-w-sm pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    ) : null}
    {Object.keys(invByProduct).length === 0 ? (
      <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-center">
        <Warehouse className="w-12 h-12 mb-3 text-gray-300" />
        <p className="font-semibold text-gray-500">Kein Bestand erfasst</p>
        <p className="text-sm text-gray-400 mt-1">Klicke „Bestand erfassen" um Artikel einzubuchen</p>
      </div>
    ) : invEntries.length === 0 ? (
      <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-center">
        <Search className="w-12 h-12 mb-3 text-gray-300" />
        <p className="font-semibold text-gray-500">Keine Treffer für „{invSearch}"</p>
      </div>
    ) : (
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Artikel</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Größe</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Bestand</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Zuletzt aktualisiert</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pagedInvEntries.map(entry => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{entry.products?.name ?? '–'}</p>
                  <p className="text-xs text-gray-400">{entry.products?.article_number} · {entry.products?.category}</p>
                </td>
                <td className="px-4 py-3 text-gray-600">{sizeLabel(entry.size, groupSizes(entry.products?.sizes ?? [entry.size]) !== null)}</td>
                <td className="px-4 py-3 text-center">
                  {editingId === entry.id ? (
                    <div className="flex items-center justify-center gap-2">
                      <input type="number" min="0"
                        className="w-16 text-center border border-blue-400 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={editQty}
                        onChange={e => setEditQty(e.target.value)}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveQty(entry); if (e.key === 'Escape') setEditingId(null) }}
                      />
                      <button onClick={() => saveQty(entry)} disabled={saving}
                        className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-60">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : takeOutId === entry.id ? (
                    <div className="flex items-center justify-center gap-2">
                      <input type="number" min="1" max={entry.quantity}
                        className="w-16 text-center border border-amber-400 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        value={takeOutQty}
                        onChange={e => setTakeOutQty(e.target.value)}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') takeOut(entry); if (e.key === 'Escape') setTakeOutId(null) }}
                      />
                      <button onClick={() => takeOut(entry)} disabled={takingOut}
                        className="p-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-60" title="Entnahme buchen">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setTakeOutId(null)}
                        className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1 group">
                      <button onClick={() => { setEditingId(entry.id); setEditQty(String(entry.quantity)) }}
                        className="inline-flex items-center gap-2 hover:bg-gray-100 px-3 py-1 rounded-lg transition-colors">
                        {(() => {
                          const min = entry.products?.min_quantity ?? 0
                          const qty = entry.quantity
                          const color = qty === 0 ? 'text-gray-400' : min > 0 && qty < min ? 'text-red-600' : min > 0 && qty <= min * 1.5 ? 'text-amber-600' : 'text-green-700'
                          return <span className={`text-sm font-semibold ${color}`}>{qty}×</span>
                        })()}
                        {(() => {
                          const min = entry.products?.min_quantity ?? 0
                          return min > 0 && entry.quantity < min
                            ? <span className="text-xs text-red-400">min. {min}</span>
                            : <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">bearbeiten</span>
                        })()}
                      </button>
                      {entry.quantity > 0 ? <button onClick={() => { setTakeOutId(entry.id); setTakeOutQty('1') }}
                        className="p-1.5 text-amber-700 hover:bg-amber-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" title="Entnehmen / Ausbuchen">
                        <Minus className="w-3.5 h-3.5" />
                      </button> : null}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs text-gray-400 hidden md:table-cell">
                  {entry.updated_at ? new Date(entry.updated_at).toLocaleDateString('de-AT') : '–'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(entry)}
                      className="p-1.5 hover:bg-red-50 rounded-md text-red-400 hover:text-red-600"
                      title="Löschen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invTotalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            <span>{invPage * pageSize + 1}–{Math.min((invPage + 1) * pageSize, invEntries.length)} von {invEntries.length}</span>
            <div className="flex gap-2">
              <button onClick={() => setInvPage(p => p - 1)} disabled={invPage === 0}
                className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                Zurück
              </button>
              <button onClick={() => setInvPage(p => p + 1)} disabled={invPage >= invTotalPages - 1}
                className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                Weiter
              </button>
            </div>
          </div>
        )}
      </div>
    )}
    </div>
  )
}
