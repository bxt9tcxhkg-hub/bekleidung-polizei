import { useEffect, useState } from 'react'
import { TrendingUp, Package, BarChart3, Warehouse, AlertTriangle, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

type AnalyseTab = 'ranking' | 'groessen' | 'trend'

interface ProductStat {
  product_id: string
  name: string
  article_number: string
  category: string
  totalQty: number
  orderCount: number
  sizeCounts: Record<string, number>
  stock: number
  stockBySizes: Record<string, number>
}

interface QuarterStat {
  name: string
  year: number
  quarter_num: number
  orderCount: number
  totalQty: number
}

export default function Analyse() {
  const [tab, setTab] = useState<AnalyseTab>('ranking')
  const [stats, setStats] = useState<ProductStat[]>([])
  const [quarterStats, setQuarterStats] = useState<QuarterStat[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [ordersRes, invRes, quartersRes] = await Promise.all([
        supabase
          .from('orders')
          .select('product_id, size, quantity, quarter_id, products(id,name,article_number,category), quarters(id,name,year,quarter_num)')
          .not('status', 'in', '("pending","pending_approval","cancelled")'),
        supabase.from('inventory').select('product_id,size,quantity'),
        supabase.from('quarters').select('id,name,year,quarter_num').order('year').order('quarter_num'),
      ])

      const orders = ordersRes.data ?? []
      const inventory = invRes.data ?? []
      const quarters = quartersRes.data ?? []

      // Build inventory map
      const invMap: Record<string, number> = {}
      const invByProduct: Record<string, number> = {}
      inventory.forEach((e: any) => {
        invMap[`${e.product_id}__${e.size}`] = e.quantity
        invByProduct[e.product_id] = (invByProduct[e.product_id] ?? 0) + e.quantity
      })

      // Aggregate per product
      const productMap: Record<string, ProductStat> = {}
      orders.forEach((o: any) => {
        const pid = o.product_id
        if (!productMap[pid]) {
          productMap[pid] = {
            product_id: pid,
            name: o.products?.name ?? '–',
            article_number: o.products?.article_number ?? '–',
            category: o.products?.category ?? '–',
            totalQty: 0,
            orderCount: 0,
            sizeCounts: {},
            stock: invByProduct[pid] ?? 0,
            stockBySizes: {},
          }
        }
        productMap[pid].totalQty += o.quantity
        productMap[pid].orderCount += 1
        productMap[pid].sizeCounts[o.size] = (productMap[pid].sizeCounts[o.size] ?? 0) + o.quantity
      })

      // Fill stockBySizes
      inventory.forEach((e: any) => {
        if (productMap[e.product_id]) {
          productMap[e.product_id].stockBySizes[e.size] = e.quantity
        }
      })

      const sorted = Object.values(productMap).sort((a, b) => b.totalQty - a.totalQty)
      setStats(sorted)
      if (sorted.length > 0) setSelectedProduct(sorted[0].product_id)

      // Quarter trend
      const quarterMap: Record<string, QuarterStat> = {}
      orders.forEach((o: any) => {
        const qid = o.quarter_id
        if (!qid) return
        const q = quarters.find((qq: any) => qq.id === qid)
        if (!q) return
        if (!quarterMap[qid]) {
          quarterMap[qid] = { name: q.name, year: q.year, quarter_num: q.quarter_num, orderCount: 0, totalQty: 0 }
        }
        quarterMap[qid].orderCount += 1
        quarterMap[qid].totalQty += o.quantity
      })
      const qSorted = Object.values(quarterMap).sort((a, b) =>
        a.year !== b.year ? a.year - b.year : a.quarter_num - b.quarter_num
      )
      setQuarterStats(qSorted)
      setLoading(false)
    }
    load()
  }, [])

  const totalOrders = stats.reduce((s, p) => s + p.orderCount, 0)
  const totalQty = stats.reduce((s, p) => s + p.totalQty, 0)
  const maxQty = stats[0]?.totalQty ?? 1

  const selected = stats.find(s => s.product_id === selectedProduct)
  const maxQtrQty = Math.max(...quarterStats.map(q => q.totalQty), 1)

  // Stock recommendations: high demand, low stock
  const recommendations = stats.filter(p => p.totalQty >= 3 && p.stock < Math.ceil(p.totalQty * 0.3))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bestellanalyse</h1>
        <p className="text-gray-500 text-sm mt-1">Nachfrageauswertung zur Unterstützung der Lagerplanung</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
              <p className="text-xs text-gray-500 mb-1">Bestellungen gesamt</p>
              <p className="text-2xl font-bold text-gray-900">{totalOrders}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
              <p className="text-xs text-gray-500 mb-1">Artikel (Stück)</p>
              <p className="text-2xl font-bold text-gray-900">{totalQty}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
              <p className="text-xs text-gray-500 mb-1">Verschiedene Produkte</p>
              <p className="text-2xl font-bold text-gray-900">{stats.length}</p>
            </div>
            <div className={`rounded-xl border px-4 py-4 ${recommendations.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
              <p className={`text-xs mb-1 ${recommendations.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>Lager-Empfehlungen</p>
              <p className={`text-2xl font-bold ${recommendations.length > 0 ? 'text-amber-800' : 'text-green-800'}`}>{recommendations.length}</p>
            </div>
          </div>

          {/* Stock recommendation banner */}
          {recommendations.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <p className="font-semibold text-amber-900 text-sm">Lagerempfehlung — {recommendations.length} Produkt{recommendations.length !== 1 ? 'e' : ''} mit hoher Nachfrage und niedrigem Bestand</p>
              </div>
              <div className="space-y-2">
                {recommendations.slice(0, 5).map(p => (
                  <div key={p.product_id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-amber-100">
                    <Package className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.category} · {p.totalQty}× bestellt</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xs font-semibold ${p.stock === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                        {p.stock === 0 ? 'Nicht lagernd' : `${p.stock}× lagernd`}
                      </p>
                      <p className="text-xs text-gray-400">Empf.: ~{Math.ceil(p.totalQty * 0.5)}× einlagern</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
            {([
              { key: 'ranking', label: 'Artikel-Ranking', icon: TrendingUp },
              { key: 'groessen', label: 'Größenanalyse', icon: BarChart3 },
              { key: 'trend', label: 'Quartals-Trend', icon: BarChart3 },
            ] as { key: AnalyseTab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Artikel-Ranking */}
          {tab === 'ranking' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 w-10">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Artikel</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Kategorie</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Bestellungen</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Menge</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Lagernd</th>
                    <th className="px-4 py-3 w-36 hidden lg:table-cell" />
                    <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Lager-Tip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.map((p, i) => {
                    const pct = Math.round((p.totalQty / maxQty) * 100)
                    const needsStock = p.totalQty >= 3 && p.stock < Math.ceil(p.totalQty * 0.3)
                    return (
                      <tr key={p.product_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400 font-medium text-xs">{i + 1}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-400">{p.article_number}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">{p.category}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{p.orderCount}×</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{p.totalQty}×</td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          <span className={`text-sm font-medium ${p.stock === 0 ? 'text-red-500' : p.stock < 3 ? 'text-amber-500' : 'text-green-600'}`}>
                            {p.stock}×
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center hidden md:table-cell">
                          {needsStock ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              <AlertTriangle className="w-3 h-3" /> Einlagern
                            </span>
                          ) : p.stock > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              <CheckCircle className="w-3 h-3" /> OK
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Größenanalyse */}
          {tab === 'groessen' && (
            <div className="space-y-4">
              {/* Product selector */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <label className="block text-xs font-medium text-gray-600 mb-2">Artikel auswählen</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedProduct ?? ''}
                  onChange={e => setSelectedProduct(e.target.value)}
                >
                  {stats.map(p => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.name} ({p.totalQty}× bestellt)
                    </option>
                  ))}
                </select>
              </div>

              {selected && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <h3 className="font-bold text-gray-900">{selected.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{selected.category} · {selected.article_number}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Gesamt bestellt</p>
                      <p className="text-xl font-bold text-gray-900">{selected.totalQty}×</p>
                    </div>
                  </div>

                  {/* Size bars */}
                  <div className="space-y-3">
                    {Object.entries(selected.sizeCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([size, qty]) => {
                        const pct = Math.round((qty / selected.totalQty) * 100)
                        const stock = selected.stockBySizes[size] ?? 0
                        return (
                          <div key={size}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900 w-12">Gr. {size}</span>
                                <span className="text-xs text-gray-500">{qty}× bestellt</span>
                              </div>
                              <div className="flex items-center gap-3 text-right">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                  stock === 0 ? 'bg-red-100 text-red-600' :
                                  stock < Math.ceil(qty * 0.3) ? 'bg-amber-100 text-amber-600' :
                                  'bg-green-100 text-green-700'
                                }`}>
                                  {stock === 0 ? 'Nicht lagernd' : `${stock}× lagernd`}
                                </span>
                                <span className="text-xs font-semibold text-gray-700 w-10 text-right">{pct}%</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            {stock > 0 && (
                              <div className="mt-0.5">
                                <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden" style={{ maxWidth: `${pct}%` }}>
                                  <div
                                    className="h-full bg-green-400 rounded-full"
                                    style={{ width: `${Math.min(100, Math.round((stock / qty) * 100))}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                  </div>

                  <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-600 inline-block" /> Nachfrage</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-400 inline-block" /> Lagernd</span>
                  </div>
                </div>
              )}

              {selected && Object.keys(selected.sizeCounts).length === 0 && (
                <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-12 text-gray-400">
                  <Warehouse className="w-8 h-8 mb-2 opacity-40" />
                  <p>Keine Bestelldaten für diesen Artikel</p>
                </div>
              )}
            </div>
          )}

          {/* Quartals-Trend */}
          {tab === 'trend' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {quarterStats.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-gray-400">
                  <BarChart3 className="w-10 h-10 mb-3 opacity-40" />
                  <p>Noch keine Quartalsdaten vorhanden</p>
                </div>
              ) : (
                <>
                  {/* Visual bars */}
                  <div className="px-5 py-5 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-4">Bestellmenge pro Quartal</p>
                    <div className="flex items-end gap-3 h-32">
                      {quarterStats.map(q => {
                        const h = Math.round((q.totalQty / maxQtrQty) * 100)
                        return (
                          <div key={q.name} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                            <span className="text-xs font-semibold text-gray-700">{q.totalQty}</span>
                            <div className="w-full flex items-end justify-center" style={{ height: '6rem' }}>
                              <div className="w-full max-w-[2.5rem] bg-blue-600 rounded-t-md transition-all"
                                style={{ height: `${Math.max(h, 4)}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 truncate w-full text-center">{q.name}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Table */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Quartal</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600">Bestellpositionen</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600">Menge gesamt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {quarterStats.map(q => (
                        <tr key={q.name} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{q.name}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{q.orderCount}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{q.totalQty}×</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
