import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, Package, BarChart3, AlertTriangle, CheckCircle, Info, ShoppingBag } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type AnalyseTab = 'ranking' | 'groessen' | 'trend'

interface ProductStat {
  product_id: string
  name: string
  article_number: string
  category: string
  totalQty: number
  orderCount: number
  sizeCounts: Record<string, number>       // all-time qty per size
  stockBySizes: Record<string, number>
  stock: number
}

interface SizeRec {
  product_id: string
  name: string
  article_number: string
  category: string
  size: string
  quartersWithData: number   // how many of the last 4 quarters had orders
  avgQtrDemand: number       // average qty per quarter (last 4 quarters)
  currentStock: number
  pendingQty: number         // already ordered but not yet received
  minStock: number           // reorder point = 1 quarter lead time
  toOrder: number            // recommended order qty (net of stock + pending)
  needsRestock: boolean
}

interface QuarterStat {
  name: string
  year: number
  quarter_num: number
  orderCount: number
  totalQty: number
}

export default function Analyse() {
  const navigate = useNavigate()
  const { isSachbearbeiter, profile } = useAuth()
  const [tab, setTab] = useState<AnalyseTab>('ranking')
  const [stats, setStats] = useState<ProductStat[]>([])
  const [sizeRecs, setSizeRecs] = useState<SizeRec[]>([])
  const [quarterStats, setQuarterStats] = useState<QuarterStat[]>([])
  const [recentQuarterCount, setRecentQuarterCount] = useState(4)
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)

      const org = profile?.organisation ?? 'Stadtpolizei'
      const [ordersRes, invRes, quartersRes, pendingStockRes, orgProductsRes] = await Promise.all([
        supabase
          .from('orders')
          .select('product_id, size, quantity, quarter_id, products(id,name,article_number,category,organisation), quarters(id,name,year,quarter_num,end_date)')
          .not('status', 'in', '("pending","pending_approval","cancelled")'),
        supabase.from('inventory').select('product_id,size,quantity'),
        supabase.from('quarters').select('id,name,year,quarter_num,end_date').order('end_date', { ascending: false }),
        supabase.from('stock_orders').select('product_id,size,quantity,status').in('status', ['pending_approval', 'approved']),
        supabase.from('products').select('id').eq('organisation', org).eq('active', true),
      ])

      const orgProductIds = new Set((orgProductsRes.data ?? []).map((p: any) => p.id))
      const orders = ((ordersRes.data ?? []) as any[]).filter(o => orgProductIds.has(o.product_id))
      const inventory = (invRes.data ?? []).filter((e: any) => orgProductIds.has(e.product_id))
      const allQuarters = (quartersRes.data ?? []) as any[]
      const pendingStock = ((pendingStockRes.data ?? []) as any[]).filter(e => orgProductIds.has(e.product_id))

      // Last 4 quarters by end_date (most recent first)
      const recentQuarters = allQuarters.slice(0, 4)
      const recentQIds = new Set(recentQuarters.map((q: any) => q.id))
      const actualRecentCount = Math.max(recentQuarters.length, 1)
      setRecentQuarterCount(actualRecentCount)

      // ── Inventory maps ──────────────────────────────────────────────────
      const invMap: Record<string, number> = {}   // product__size → qty
      const invByProduct: Record<string, number> = {}
      inventory.forEach((e: any) => {
        invMap[`${e.product_id}__${e.size}`] = e.quantity
        invByProduct[e.product_id] = (invByProduct[e.product_id] ?? 0) + e.quantity
      })

      // ── Pending stock orders map ─────────────────────────────────────────
      const pendingMap: Record<string, number> = {}  // product__size → qty
      pendingStock.forEach((e: any) => {
        const key = `${e.product_id}__${e.size}`
        pendingMap[key] = (pendingMap[key] ?? 0) + e.quantity
      })

      // ── All-time product stats (for ranking + trend) ────────────────────
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
      inventory.forEach((e: any) => {
        if (productMap[e.product_id]) {
          productMap[e.product_id].stockBySizes[e.size] = e.quantity
        }
      })
      const sorted = Object.values(productMap).sort((a, b) => b.totalQty - a.totalQty)
      setStats(sorted)
      if (sorted.length > 0) setSelectedProduct(sorted[0].product_id)

      // ── Per-size demand from last 4 quarters ────────────────────────────
      // qty per product+size per quarter
      const recentDemand: Record<string, Record<string, number>> = {}
      // key: product__size, value: { quarterId: qty }
      const perQtr: Record<string, Record<string, number>> = {}

      orders
        .filter((o: any) => recentQIds.has(o.quarter_id))
        .forEach((o: any) => {
          const key = `${o.product_id}__${o.size}`
          if (!perQtr[key]) perQtr[key] = {}
          perQtr[key][o.quarter_id] = (perQtr[key][o.quarter_id] ?? 0) + o.quantity
          recentDemand[o.product_id] = recentDemand[o.product_id] ?? {}
        })

      const recs: SizeRec[] = []
      Object.entries(perQtr).forEach(([key, qtrMap]) => {
        const [pid, size] = key.split('__')
        const product = productMap[pid]
        if (!product) return

        const quartersWithData = Object.keys(qtrMap).length
        const totalRecentQty = Object.values(qtrMap).reduce((s, v) => s + v, 0)
        // Average over the full window (not just quarters with data) — more conservative
        const avgQtrDemand = totalRecentQty / actualRecentCount
        const currentStock = invMap[key] ?? 0
        const pendingQty = pendingMap[key] ?? 0
        const minStock = Math.ceil(avgQtrDemand)           // 1 quarter lead time
        const toOrder = Math.max(0, Math.ceil(avgQtrDemand * 2) - currentStock - pendingQty)
        const needsRestock = currentStock < minStock

        recs.push({
          product_id: pid,
          name: product.name,
          article_number: product.article_number,
          category: product.category,
          size,
          quartersWithData,
          avgQtrDemand,
          currentStock,
          pendingQty,
          minStock,
          toOrder,
          needsRestock,
        })
      })

      // Sort: most urgent first (largest gap between minStock and currentStock)
      recs.sort((a, b) => (b.minStock - b.currentStock) - (a.minStock - a.currentStock))
      setSizeRecs(recs)

      // ── Quarter trend ────────────────────────────────────────────────────
      const quarterMap: Record<string, QuarterStat> = {}
      orders.forEach((o: any) => {
        const q = o.quarters
        if (!q) return
        if (!quarterMap[o.quarter_id]) {
          quarterMap[o.quarter_id] = { name: q.name, year: q.year, quarter_num: q.quarter_num, orderCount: 0, totalQty: 0 }
        }
        quarterMap[o.quarter_id].orderCount += 1
        quarterMap[o.quarter_id].totalQty += o.quantity
      })
      setQuarterStats(
        Object.values(quarterMap).sort((a, b) => a.year !== b.year ? a.year - b.year : a.quarter_num - b.quarter_num)
      )

      setLoading(false)
    }
    load()
  }, [])

  const totalOrders = stats.reduce((s, p) => s + p.orderCount, 0)
  const totalQty = stats.reduce((s, p) => s + p.totalQty, 0)
  const maxQty = stats[0]?.totalQty ?? 1
  const maxQtrQty = Math.max(...quarterStats.map(q => q.totalQty), 1)

  const urgentRecs = sizeRecs.filter(r => r.needsRestock && r.toOrder > 0)
  const selected = stats.find(s => s.product_id === selectedProduct)
  const selectedRecs = sizeRecs.filter(r => r.product_id === selectedProduct)

  // For ranking tab: a product "needs restock" if any of its sizes do
  const productNeedsRestock = new Set(urgentRecs.map(r => r.product_id))

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
              <p className="text-xs text-gray-500 mb-1">Analysezeitraum</p>
              <p className="text-2xl font-bold text-gray-900">{recentQuarterCount}Q</p>
              <p className="text-xs text-gray-400">letzte Quartale</p>
            </div>
            <div className={`rounded-xl border px-4 py-4 ${urgentRecs.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
              <p className={`text-xs mb-1 ${urgentRecs.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>Lager-Empfehlungen</p>
              <p className={`text-2xl font-bold ${urgentRecs.length > 0 ? 'text-amber-800' : 'text-green-800'}`}>{urgentRecs.length}</p>
              <p className={`text-xs ${urgentRecs.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>Größen-Positionen</p>
            </div>
          </div>

          {/* Recommendation logic explanation */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              <strong>Empfehlungslogik:</strong> Ø-Quartalsnachfrage aus den letzten {recentQuarterCount} Quartalen × 1 Quartal Vorlaufzeit = Mindestbestand.
              Empfohlene Bestellmenge = 2 Quartale Bedarf − aktueller Bestand − bereits laufende Lagerbestellungen.
              Berechnung auf Größenebene.
            </p>
          </div>

          {/* Recommendation banner */}
          {urgentRecs.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <p className="font-semibold text-amber-900 text-sm">
                  {urgentRecs.length} Größen-Position{urgentRecs.length !== 1 ? 'en' : ''} unter Mindestbestand
                </p>
              </div>
              <div className="space-y-2">
                {urgentRecs.slice(0, 6).map((r, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 border border-amber-100">
                    <Package className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                      <p className="text-xs text-gray-500">
                        Gr. {r.size} · Ø {r.avgQtrDemand.toFixed(1)}×/Quartal · Mindestbestand: {r.minStock}×
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right space-y-0.5">
                        <p className={`text-xs font-semibold ${r.currentStock === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                          Lager: {r.currentStock}×
                          {r.pendingQty > 0 && <span className="text-gray-400 font-normal"> (+{r.pendingQty} bestellt)</span>}
                        </p>
                        <p className="text-xs text-blue-700 font-semibold">→ {r.toOrder}× bestellen</p>
                      </div>
                      {isSachbearbeiter && (
                        <button
                          onClick={() => navigate('/lager', { state: { productId: r.product_id, size: r.size, qty: r.toOrder } })}
                          className="flex items-center gap-1.5 bg-blue-800 hover:bg-blue-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" /> Bestellen
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {urgentRecs.length > 6 && (
                  <p className="text-xs text-amber-600 text-center pt-1">+ {urgentRecs.length - 6} weitere → Größenanalyse</p>
                )}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-full">
            {([
              { key: 'ranking', label: 'Artikel-Ranking', short: 'Ranking', icon: TrendingUp },
              { key: 'groessen', label: 'Größenanalyse', short: 'Größen', icon: BarChart3 },
              { key: 'trend', label: 'Quartals-Trend', short: 'Trend', icon: BarChart3 },
            ] as { key: AnalyseTab; label: string; short: string; icon: React.ElementType }[]).map(({ key, label, short, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium px-2 py-2 rounded-lg transition-all ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{short}</span>
              </button>
            ))}
          </div>

          {/* ── Artikel-Ranking ── */}
          {tab === 'ranking' && (
            <>
              {/* Mobile: card list */}
              <div className="sm:hidden space-y-2">
                {stats.map((p, i) => {
                  const needsRestock = productNeedsRestock.has(p.product_id)
                  return (
                    <div key={p.product_id}
                      className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3 cursor-pointer active:bg-gray-50"
                      onClick={() => { setSelectedProduct(p.product_id); setTab('groessen') }}>
                      <span className="text-sm font-bold text-gray-300 w-5 flex-shrink-0 text-center">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                        <p className="text-xs text-gray-400">{p.article_number}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-900">{p.totalQty}×</p>
                        <p className="text-xs text-gray-400">{p.orderCount} Best.</p>
                      </div>
                      {needsRestock
                        ? <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        : p.stock > 0
                          ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                          : <span className="w-4 flex-shrink-0" />}
                    </div>
                  )
                })}
                <p className="text-xs text-gray-400 text-center py-2">Antippen → Größenanalyse</p>
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block bg-white rounded-xl border border-gray-200 overflow-x-auto">
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
                      <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Empfehlung</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.map((p, i) => {
                      const pct = Math.round((p.totalQty / maxQty) * 100)
                      const needsRestock = productNeedsRestock.has(p.product_id)
                      return (
                        <tr key={p.product_id} className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => { setSelectedProduct(p.product_id); setTab('groessen') }}>
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
                            {needsRestock ? (
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
                <p className="text-xs text-gray-400 px-4 py-2 border-t border-gray-100">
                  Klick auf eine Zeile öffnet die Größenanalyse für diesen Artikel.
                </p>
              </div>
            </>
          )}

          {/* ── Größenanalyse ── */}
          {tab === 'groessen' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <label className="block text-xs font-medium text-gray-600 mb-2">Artikel auswählen</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedProduct ?? ''}
                  onChange={e => setSelectedProduct(e.target.value)}
                >
                  {stats.map(p => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.name} ({p.totalQty}× bestellt{productNeedsRestock.has(p.product_id) ? ' ⚠' : ''})
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

                  {/* Size rows */}
                  <div className="space-y-4">
                    {Object.entries(selected.sizeCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([size, allTimeQty]) => {
                        const rec = selectedRecs.find(r => r.size === size)
                        const pct = Math.round((allTimeQty / selected.totalQty) * 100)
                        const stock = selected.stockBySizes[size] ?? 0

                        return (
                          <div key={size} className={`rounded-xl p-3 ${rec?.needsRestock ? 'bg-amber-50 border border-amber-100' : 'bg-gray-50'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-900">Gr. {size}</span>
                                {rec?.needsRestock && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="text-gray-500">{allTimeQty}× gesamt</span>
                                {rec && (
                                  <span className="text-gray-500">Ø {rec.avgQtrDemand.toFixed(1)}×/Q</span>
                                )}
                              </div>
                            </div>

                            {/* Demand bar */}
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-xs text-gray-400 w-16">Nachfrage</span>
                              <div className="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                            </div>

                            {/* Stock bar */}
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs text-gray-400 w-16">Lagernd</span>
                              <div className="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden">
                                {rec && rec.avgQtrDemand > 0 ? (
                                  <div
                                    className={`h-full rounded-full ${stock === 0 ? 'bg-red-400' : stock < (rec.minStock) ? 'bg-amber-400' : 'bg-green-500'}`}
                                    style={{ width: `${Math.min(100, Math.round((stock / Math.max(rec.minStock * 2, 1)) * 100))}%` }}
                                  />
                                ) : (
                                  <div className="h-full bg-green-500 rounded-full" style={{ width: stock > 0 ? '50%' : '0%' }} />
                                )}
                              </div>
                              <span className={`text-xs font-semibold w-8 text-right ${stock === 0 ? 'text-red-500' : stock < (rec?.minStock ?? 0) ? 'text-amber-500' : 'text-green-600'}`}>
                                {stock}×
                              </span>
                            </div>

                            {/* Recommendation details */}
                            {rec ? (
                              <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-200">
                                <div className="flex items-center gap-3 text-gray-500">
                                  <span>Mindestbestand: <strong className="text-gray-700">{rec.minStock}×</strong></span>
                                  {rec.pendingQty > 0 && (
                                    <span className="text-blue-600">In Bestellung: {rec.pendingQty}×</span>
                                  )}
                                </div>
                                {rec.needsRestock && rec.toOrder > 0 ? (
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                      → {rec.toOrder}× bestellen
                                    </span>
                                    {isSachbearbeiter && (
                                      <button
                                        onClick={() => navigate('/lager', { state: { productId: rec.product_id, size: rec.size, qty: rec.toOrder } })}
                                        className="flex items-center gap-1 bg-blue-800 hover:bg-blue-900 text-white text-xs font-medium px-2 py-0.5 rounded-lg transition-colors"
                                      >
                                        <ShoppingBag className="w-3 h-3" /> Bestellen
                                      </button>
                                    )}
                                  </div>
                                ) : rec.pendingQty > 0 && !rec.needsRestock ? (
                                  <span className="text-blue-600 font-medium">Bestellung läuft</span>
                                ) : (
                                  <span className="text-green-600 font-medium flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" /> Ausreichend
                                  </span>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 pt-2 border-t border-gray-200">
                                Keine Bestellungen in den letzten {recentQuarterCount} Quartalen — kein Bedarf errechnet
                              </p>
                            )}
                          </div>
                        )
                      })}
                  </div>

                  <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Nachfrage (Anteil)</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Lagernd vs. Mindestbestand</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Quartals-Trend ── */}
          {tab === 'trend' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {quarterStats.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-gray-400">
                  <BarChart3 className="w-10 h-10 mb-3 opacity-40" />
                  <p>Noch keine Quartalsdaten vorhanden</p>
                </div>
              ) : (
                <>
                  <div className="px-5 py-5 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-4">Bestellmenge pro Quartal</p>
                    <div className="flex items-end gap-3 h-32">
                      {quarterStats.map(q => {
                        const h = Math.round((q.totalQty / maxQtrQty) * 100)
                        const isRecent = recentQuarterCount >= (quarterStats.length - quarterStats.indexOf(q))
                        return (
                          <div key={q.name} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                            <span className="text-xs font-semibold text-gray-700">{q.totalQty}</span>
                            <div className="w-full flex items-end justify-center" style={{ height: '6rem' }}>
                              <div className={`w-full max-w-[2.5rem] rounded-t-md transition-all ${isRecent ? 'bg-blue-600' : 'bg-gray-300'}`}
                                style={{ height: `${Math.max(h, 4)}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 truncate w-full text-center">{q.name}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-blue-600 inline-block" /> In Analyse berücksichtigt</span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-gray-300 inline-block" /> Ältere Quartale</span>
                    </div>
                  </div>
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
