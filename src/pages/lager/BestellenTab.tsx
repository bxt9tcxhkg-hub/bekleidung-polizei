import { Plus, ShoppingBag, Tag } from 'lucide-react'
import { groupSizes, sizeLabel, sortedSizes } from '../../lib/sizes'
import type { LagerController } from './useLager'

export function BestellenTab({ lager }: { lager: LagerController }) {
  const {
    categories, selectedCategory, setSelectedCategory, setSelectedSubCategory,
    subCategories, selectedSubCategory,
    filteredProducts, stockFor, openSizeModal,
  } = lager

  return (
    <div>
      {/* Category filter */}
      <div className="flex gap-2 flex-wrap overflow-x-auto pb-1">
        {categories.map(cat => (
          <button key={cat} onClick={() => { setSelectedCategory(cat); setSelectedSubCategory('Alle') }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${selectedCategory === cat ? 'bg-blue-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
            {cat}
          </button>
        ))}
      </div>
      {subCategories.length > 1 && (
        <div className="flex gap-2 flex-wrap mt-2 mb-5">
          {subCategories.map(sub => (
            <button key={sub} onClick={() => setSelectedSubCategory(sub as string)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${selectedSubCategory === sub ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-gray-50 border border-gray-200 text-gray-500 hover:border-blue-200'}`}>
              {sub}
            </button>
          ))}
        </div>
      )}
      {subCategories.length <= 1 && <div className="mb-5" />}

      {/* Product grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map(product => {
          const isGrouped = groupSizes(product.sizes) !== null
          const sizesWithStock = sortedSizes(product.sizes).map(s => ({
            size: s,
            stock: stockFor(product.id, s),
          }))
          const totalStock = sizesWithStock.reduce((s, e) => s + e.stock, 0)
          return (
            <div key={product.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
              {/* Card header */}
              <div className="h-28 bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center relative">
                <ShoppingBag className="w-10 h-10 text-blue-300 opacity-50" />
                {totalStock > 0 ? (
                  <span className="absolute top-2.5 right-2.5 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {totalStock}× lagernd
                  </span>
                ) : (
                  <span className="absolute top-2.5 right-2.5 bg-black/30 text-white/80 text-xs font-medium px-2 py-0.5 rounded-full">
                    Nicht lagernd
                  </span>
                )}
              </div>

              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug">{product.name}</h3>
                </div>
                <span className="text-xs text-gray-400 flex items-center gap-1 mb-3">
                  <Tag className="w-3 h-3" />{product.category}
                </span>

                {/* Sizes with stock badges */}
                {product.size_mode === 'sizes' && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {sizesWithStock.map(({ size, stock }) => (
                      <span key={size} className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium ${
                        stock > 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {sizeLabel(size, isGrouped)}
                        {stock > 0 && <span className="text-green-600 font-bold">·{stock}</span>}
                      </span>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => openSizeModal(product)}
                  className="mt-auto w-full flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium py-2 rounded-xl transition-colors">
                  <Plus className="w-4 h-4" /> Bestellen
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
