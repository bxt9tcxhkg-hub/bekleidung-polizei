import { Check, Minus, Plus, Send, ShoppingBag, Trash2, Warehouse, X } from 'lucide-react'
import { inventoryDeleteConfirm } from '../../lib/inventory'
import { groupSizes, sizeLabel, sortedSizes } from '../../lib/sizes'
import type { LagerController } from './useLager'

export function LagerModals({ lager }: { lager: LagerController }) {
  const {
    sizeModal, setSizeModal, stockFor, addToCart,
    cartOpen, setCartOpen, cartCount, cart, updateCartQty, removeFromCart, submitCart, submitting,
    followUp, setFollowUp, advanceWaitingOrders, advancingOrders,
    addForm, setAddForm, addSearch, setAddSearch, addDropdown, setAddDropdown,
    addFilteredProducts, selectedAddProduct, createInventory, saving,
    confirmDelete, setConfirmDelete, deleting, confirmAndDelete,
  } = lager

  return (
    <>
      {/* ── Size modal ── */}
      {sizeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="font-bold text-gray-900">{sizeModal.product.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{sizeModal.product.category} · Art.-Nr. {sizeModal.product.article_number}</p>
              </div>
              <button onClick={() => setSizeModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Size selector with stock */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Größe wählen</p>
                {(() => {
                  const sizes = sortedSizes(sizeModal.product.sizes)
                  const groups = groupSizes(sizes)
                  const isGrouped = groups !== null
                  const SizeBtn = ({ s }: { s: string }) => {
                    const stock = stockFor(sizeModal.product.id, s)
                    return (
                      <button key={s} onClick={() => setSizeModal(m => m ? { ...m, size: s } : m)}
                        className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors flex flex-col items-center min-w-[3.5rem] ${sizeModal.size === s ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                        <span>{sizeLabel(s, isGrouped)}</span>
                        <span className={`text-xs mt-0.5 ${sizeModal.size === s ? 'text-blue-200' : stock > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {stock > 0 ? `${stock} lagernd` : 'nicht lagernd'}
                        </span>
                      </button>
                    )
                  }
                  return groups ? (
                    <div className="space-y-3">
                      {groups.map(g => (
                        <div key={g.label}>
                          <p className="text-xs text-gray-400 mb-1.5">{g.label}:</p>
                          <div className="flex flex-wrap gap-2">{g.sizes.map(s => <SizeBtn key={s} s={s} />)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">{sizes.map(s => <SizeBtn key={s} s={s} />)}</div>
                  )
                })()}
              </div>

              {/* Current stock info */}
              {sizeModal.size && (() => {
                const stock = stockFor(sizeModal.product.id, sizeModal.size)
                return (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${stock > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                    <Warehouse className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Aktuell lagernd: <strong>{stock}×</strong>
                      {stock > 0 && <span className="text-xs ml-1 opacity-70">(Gr. {sizeModal.size})</span>}
                    </span>
                  </div>
                )
              })()}

              {/* Quantity */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Menge bestellen</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setSizeModal(m => m ? { ...m, quantity: Math.max(1, m.quantity - 1) } : m)}
                    className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-xl font-bold w-10 text-center">{sizeModal.quantity}</span>
                  <button onClick={() => setSizeModal(m => m ? { ...m, quantity: m.quantity + 1 } : m)}
                    className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t flex gap-3">
              <button onClick={() => setSizeModal(null)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-xl text-sm hover:bg-gray-50">
                Abbrechen
              </button>
              <button onClick={addToCart} disabled={!sizeModal.size}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-xl text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                <ShoppingBag className="w-4 h-4" /> In Warenkorb
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cart drawer ── */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="relative w-full max-w-sm bg-white shadow-2xl flex flex-col h-full">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-blue-800" />
                <h2 className="font-bold text-gray-900">Lager-Warenkorb</h2>
                {cartCount > 0 && <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full">{cartCount}</span>}
              </div>
              <button onClick={() => setCartOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 px-6 text-center">
                  <ShoppingBag className="w-12 h-12 mb-3 opacity-30" />
                  <p className="font-medium">Warenkorb ist leer</p>
                  <p className="text-sm mt-1">Wähle Artikel aus dem Katalog</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {cart.map((item, idx) => {
                    const stock = stockFor(item.product.id, item.size)
                    return (
                      <div key={idx} className="flex items-start gap-3 px-5 py-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 leading-snug">{item.product.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Gr. {item.size}</p>
                          <p className={`text-xs mt-1 font-medium ${stock > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                            Aktuell lagernd: {stock}×
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <button onClick={() => updateCartQty(idx, -1)} disabled={item.quantity <= 1}
                            className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-60">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-sm font-semibold w-6 text-center">{item.quantity}</span>
                          <button onClick={() => updateCartQty(idx, 1)} className="p-1 rounded-md hover:bg-gray-100">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => removeFromCart(idx)}
                            className="p-1 ml-1 rounded-md hover:bg-red-50 text-red-400 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t px-5 py-4 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Positionen</span>
                  <span className="font-bold text-gray-900">{cart.length} Artikel · {cartCount}×</span>
                </div>
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <Warehouse className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">Lagerbestellungen werden zur Genehmigung weitergeleitet und erscheinen danach in der Bestellhistorie.</p>
                </div>
                <button onClick={submitCart} disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60">
                  <Send className="w-4 h-4" />
                  {submitting ? 'Wird eingereicht...' : 'Zur Genehmigung einreichen'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Wareneingang Follow-up Dialog ── */}
      {followUp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Check className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Wareneingang gebucht</h2>
                  <p className="text-xs text-gray-500">{followUp.stockOrder.products?.name} · Gr. {followUp.stockOrder.size} · {followUp.stockOrder.quantity}×</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-700 mb-3">
                <span className="font-semibold">{followUp.orders.length} Benutzerbestellung{followUp.orders.length !== 1 ? 'en' : ''}</span> warten auf diesen Artikel.
                Schneider-pflichtige Positionen gehen zum Schneider (nicht ins freie Lager). Andere nur bei verfügbarem Bestand auf „Bereit zur Ausgabe“.
              </p>
              <div className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
                {followUp.orders.map(o => (
                  <div key={o.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <span className="font-medium text-gray-800">{o.profiles?.name ?? '–'}</span>
                    <span className="text-gray-500">Gr. {o.size} · {o.quantity}×{o.products?.needs_tailoring ? ' · Schneider' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setFollowUp(null)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">
                Später manuell
              </button>
              <button onClick={advanceWaitingOrders} disabled={advancingOrders}
                className="flex-1 bg-green-700 hover:bg-green-800 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {advancingOrders ? 'Wird gesetzt...' : 'Weiterleiten'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bestand löschen ── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Bestandseintrag löschen</h3>
                <p className="text-sm text-gray-500">Diese Aktion kann nicht rückgängig gemacht werden.</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-6">
              {inventoryDeleteConfirm(
                confirmDelete.products?.name,
                confirmDelete.size,
                confirmDelete.quantity,
                confirmDelete.products?.sizes,
              )}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-60"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => { void confirmAndDelete() }}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60"
              >
                {deleting ? 'Löschen...' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bestand erfassen Modal ── */}
      {addForm !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Bestand erfassen</h2>
              <button onClick={() => { setAddForm(null); setAddSearch('') }} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">Artikel *</label>
                <input type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Artikelname oder -nummer..."
                  value={addSearch}
                  onChange={e => { setAddSearch(e.target.value); setAddDropdown(true); if (!e.target.value) setAddForm(f => f ? { ...f, product_id: '', size: '' } : f) }}
                  onFocus={() => setAddDropdown(true)}
                  onBlur={() => setTimeout(() => setAddDropdown(false), 150)}
                />
                {addDropdown && addFilteredProducts.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {addFilteredProducts.map(p => (
                      <li key={p.id}>
                        <button type="button" onMouseDown={() => { setAddForm(f => f ? { ...f, product_id: p.id, size: '' } : f); setAddSearch(p.name); setAddDropdown(false) }}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50">
                          <p className="text-sm font-medium text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-400">{p.article_number} · {p.category}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {addForm.product_id && <p className="text-xs text-green-600 mt-1">✓ Artikel ausgewählt</p>}
              </div>
              {selectedAddProduct && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Größe *</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={addForm.size} onChange={e => setAddForm(f => f ? { ...f, size: e.target.value } : f)}>
                    <option value="">Größe wählen...</option>
                    {(() => {
                      const isGrouped = groupSizes(selectedAddProduct.sizes) !== null
                      return sortedSizes(selectedAddProduct.sizes).map(s => {
                        const stock = stockFor(selectedAddProduct.id, s)
                        return <option key={s} value={s}>{sizeLabel(s, isGrouped)}{stock > 0 ? ` (aktuell ${stock}×)` : ''}</option>
                      })
                    })()}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Menge hinzubuchen *</label>
                <input type="number" min="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0" value={addForm.quantity}
                  onChange={e => setAddForm(f => f ? { ...f, quantity: e.target.value } : f)} />
                <p className="text-xs text-gray-400 mt-1">Die Menge wird zum bestehenden Bestand hinzugebucht.</p>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => { setAddForm(null); setAddSearch('') }}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={createInventory} disabled={saving || !addForm.product_id || !addForm.size || addForm.quantity === ''}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
