import { useEffect, useState } from 'react'
import { ShoppingCart, Plus, Minus, Trash2, Send, X, ShoppingBag, AlertTriangle, CheckCircle, Info, PackageX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Order, Product, Quarter } from '../lib/types'
import { getCurrentBudget, getUsedBudget, DEFAULT_BUDGET } from '../lib/budget'
import { fmtEUR } from '../lib/format'
import { groupSizes, sizeLabel, sortedSizes } from '../lib/sizes'
import { buildInventoryMap, inventoryKey } from '../lib/inventory'

const CURRENT_YEAR = new Date().getFullYear()

type CartItem = Order & { products?: Product; quarters?: Quarter }

export default function Shop() {
  const { profile } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [, setQuarters] = useState<Quarter[]>([])
  const [activeQuarter, setActiveQuarter] = useState<Quarter | null>(null)
  const [totalBudgetAmt, setTotalBudgetAmt] = useState(DEFAULT_BUDGET)
  const [usedBudget, setUsedBudget] = useState(0)
  const [loading, setLoading] = useState(true)
  const [cartOpen, setCartOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('Alle')
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('Alle')
  const [adding, setAdding] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<'approved' | 'pending_approval' | null>(null)
  const [sizeModal, setSizeModal] = useState<{ product: Product; size: string; quantity: number } | null>(null)
  const [genderFilterActive, setGenderFilterActive] = useState(true)
  const [sizeGuideModal, setSizeGuideModal] = useState<string | null>(null)
  const [lastSizes, setLastSizes] = useState<Record<string, string>>({})
  const [inventoryMap, setInventoryMap] = useState<Record<string, number>>({})
  const [error, setError] = useState('')

  /** Bei nicht mehr gelisteten (inaktiven) Artikeln nur Größen mit Restbestand anbieten. */
  function orderableSizes(product: Product): string[] {
    if (product.active) return product.sizes
    return product.sizes.filter(s => (inventoryMap[inventoryKey(product.id, s)] ?? 0) > 0)
  }

  function stockOf(product: Product, size: string): number {
    return inventoryMap[inventoryKey(product.id, size)] ?? 0
  }

  async function loadBudget() {
    const [total, used] = await Promise.all([
      getCurrentBudget(profile!.id, CURRENT_YEAR),
      getUsedBudget(profile!.id, CURRENT_YEAR),
    ])
    setTotalBudgetAmt(total)
    setUsedBudget(used)
  }

  async function loadCart() {
    const { data } = await supabase
      .from('orders')
      .select('*, products(id,name,category,sizes,price,needs_tailoring), quarters(id,name,status)')
      .eq('user_id', profile!.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setCartItems((data ?? []) as CartItem[])
  }

  useEffect(() => {
    async function init() {
      setLoading(true)
      const [pRes, qRes, invRes] = await Promise.all([
        supabase.from('products').select('*').eq('organisation', profile?.organisation ?? 'Stadtpolizei').order('category').order('name'),
        supabase.from('quarters').select('*').not('status', 'eq', 'closed').order('year', { ascending: false }),
        supabase.from('inventory').select('product_id,size,quantity'),
      ])
      const invMap = buildInventoryMap(invRes.data ?? [])
      setInventoryMap(invMap)
      // Inaktive (nicht mehr gelistete) Artikel nur zeigen, solange noch Restbestand einer Größe da ist.
      const availableProducts = (pRes.data ?? []).filter(p =>
        p.active || p.sizes.some(s => (invMap[inventoryKey(p.id, s)] ?? 0) > 0),
      )
      setProducts(availableProducts)
      const qs = qRes.data ?? []
      setQuarters(qs)
      setActiveQuarter(qs.find(q => q.status === 'active') ?? null)
      const [, , prevRes] = await Promise.all([
        loadCart(),
        loadBudget(),
        supabase.from('orders').select('product_id,size,created_at')
          .eq('user_id', profile!.id)
          .not('status', 'in', '(pending,cancelled)')
          .order('created_at', { ascending: false }),
      ])
      const map: Record<string, string> = {}
      for (const o of (prevRes.data ?? [])) {
        if (!map[o.product_id]) map[o.product_id] = o.size
      }
      setLastSizes(map)
      setLoading(false)
    }
    if (profile) init().catch(() => { setError('Daten konnten nicht geladen werden. Bitte Seite neu laden.'); setLoading(false) })
  }, [profile])

  const totalBudget = totalBudgetAmt
  const remainingBudget = totalBudget - usedBudget
  const cartTotal = cartItems.reduce((s, o) => s + o.unit_price * o.quantity, 0)
  const budgetAfterCart = remainingBudget - cartTotal
  const needsApproval = budgetAfterCart < 0

  const userGender = profile?.gender ?? 'male'
  const userOrg = profile?.organisation ?? 'Stadtpolizei'
  const orgFiltered = products.filter(p => !p.organisation || p.organisation === userOrg)
  const genderFiltered = genderFilterActive
    ? orgFiltered.filter(p => p.gender === 'unisex' || p.gender === userGender)
    : orgFiltered

  const categories = ['Alle', ...Array.from(new Set(genderFiltered.map(p => p.category))).values()].sort((a, b) => a === 'Alle' ? -1 : b === 'Alle' ? 1 : a.localeCompare(b))
  const catFiltered = selectedCategory === 'Alle' ? genderFiltered : genderFiltered.filter(p => p.category === selectedCategory)
  const subCategories = selectedCategory === 'Alle' ? [] : ['Alle', ...Array.from(new Set(catFiltered.map(p => p.sub_category).filter(Boolean)))]
  const filtered = selectedSubCategory === 'Alle' || selectedCategory === 'Alle'
    ? catFiltered
    : catFiltered.filter(p => p.sub_category === selectedSubCategory)

  const SUB_CAT_PREF: Record<string, string> = {
    'Hosen': 'hose', 'Hosen & Röcke': 'hose',
    'Jacken': 'jacke', 'Jacken & Mäntel': 'jacke',
    'Hemden & Blusen': 'hemd', 'Funktionshemden': 'hemd',
    'Schuhe': 'schuh', 'Stiefel': 'schuh',
    'Kappen & Baretts': 'kopf',
    'Handschuhe': 'handschuh',
    'Strickware': 'strickware', 'Unterbekleidung': 'strickware',
  }

  function openSizeModal(product: Product) {
    const sizes = orderableSizes(product)
    const prefKey = SUB_CAT_PREF[product.sub_category ?? '']
    const prefSize = prefKey ? (profile?.size_preferences ?? {})[prefKey] : undefined
    const hasPref = prefSize && sizes.includes(prefSize)
    const lastSize = lastSizes[product.id]
    const defaultSize = hasPref ? prefSize : (lastSize && sizes.includes(lastSize) ? lastSize : sizes[0] ?? '')
    setSizeModal({ product, size: defaultSize, quantity: 1 })
  }

  async function addToCart() {
    if (!sizeModal || !activeQuarter) return
    const existing = cartItems.find(o =>
      o.product_id === sizeModal.product.id && o.size === sizeModal.size && o.quarter_id === activeQuarter.id
    )
    if (!sizeModal.product.active) {
      const stock = stockOf(sizeModal.product, sizeModal.size)
      const requestedTotal = (existing?.quantity ?? 0) + sizeModal.quantity
      if (requestedTotal > stock) {
        setError(`Nur noch ${stock}× „${sizeModal.product.name}" (Gr. ${sizeLabel(sizeModal.size, true)}) am Lager – der Artikel wird nicht mehr nachbestellt.`)
        return
      }
    }
    setAdding(sizeModal.product.id)
    const { error: err } = existing
      ? await supabase.from('orders').update({ quantity: existing.quantity + sizeModal.quantity }).eq('id', existing.id)
      : await supabase.from('orders').insert({
          user_id: profile!.id,
          product_id: sizeModal.product.id,
          quarter_id: activeQuarter.id,
          size: sizeModal.size,
          quantity: sizeModal.quantity,
          unit_price: sizeModal.product.price,
          status: 'pending',
        })
    if (err) {
      setError('Artikel konnte nicht hinzugefügt werden. Bitte erneut versuchen.')
      setAdding(null)
      return
    }
    setSizeModal(null)
    await loadCart()
    setCartOpen(true)
    setAdding(null)
  }

  async function updateQty(item: CartItem, delta: number) {
    const newQty = Math.max(1, item.quantity + delta)
    const { error: err } = await supabase.from('orders').update({ quantity: newQty }).eq('id', item.id)
    if (err) setError('Menge konnte nicht geändert werden.')
    await loadCart()
  }

  async function removeItem(item: CartItem) {
    const { error: err } = await supabase.from('orders').delete().eq('id', item.id)
    if (err) setError('Artikel konnte nicht entfernt werden.')
    await loadCart()
  }

  async function submitCart() {
    if (cartItems.length === 0) return
    if (!activeQuarter) {
      setError('Kein aktives Quartal – Bestellungen können derzeit nicht eingereicht werden.')
      return
    }
    setSubmitting(true)
    const { data, error: err } = await supabase.rpc('submit_cart')
    setSubmitting(false)
    if (err) {
      setError('Bestellung konnte nicht eingereicht werden. Bitte erneut versuchen.')
      return
    }
    if (data !== 'approved' && data !== 'pending_approval') {
      setError('Warenkorb ist leer oder wurde bereits eingereicht.')
      await loadCart()
      return
    }
    setCartOpen(false)
    setSubmitResult(data)
    await Promise.all([loadCart(), loadBudget()])
  }

  const cartCount = cartItems.reduce((s, o) => s + o.quantity, 0)
  const budgetPct = Math.min(100, (usedBudget / totalBudget) * 100)

  return (
    <div>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center justify-between">
          {error}
          <button onClick={() => setError('')} className="ml-3 text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Submit result banner */}
      {submitResult && (
        <div className={`mb-4 flex items-start gap-3 px-4 py-3 rounded-xl ${submitResult === 'approved' ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
          {submitResult === 'approved'
            ? <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            : <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />}
          <div>
            <p className={`font-semibold text-sm ${submitResult === 'approved' ? 'text-green-800' : 'text-amber-800'}`}>
              {submitResult === 'approved' ? 'Bestellung eingereicht' : 'Genehmigung erforderlich'}
            </p>
            <p className={`text-xs mt-0.5 ${submitResult === 'approved' ? 'text-green-700' : 'text-amber-700'}`}>
              {submitResult === 'approved'
                ? 'Deine Bestellung wurde direkt weitergeleitet und wird vom Sachbearbeiter bearbeitet.'
                : 'Dein Restbudget reicht nicht aus. Ein Genehmiger muss die Bestellung zuerst freigeben.'}
            </p>
          </div>
          <button onClick={() => setSubmitResult(null)} className="ml-auto p-1 rounded-md hover:bg-black/5"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bekleidungskatalog</h1>
          {activeQuarter
            ? <p className="text-gray-500 text-sm mt-1">Aktives Quartal: <span className="font-medium text-gray-700">{activeQuarter.name}</span></p>
            : <p className="text-amber-600 text-sm mt-1">Kein aktives Quartal – Bestellungen derzeit nicht möglich</p>}
        </div>
        <button
          onClick={() => setCartOpen(true)}
          className="relative flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-xl transition-colors"
        >
          <ShoppingCart className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Warenkorb</span>
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Budget bar */}
      {!loading && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-600">Jahresbudget {CURRENT_YEAR}</span>
            <span className="text-xs text-gray-500">{fmtEUR(usedBudget)} / {fmtEUR(totalBudget)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${budgetPct > 90 ? 'bg-red-500' : budgetPct > 70 ? 'bg-amber-400' : 'bg-green-500'}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <p className={`text-xs mt-1.5 font-medium ${remainingBudget <= 0 ? 'text-red-600' : 'text-gray-500'}`}>
            {remainingBudget <= 0 ? 'Budget aufgebraucht – Bestellungen benötigen Genehmigung' : `${fmtEUR(remainingBudget)} verbleibend`}
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 mb-4 scrollbar-hide">
        {genderFilterActive ? (
          <button onClick={() => setGenderFilterActive(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200 transition-colors flex-shrink-0">
            {userGender === 'female' ? 'Weiblich' : 'Männlich'}
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button onClick={() => setGenderFilterActive(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-white border border-dashed border-gray-300 text-gray-500 hover:border-blue-300 hover:text-blue-700 transition-colors flex-shrink-0">
            {userGender === 'female' ? 'Weiblich' : 'Männlich'}
          </button>
        )}
        <div className="w-px bg-gray-200 self-stretch mx-1 flex-shrink-0" />
        {categories.map(cat => (
          <button key={cat} onClick={() => { setSelectedCategory(cat); setSelectedSubCategory('Alle') }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex-shrink-0 ${selectedCategory === cat ? 'bg-blue-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Sub-category filter */}
      {subCategories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 mb-4 scrollbar-hide">
          {subCategories.map(sub => (
            <button key={sub} onClick={() => setSelectedSubCategory(sub as string)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex-shrink-0 ${selectedSubCategory === sub ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
              {sub}
            </button>
          ))}
        </div>
      )}

      {/* Product grid */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(product => (
            <div key={product.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
              <div className="h-20 sm:h-28 bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center">
                <ShoppingBag className="w-8 h-8 sm:w-10 sm:h-10 text-blue-300 opacity-60" />
              </div>
              <div className="p-3 sm:p-4 flex flex-col flex-1">
                <h3 className="font-semibold text-gray-900 text-xs sm:text-sm leading-snug mb-1">{product.name}</h3>
                {!product.active && (
                  <span className="inline-flex items-center gap-1 w-fit bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-medium px-1.5 py-0.5 rounded-md mb-1.5">
                    <PackageX className="w-3 h-3" /> Nicht mehr lieferbar · begrenzter Restbestand
                  </span>
                )}
                <p className="text-blue-800 font-bold text-xs sm:text-sm mb-3">{fmtEUR(Number(product.price))}</p>
                <button
                  onClick={() => openSizeModal(product)}
                  disabled={!activeQuarter || adding === product.id}
                  className="mt-auto w-full flex items-center justify-center gap-1.5 bg-blue-800 hover:bg-blue-900 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs sm:text-sm font-medium py-2 rounded-xl transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">In den Warenkorb</span>
                  <span className="sm:hidden">Hinzufügen</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Size modal */}
      {sizeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="font-bold text-gray-900">{sizeModal.product.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{fmtEUR(Number(sizeModal.product.price))} · {sizeModal.product.category}</p>
                {!sizeModal.product.active && (
                  <p className="flex items-center gap-1 text-xs text-amber-700 mt-1">
                    <PackageX className="w-3.5 h-3.5" /> Nicht mehr lieferbar – nur Größen mit Restbestand wählbar
                  </p>
                )}
                {sizeModal.product.size_guide && (
                  <button onClick={() => setSizeGuideModal(sizeModal.product.size_guide!)}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-0.5 font-medium">
                    <Info className="w-3 h-3" /> Größentabelle
                  </button>
                )}
              </div>
              <button onClick={() => setSizeModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {orderableSizes(sizeModal.product).length > 0 && (() => {
                const sizes = sortedSizes(orderableSizes(sizeModal.product))
                const groups = groupSizes(sizes)
                const isGrouped = groups !== null

                const SizeBtn = ({ s }: { s: string }) => {
                  const isLast = lastSizes[sizeModal.product.id] === s
                  const stock = !sizeModal.product.active ? stockOf(sizeModal.product, s) : null
                  return (
                    <button key={s} onClick={() => setSizeModal(m => m ? { ...m, size: s, quantity: 1 } : m)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors relative ${sizeModal.size === s ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                      {sizeLabel(s, isGrouped)}
                      {stock !== null && <span className="ml-1 text-[10px] opacity-75">({stock}×)</span>}
                      {isLast && (
                        <span className={`absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full border-2 border-white ${sizeModal.size === s ? 'bg-yellow-300' : 'bg-blue-400'}`} title="Zuletzt bestellt" />
                      )}
                    </button>
                  )
                }

                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-600">Größe wählen</p>
                      {lastSizes[sizeModal.product.id] && (
                        <span className="text-xs text-blue-600 font-medium">
                          Zuletzt bestellt: Gr. {sizeLabel(lastSizes[sizeModal.product.id], isGrouped)}
                        </span>
                      )}
                    </div>
                    {groups ? (
                      <div className="space-y-3">
                        {groups.map(g => (
                          <div key={g.label}>
                            <p className="text-xs text-gray-400 mb-1.5">{g.label}:</p>
                            <div className="flex flex-wrap gap-2">
                              {g.sizes.map(s => <SizeBtn key={s} s={s} />)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {sizes.map(s => <SizeBtn key={s} s={s} />)}
                      </div>
                    )}
                  </div>
                )
              })()}
              {(() => {
                const maxQty = sizeModal.product.active ? null : stockOf(sizeModal.product, sizeModal.size)
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-600">Menge</p>
                      {maxQty !== null && (
                        <span className="text-xs text-amber-700 font-medium">nur noch {maxQty}× am Lager</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setSizeModal(m => m ? { ...m, quantity: Math.max(1, m.quantity - 1) } : m)} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50"><Minus className="w-4 h-4" /></button>
                      <span className="text-lg font-semibold w-8 text-center">{sizeModal.quantity}</span>
                      <button
                        onClick={() => setSizeModal(m => m ? { ...m, quantity: maxQty !== null ? Math.min(maxQty, m.quantity + 1) : m.quantity + 1 } : m)}
                        disabled={maxQty !== null && sizeModal.quantity >= maxQty}
                        className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
                      ><Plus className="w-4 h-4" /></button>
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="px-5 py-4 border-t flex gap-3">
              <button onClick={() => setSizeModal(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-xl text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={addToCart} disabled={(orderableSizes(sizeModal.product).length > 0 && !sizeModal.size) || adding === sizeModal.product.id}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-xl text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                <ShoppingCart className="w-4 h-4" /> Hinzufügen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="relative w-full max-w-sm bg-white shadow-2xl flex flex-col h-full">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-blue-800" />
                <h2 className="font-bold text-gray-900">Warenkorb</h2>
                {cartCount > 0 && <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full">{cartCount}</span>}
              </div>
              <button onClick={() => setCartOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {cartItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 px-6 text-center">
                  <ShoppingCart className="w-12 h-12 mb-3 opacity-30" />
                  <p className="font-medium">Warenkorb ist leer</p>
                  <p className="text-sm mt-1">Wähle Artikel aus dem Katalog</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {cartItems.map(item => (
                    <div key={item.id} className="flex items-start gap-3 px-5 py-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 leading-snug">{item.products?.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Gr. {sizeLabel(item.size, true)}</p>
                        <p className="text-xs font-semibold text-gray-700 mt-1">{fmtEUR(item.unit_price * item.quantity)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <button onClick={() => updateQty(item, -1)} disabled={item.quantity <= 1} className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-60"><Minus className="w-3.5 h-3.5" /></button>
                        <span className="text-sm font-medium w-5 text-center">{item.quantity}</span>
                        <button onClick={() => updateQty(item, 1)} className="p-1 rounded-md hover:bg-gray-100"><Plus className="w-3.5 h-3.5" /></button>
                        <button onClick={() => removeItem(item)} className="p-1 ml-1 rounded-md hover:bg-red-50 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cartItems.length > 0 && (
              <div className="border-t px-5 py-4 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Warenkorb gesamt</span>
                  <span className="font-bold text-gray-900">{fmtEUR(cartTotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Restbudget nach Bestellung</span>
                  <span className={`font-semibold ${budgetAfterCart < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {fmtEUR(budgetAfterCart)}
                  </span>
                </div>
                {needsApproval && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">Budget überschritten – Bestellung wird zur Genehmigung weitergeleitet.</p>
                  </div>
                )}
                <button onClick={submitCart} disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60">
                  <Send className="w-4 h-4" />
                  {submitting ? 'Wird eingereicht...' : needsApproval ? 'Zur Genehmigung einreichen' : 'Bestellung einreichen'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Size Guide Modal */}
      {sizeGuideModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setSizeGuideModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Info className="w-4 h-4 text-blue-500" /> Größentabelle</h3>
              <button onClick={() => setSizeGuideModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{sizeGuideModal.replace(/ \| /g, '\n')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
