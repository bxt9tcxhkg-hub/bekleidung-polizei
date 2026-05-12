import { useEffect, useState } from 'react'
import { ShoppingCart, Plus, Minus, Trash2, Send, X, ShoppingBag, Tag, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Order, Product, Quarter } from '../lib/types'
import { getCurrentBudget, DEFAULT_BUDGET } from '../lib/budget'

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
  const [adding, setAdding] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<'approved' | 'pending_approval' | null>(null)
  const [sizeModal, setSizeModal] = useState<{ product: Product; size: string; quantity: number } | null>(null)
  const [genderFilterActive, setGenderFilterActive] = useState(true)

  async function loadBudget() {
    const [total, orders] = await Promise.all([
      getCurrentBudget(profile!.id, CURRENT_YEAR),
      supabase.from('orders').select('unit_price, quantity')
        .eq('user_id', profile!.id)
        .not('status', 'in', '("pending","cancelled")')
        .gte('created_at', `${CURRENT_YEAR}-01-01`),
    ])
    setTotalBudgetAmt(total)
    setUsedBudget((orders.data ?? []).reduce((s, o) => s + o.unit_price * o.quantity, 0))
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
      const [pRes, qRes] = await Promise.all([
        supabase.from('products').select('*').eq('active', true).order('category').order('name'),
        supabase.from('quarters').select('*').not('status', 'eq', 'closed').order('year', { ascending: false }),
      ])
      setProducts(pRes.data ?? [])
      const qs = qRes.data ?? []
      setQuarters(qs)
      setActiveQuarter(qs.find(q => q.status === 'active') ?? null)
      await Promise.all([loadCart(), loadBudget()])
      setLoading(false)
    }
    if (profile) init()
  }, [profile])

  const totalBudget = totalBudgetAmt
  const remainingBudget = totalBudget - usedBudget
  const cartTotal = cartItems.reduce((s, o) => s + (o.products?.price ?? 0) * o.quantity, 0)
  const budgetAfterCart = remainingBudget - cartTotal
  const needsApproval = budgetAfterCart < 0

  const userGender = profile?.gender ?? 'male'
  const userOrg = profile?.organisation ?? 'Stadtpolizei'
  const orgFiltered = products.filter(p => !p.organisation || p.organisation === userOrg)
  const genderFiltered = genderFilterActive
    ? orgFiltered.filter(p => p.gender === 'unisex' || p.gender === userGender)
    : orgFiltered

  const categories = ['Alle', ...Array.from(new Set(genderFiltered.map(p => p.category)))]
  const filtered = selectedCategory === 'Alle' ? genderFiltered : genderFiltered.filter(p => p.category === selectedCategory)

  function openSizeModal(product: Product) {
    setSizeModal({ product, size: product.sizes[0] ?? '', quantity: 1 })
  }

  async function addToCart() {
    if (!sizeModal || !activeQuarter) return
    setAdding(sizeModal.product.id)
    await supabase.from('orders').insert({
      user_id: profile!.id,
      product_id: sizeModal.product.id,
      quarter_id: activeQuarter.id,
      size: sizeModal.size,
      quantity: sizeModal.quantity,
      unit_price: sizeModal.product.price,
      status: 'pending',
    })
    setSizeModal(null)
    await loadCart()
    setCartOpen(true)
    setAdding(null)
  }

  async function updateQty(item: CartItem, delta: number) {
    const newQty = Math.max(1, item.quantity + delta)
    await supabase.from('orders').update({ quantity: newQty }).eq('id', item.id)
    loadCart()
  }

  async function removeItem(item: CartItem) {
    await supabase.from('orders').delete().eq('id', item.id)
    loadCart()
  }

  async function submitCart() {
    if (cartItems.length === 0) return
    setSubmitting(true)
    const newStatus = needsApproval ? 'pending_approval' : 'approved'
    await supabase
      .from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('user_id', profile!.id)
      .eq('status', 'pending')
    setSubmitting(false)
    setCartOpen(false)
    setSubmitResult(newStatus)
    await Promise.all([loadCart(), loadBudget()])
  }

  const cartCount = cartItems.reduce((s, o) => s + o.quantity, 0)
  const budgetPct = Math.min(100, (usedBudget / totalBudget) * 100)

  return (
    <div>
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
                ? 'Deine Bestellung wurde direkt weitergeleitet und wird vom Admin bearbeitet.'
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
          className="relative flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <ShoppingCart className="w-4 h-4" />
          Warenkorb
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
            <span className="text-xs text-gray-500">€ {usedBudget.toFixed(2)} / € {totalBudget.toFixed(2)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${budgetPct > 90 ? 'bg-red-500' : budgetPct > 70 ? 'bg-amber-400' : 'bg-green-500'}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <p className={`text-xs mt-1.5 font-medium ${remainingBudget <= 0 ? 'text-red-600' : 'text-gray-500'}`}>
            {remainingBudget <= 0 ? 'Budget aufgebraucht – Bestellungen benötigen Genehmigung' : `€ ${remainingBudget.toFixed(2)} verbleibend`}
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-6">
        {genderFilterActive ? (
          <button onClick={() => setGenderFilterActive(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200 transition-colors">
            {userGender === 'female' ? 'Weiblich' : 'Männlich'}
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button onClick={() => setGenderFilterActive(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-white border border-dashed border-gray-300 text-gray-500 hover:border-blue-300 hover:text-blue-700 transition-colors">
            {userGender === 'female' ? 'Weiblich' : 'Männlich'}
          </button>
        )}
        <div className="w-px bg-gray-200 self-stretch mx-1" />
        {categories.map(cat => (
          <button key={cat} onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedCategory === cat ? 'bg-blue-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Product grid */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(product => (
            <div key={product.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
              <div className="h-32 bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center">
                <ShoppingBag className="w-12 h-12 text-blue-300 opacity-60" />
              </div>
              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug">{product.name}</h3>
                  <span className="text-blue-800 font-bold text-sm whitespace-nowrap">€ {Number(product.price).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-xs text-gray-400 flex items-center gap-1"><Tag className="w-3 h-3" />{product.category}</span>
                  {product.needs_tailoring && <span className="text-xs text-purple-600 font-medium">· Wappenänderung</span>}
                  {product.size_guide && (
                    <a href={product.size_guide} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5 font-medium" title="Größentabelle öffnen">
                      <Info className="w-3 h-3" /> Größentabelle
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mb-4">
                  {product.sizes.slice(0, 6).map(s => (
                    <span key={s} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md">{s}</span>
                  ))}
                  {product.sizes.length > 6 && <span className="text-xs px-2 py-0.5 text-gray-400">+{product.sizes.length - 6}</span>}
                </div>
                <button
                  onClick={() => openSizeModal(product)}
                  disabled={!activeQuarter || adding === product.id}
                  className="mt-auto w-full flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium py-2 rounded-xl transition-colors"
                >
                  <Plus className="w-4 h-4" /> In den Warenkorb
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
                <p className="text-xs text-gray-500 mt-0.5">€ {Number(sizeModal.product.price).toFixed(2)} · {sizeModal.product.category}</p>
                {sizeModal.product.size_guide && (
                  <a href={sizeModal.product.size_guide} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-0.5 font-medium">
                    <Info className="w-3 h-3" /> Größentabelle
                  </a>
                )}
              </div>
              <button onClick={() => setSizeModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Größe wählen</p>
                <div className="flex flex-wrap gap-2">
                  {sizeModal.product.sizes.map(s => (
                    <button key={s} onClick={() => setSizeModal(m => m ? { ...m, size: s } : m)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${sizeModal.size === s ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Menge</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setSizeModal(m => m ? { ...m, quantity: Math.max(1, m.quantity - 1) } : m)} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50"><Minus className="w-4 h-4" /></button>
                  <span className="text-lg font-semibold w-8 text-center">{sizeModal.quantity}</span>
                  <button onClick={() => setSizeModal(m => m ? { ...m, quantity: m.quantity + 1 } : m)} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t flex gap-3">
              <button onClick={() => setSizeModal(null)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-xl text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={addToCart} disabled={!sizeModal.size || adding === sizeModal.product.id}
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
                        <p className="text-xs text-gray-400 mt-0.5">Gr. {item.size}</p>
                        <p className="text-xs font-semibold text-gray-700 mt-1">€ {((item.products?.price ?? 0) * item.quantity).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <button onClick={() => updateQty(item, -1)} disabled={item.quantity <= 1} className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-30"><Minus className="w-3.5 h-3.5" /></button>
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
                  <span className="font-bold text-gray-900">€ {cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Restbudget nach Bestellung</span>
                  <span className={`font-semibold ${budgetAfterCart < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    € {budgetAfterCart.toFixed(2)}
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
    </div>
  )
}
