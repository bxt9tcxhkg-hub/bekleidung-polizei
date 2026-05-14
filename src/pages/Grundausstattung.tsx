import { useEffect, useState } from 'react'
import { Plus, X, Trash2, BookOpen } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Product } from '../lib/types'

type Org = 'Stadtpolizei' | 'Parkaufsicht'

interface GrundItem {
  id: string
  organisation: Org
  product_id: string
  size: string
  quantity: number
  products?: Product
}

export default function Grundausstattung() {
  const { profile } = useAuth()
  const [org, setOrg] = useState<Org>('Stadtpolizei')
  const [items, setItems] = useState<GrundItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ product_id: '', size: '', quantity: '1' })
  const [productSearch, setProductSearch] = useState('')
  const [productDropdown, setProductDropdown] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('grundausstattung')
      .select('*, products(*)')
      .eq('organisation', org)
      .order('updated_at', { ascending: true })
    setItems((data ?? []) as GrundItem[])
    setLoading(false)
  }

  useEffect(() => {
    async function init() {
      const { data } = await supabase.from('products').select('*').eq('active', true).order('name')
      setProducts(data ?? [])
    }
    init()
  }, [])

  useEffect(() => { load() }, [org])

  const filteredProducts = productSearch.trim()
    ? products.filter(p =>
        p.organisation === org &&
        (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
         p.article_number.toLowerCase().includes(productSearch.toLowerCase()))
      )
    : products.filter(p => p.organisation === org)

  const selectedProduct = products.find(p => p.id === form.product_id)

  function selectProduct(p: Product) {
    setForm(f => ({ ...f, product_id: p.id, size: p.sizes[0] ?? '' }))
    setProductSearch(p.name)
    setProductDropdown(false)
  }

  async function save() {
    setError('')
    if (!form.product_id) { setError('Bitte Artikel auswählen.'); return }
    setSaving(true)
    const { error } = await (supabase.from('grundausstattung') as any).upsert({
      organisation: org,
      product_id: form.product_id,
      size: form.size,
      quantity: parseInt(form.quantity) || 1,
      created_by: profile!.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organisation,product_id,size' })
    if (error) setError(error.message)
    else { setShowForm(false); resetForm(); load() }
    setSaving(false)
  }

  async function remove(id: string) {
    setDeleting(id)
    await supabase.from('grundausstattung').delete().eq('id', id)
    setDeleting(null)
    load()
  }

  function resetForm() {
    setForm({ product_id: '', size: '', quantity: '1' })
    setProductSearch('')
    setError('')
  }

  const grouped = items.reduce<Record<string, GrundItem[]>>((acc, item) => {
    const cat = item.products?.category ?? 'Sonstiges'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Grundausstattung</h1>
          <p className="text-gray-500 text-sm mt-1">Standardartikel für Neueinstellungen</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2.5 sm:px-4 rounded-lg transition-colors flex-shrink-0"
          title="Artikel hinzufügen"
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Artikel hinzufügen</span>
        </button>
      </div>

      {/* Org tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-5">
        {(['Stadtpolizei', 'Parkaufsicht'] as Org[]).map(o => (
          <button key={o} onClick={() => setOrg(o)}
            className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-all ${org === o ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {o}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-center">
          <BookOpen className="w-12 h-12 mb-3 text-gray-300" />
          <p className="font-semibold text-gray-500">Keine Artikel definiert</p>
          <p className="text-sm text-gray-400 mt-1">Füge Artikel zur Grundausstattung für {org} hinzu</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, catItems]) => (
            <div key={category} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{category}</p>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {catItems.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{item.products?.name ?? '–'}</p>
                        <p className="text-xs text-gray-400 font-mono">{item.products?.article_number}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-sm">
                        {item.size ? <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">Gr. {item.size}</span> : <span className="text-gray-400">–</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-sm font-medium">{item.quantity}×</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => remove(item.id)}
                          disabled={deleting === item.id}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600 disabled:opacity-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <p className="text-xs text-gray-400 text-center pb-2">{items.length} Artikel · {items.reduce((s, i) => s + i.quantity, 0)} Stück gesamt</p>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Artikel hinzufügen — {org}</h2>
              <button onClick={() => { setShowForm(false); resetForm() }} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Product search */}
              <div className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">Artikel *</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Name oder Artikelnummer..."
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setProductDropdown(true); if (!e.target.value) setForm(f => ({ ...f, product_id: '', size: '' })) }}
                  onFocus={() => setProductDropdown(true)}
                  onBlur={() => setTimeout(() => setProductDropdown(false), 150)}
                />
                {productDropdown && filteredProducts.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {filteredProducts.map(p => (
                      <li key={p.id}>
                        <button type="button" onMouseDown={() => selectProduct(p)}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors">
                          <p className="text-sm font-medium text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{p.article_number}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {form.product_id && <p className="text-xs text-green-600 mt-1">✓ Artikel ausgewählt</p>}
              </div>

              {/* Size */}
              {selectedProduct && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Größe</label>
                  {selectedProduct.sizes.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.sizes.map(s => (
                        <button key={s} type="button" onClick={() => setForm(f => ({ ...f, size: s }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.size === s ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Keine Größen — wird ohne Größe hinzugefügt</p>
                  )}
                </div>
              )}

              {/* Quantity */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Menge</label>
                <input
                  type="number" min="1"
                  className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                />
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={() => { setShowForm(false); resetForm() }} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={save} disabled={saving} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Speichern...' : 'Hinzufügen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
