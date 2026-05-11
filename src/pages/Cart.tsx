import { useEffect, useState } from 'react'
import { ShoppingCart, Plus, Minus, Trash2, Send, Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Order, Product, Quarter } from '../lib/types'

export default function Cart() {
  const { profile } = useAuth()
  const [cartItems, setCartItems] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({ product_id: '', quarter_id: '', size: '', quantity: 1 })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, products(id,name,category,sizes,price,needs_tailoring), quarters(id,name,status)')
      .eq('user_id', profile!.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setCartItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    async function init() {
      await load()
      const [pRes, qRes] = await Promise.all([
        supabase.from('products').select('*').eq('active', true).order('category').order('name'),
        supabase.from('quarters').select('*').not('status', 'eq', 'closed').order('year', { ascending: false }),
      ])
      setProducts(pRes.data ?? [])
      const qs = qRes.data ?? []
      setQuarters(qs)
      const active = qs.find(q => q.status === 'active')
      if (active) setForm(f => ({ ...f, quarter_id: active.id }))
    }
    if (profile) init()
  }, [profile])

  async function addToCart() {
    setFormError('')
    if (!form.product_id || !form.quarter_id || !form.size) { setFormError('Alle Felder sind Pflicht.'); return }
    const q = quarters.find(q => q.id === form.quarter_id)
    if (q?.status === 'closed') { setFormError('Das gewählte Quartal ist gesperrt.'); return }
    setSaving(true)
    const { error } = await supabase.from('orders').insert({
      user_id: profile!.id,
      product_id: form.product_id,
      quarter_id: form.quarter_id,
      size: form.size,
      quantity: form.quantity,
      status: 'pending',
    })
    if (error) setFormError(error.message)
    else {
      setShowAddForm(false)
      setForm(f => ({ ...f, product_id: '', size: '', quantity: 1 }))
      load()
    }
    setSaving(false)
  }

  async function updateQty(item: Order, delta: number) {
    const newQty = Math.max(1, item.quantity + delta)
    await supabase.from('orders').update({ quantity: newQty }).eq('id', item.id)
    load()
  }

  async function removeItem(item: Order) {
    if (!confirm(`"${(item as any).products?.name}" aus dem Warenkorb entfernen?`)) return
    await supabase.from('orders').delete().eq('id', item.id)
    load()
  }

  async function submitCart() {
    if (cartItems.length === 0) return
    if (!confirm(`${cartItems.length} Artikel einreichen? Die Bestellung wird zur Genehmigung weitergeleitet.`)) return
    setSubmitting(true)
    await supabase
      .from('orders')
      .update({ status: 'pending_approval', updated_at: new Date().toISOString() })
      .eq('user_id', profile!.id)
      .eq('status', 'pending')
    setSubmitting(false)
    load()
  }

  const selectedProduct = products.find(p => p.id === form.product_id)
  const totalValue = cartItems.reduce((s, o) => s + ((o as any).products?.price ?? 0) * o.quantity, 0)

  // Group by category for display
  const grouped = cartItems.reduce<Record<string, Order[]>>((acc, o) => {
    const cat = (o as any).products?.category ?? 'Sonstiges'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(o)
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Warenkorb</h1>
          <p className="text-gray-500 text-sm mt-1">{cartItems.length === 0 ? 'Leer' : `${cartItems.length} Artikel · € ${totalValue.toFixed(2)}`}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setFormError(''); setShowAddForm(true) }} className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            <Plus className="w-4 h-4" /> Artikel hinzufügen
          </button>
          {cartItems.length > 0 && (
            <button onClick={submitCart} disabled={submitting} className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
              <Send className="w-4 h-4" /> {submitting ? 'Wird eingereicht...' : 'Bestellung einreichen'}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : cartItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-gray-400">
          <ShoppingCart className="w-12 h-12 mb-3" />
          <p className="font-medium">Warenkorb ist leer</p>
          <p className="text-sm mt-1">Füge Artikel hinzu, um eine Bestellung einzureichen</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{category}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {items.map(o => (
                  <div key={o.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{(o as any).products?.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Gr. {o.size} · {(o as any).quarters?.name}
                        {(o as any).products?.needs_tailoring && <span className="ml-2 text-purple-600">· Schneider nötig</span>}
                      </p>
                    </div>
                    <div className="text-sm text-gray-500 w-20 text-right">
                      € {((o as any).products?.price ?? 0).toFixed(2)}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQty(o, -1)} disabled={o.quantity <= 1} className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-30">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm font-medium w-6 text-center">{o.quantity}</span>
                      <button onClick={() => updateQty(o, 1)} className="p-1 rounded-md hover:bg-gray-100">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-sm font-semibold text-gray-900 w-20 text-right">
                      € {((o as any).products?.price ?? 0 * o.quantity).toFixed(2)}
                    </div>
                    <button onClick={() => removeItem(o)} className="p-1.5 hover:bg-red-50 rounded-md text-red-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="bg-gray-50 rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between">
            <span className="text-sm text-gray-600">Gesamtwert</span>
            <span className="text-lg font-bold text-gray-900">€ {totalValue.toFixed(2)}</span>
          </div>

          <button onClick={submitCart} disabled={submitting} className="w-full flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-60">
            <Send className="w-4 h-4" /> {submitting ? 'Wird eingereicht...' : `${cartItems.length} Artikel zur Genehmigung einreichen`}
          </button>
        </div>
      )}

      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Artikel hinzufügen</h2>
              <button onClick={() => setShowAddForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Package className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Produkt *</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value, size: '' }))}>
                  <option value="">– Bitte wählen –</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.category})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quartal *</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.quarter_id} onChange={e => setForm(f => ({ ...f, quarter_id: e.target.value }))}>
                  <option value="">– Bitte wählen –</option>
                  {quarters.map(q => <option key={q.id} value={q.id}>{q.name} ({q.status === 'active' ? 'Aktiv' : 'Geplant'})</option>)}
                </select>
              </div>
              {selectedProduct && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Größe *</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedProduct.sizes.map(s => (
                      <button key={s} type="button" onClick={() => setForm(f => ({ ...f, size: s }))} className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${form.size === s ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Menge</label>
                <input type="number" min="1" max="99" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} />
              </div>
              {formError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowAddForm(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={addToCart} disabled={saving} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Wird hinzugefügt...' : 'In den Warenkorb'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
