import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Trash2, BookOpen, ShoppingCart, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Product, Quarter } from '../lib/types'
import { groupSizes, sizeLabel, sortedSizes } from '../lib/sizes'

type Org = 'Stadtpolizei' | 'Parkaufsicht'

interface GrundItem {
  id: string
  organisation: Org
  product_id: string
  quantity: number
  products?: Product
}

export default function Grundausstattung() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [org, setOrg] = useState<Org>('Stadtpolizei')
  const [items, setItems] = useState<GrundItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [activeQuarter, setActiveQuarter] = useState<Quarter | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Verwaltung – Artikel hinzufügen
  const [showAdd, setShowAdd] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productDropdown, setProductDropdown] = useState(false)
  const [addProductId, setAddProductId] = useState('')
  const [addQty, setAddQty] = useState('1')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [addError, setAddError] = useState('')
  const [cartError, setCartError] = useState('')
  const [error, setError] = useState('')

  // Neue Einstellung – Größen auswählen
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({}) // product_id → size
  const [addingToCart, setAddingToCart] = useState(false)
  const [cartSuccess, setCartSuccess] = useState(false)

  async function load(isInitial = false) {
    if (isInitial) setLoading(true); else setRefreshing(true)
    const { data } = await supabase.from('grundausstattung')
      .select('*, products(*)')
      .eq('organisation', org)
      .order('updated_at', { ascending: true })
    const loaded = (data ?? []) as GrundItem[]
    setItems(loaded)
    // Only set default sizes for items that don't already have a selection
    setSelectedSizes(prev => {
      const next = { ...prev }
      loaded.forEach(item => {
        if (item.products?.sizes?.length && !next[item.product_id]) {
          // Erste Größe in sortierter Reihenfolge; bei gruppierten Größen die erste Normal-Größe
          const sizes = sortedSizes(item.products.sizes)
          const groups = groupSizes(sizes)
          const normalGroup = groups?.find(g => g.label === 'Normal')
          next[item.product_id] = normalGroup?.sizes[0] ?? groups?.[0]?.sizes[0] ?? sizes[0]
        }
      })
      // Remove selections for items no longer in the list
      Object.keys(next).forEach(pid => {
        if (!loaded.find(i => i.product_id === pid)) delete next[pid]
      })
      return next
    })
    if (isInitial) setLoading(false); else setRefreshing(false)
  }

  useEffect(() => {
    async function init() {
      const [pRes, qRes] = await Promise.all([
        supabase.from('products').select('*').eq('active', true).order('name'),
        supabase.from('quarters').select('*').eq('status', 'active').limit(1),
      ])
      setProducts(pRes.data ?? [])
      setActiveQuarter((qRes.data ?? [])[0] ?? null)
    }
    init()
  }, [])

  useEffect(() => { load(true).catch(() => setError('Daten konnten nicht geladen werden.')) }, [org])

  const orgProducts = products.filter(p => p.organisation === org)
  const filteredProducts = productSearch.trim()
    ? orgProducts.filter(p =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.article_number.toLowerCase().includes(productSearch.toLowerCase())
      )
    : orgProducts

  function selectProduct(p: Product) {
    setAddProductId(p.id)
    setProductSearch(p.name)
    setProductDropdown(false)
  }

  async function addItem() {
    setAddError('')
    if (!addProductId) { setAddError('Bitte Artikel auswählen.'); return }
    setSaving(true)
    const { error } = await supabase.from('grundausstattung').upsert({
      organisation: org,
      product_id: addProductId,
      quantity: parseInt(addQty) || 1,
      created_by: profile!.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organisation,product_id' })
    if (error) setAddError(error.message)
    else { setShowAdd(false); setAddProductId(''); setProductSearch(''); setAddQty('1'); load(false) }
    setSaving(false)
  }

  async function removeItem(id: string) {
    setDeleting(id)
    const { error: delError } = await supabase.from('grundausstattung').delete().eq('id', id)
    setDeleting(null)
    if (delError) { setError('Artikel konnte nicht entfernt werden.'); return }
    load(false)
  }

  async function addAllToCart() {
    if (!activeQuarter) return
    setCartError('')
    setAddingToCart(true)
    let ok = 0
    const failedNames: string[] = []
    let skipped = 0
    for (const item of items) {
      if (!item.products) { skipped++; continue }
      const { error: insertError } = await supabase.from('orders').insert({
        user_id: profile!.id,
        product_id: item.product_id,
        quarter_id: activeQuarter.id,
        size: selectedSizes[item.product_id] ?? '',
        quantity: item.quantity,
        unit_price: item.products.price,
        status: 'pending',
      })
      if (insertError) failedNames.push(item.products.name); else ok++
    }
    setAddingToCart(false)
    const messages: string[] = []
    if (failedNames.length > 0) {
      messages.push(`${ok} von ${items.length} Positionen in den Warenkorb gelegt, ${failedNames.length} fehlgeschlagen: ${failedNames.join(', ')}.`)
    }
    if (skipped > 0) {
      messages.push(`${skipped} Position${skipped !== 1 ? 'en' : ''} ohne zugeordnetes Produkt wurde${skipped !== 1 ? 'n' : ''} übersprungen.`)
    }
    if (messages.length > 0) {
      setCartError(messages.join(' '))
      return
    }
    setCartSuccess(true)
    setTimeout(() => { setCartSuccess(false); navigate('/warenkorb') }, 1200)
  }

  const grouped = items.reduce<Record<string, GrundItem[]>>((acc, item) => {
    const cat = item.products?.category ?? 'Sonstiges'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const allSizesSelected = items.every(i => !i.products?.sizes?.length || selectedSizes[i.product_id])
  const missingCount = items.filter(i => i.products?.sizes?.length && !selectedSizes[i.product_id]).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Grundausstattung</h1>
          <p className="text-gray-500 text-sm mt-1">Standardartikel für Neueinstellungen</p>
        </div>
      </div>

      {/* Org tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
        {(['Stadtpolizei', 'Parkaufsicht'] as Org[]).map(o => (
          <button key={o} onClick={() => setOrg(o)}
            className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-all ${org === o ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {o}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Linke Spalte: Verwaltung ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                Standardartikel
                {refreshing && <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-800 border-t-transparent animate-spin" />}
              </h2>
              <button
                onClick={() => { setShowAdd(true); setAddProductId(''); setProductSearch(''); setAddQty('1'); setAddError('') }}
                className="flex items-center gap-1.5 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" /> Hinzufügen
              </button>
            </div>

            {items.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-12 text-center">
                <BookOpen className="w-10 h-10 mb-3 text-gray-300" />
                <p className="font-medium text-gray-500 text-sm">Keine Artikel definiert</p>
                <p className="text-xs text-gray-400 mt-1">Füge Artikel zur Grundausstattung für {org} hinzu</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {Object.entries(grouped).map(([cat, catItems], gi) => (
                  <div key={cat}>
                    {gi > 0 && <div className="border-t border-gray-100" />}
                    <div className="px-4 py-2 bg-gray-50">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{cat}</p>
                    </div>
                    {catItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between px-4 py-3 border-t border-gray-50 hover:bg-gray-50">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{item.products?.name ?? '–'}</p>
                          <p className="text-xs text-gray-400 font-mono">{item.products?.article_number}</p>
                        </div>
                        <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                          <span className="text-sm text-gray-500">{item.quantity}×</span>
                          <button
                            onClick={() => removeItem(item.id)}
                            disabled={deleting === item.id}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
                  {items.length} Artikel · {items.reduce((s, i) => s + i.quantity, 0)} Stück gesamt
                </div>
              </div>
            )}

            {/* Add modal */}
            {showAdd && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
                  <div className="flex items-center justify-between px-5 py-4 border-b">
                    <h3 className="font-bold text-gray-900 text-sm">Artikel hinzufügen</h3>
                    <button onClick={() => setShowAdd(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    <div className="relative">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Artikel *</label>
                      <input
                        type="text"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Name oder Artikelnummer..."
                        value={productSearch}
                        onChange={e => { setProductSearch(e.target.value); setProductDropdown(true); if (!e.target.value) setAddProductId('') }}
                        onFocus={() => setProductDropdown(true)}
                        onBlur={() => setTimeout(() => setProductDropdown(false), 150)}
                        autoFocus
                      />
                      {productDropdown && filteredProducts.length > 0 && (
                        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                          {filteredProducts.map(p => (
                            <li key={p.id}>
                              <button type="button" onMouseDown={() => selectProduct(p)}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm">
                                <p className="font-medium text-gray-900">{p.name}</p>
                                <p className="text-xs text-gray-400 font-mono">{p.article_number}</p>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Menge</label>
                      <input type="number" min="1"
                        className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={addQty} onChange={e => setAddQty(e.target.value)} />
                    </div>
                    {addError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{addError}</p>}
                  </div>
                  <div className="flex gap-3 px-5 py-4 border-t">
                    <button onClick={() => setShowAdd(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
                    <button onClick={addItem} disabled={saving || !addProductId} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                      {saving ? 'Speichern...' : 'Hinzufügen'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Rechte Spalte: Neue Einstellung ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Neue Einstellung</h2>
              {!activeQuarter && <span className="text-xs text-amber-600">Kein aktives Quartal</span>}
            </div>

            {items.length === 0 ? (
              <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 flex flex-col items-center py-12 text-center">
                <p className="text-sm text-gray-400">Zuerst Standardartikel definieren</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {Object.entries(grouped).map(([cat, catItems], gi) => (
                  <div key={cat}>
                    {gi > 0 && <div className="border-t border-gray-100" />}
                    <div className="px-4 py-2 bg-gray-50">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{cat}</p>
                    </div>
                    {catItems.map(item => {
                      const p = item.products
                      const hasSizes = p && p.sizes.length > 0
                      const chosen = selectedSizes[item.product_id]
                      return (
                        <div key={item.id} className="px-4 py-3 border-t border-gray-50">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 text-sm truncate">{p?.name ?? '–'}</p>
                              <p className="text-xs text-gray-400">{item.quantity}× · {p?.article_number}</p>
                            </div>
                            {!hasSizes && (
                              <span className="flex items-center gap-1 text-xs text-green-600 flex-shrink-0 mt-0.5">
                                <Check className="w-3 h-3" /> Keine Größe
                              </span>
                            )}
                          </div>
                          {hasSizes && (() => {
                            const sizes = sortedSizes(p!.sizes)
                            const groups = groupSizes(sizes)
                            const isGrouped = groups !== null
                            const SizeBtn = ({ s }: { s: string }) => (
                              <button
                                key={s}
                                onClick={() => setSelectedSizes(prev => ({ ...prev, [item.product_id]: s }))}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                  chosen === s
                                    ? 'bg-blue-800 text-white border-blue-800'
                                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                                }`}
                              >
                                {sizeLabel(s, isGrouped)}
                              </button>
                            )
                            return isGrouped ? (
                              <div className="flex flex-col gap-1.5">
                                {groups!.map(g => (
                                  <div key={g.label}>
                                    <p className="text-xs text-gray-400 mb-1">{g.label}:</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {g.sizes.map(s => <SizeBtn key={s} s={s} />)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {sizes.map(s => <SizeBtn key={s} s={s} />)}
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })}
                  </div>
                ))}

                <div className="px-4 py-4 border-t border-gray-200 bg-gray-50">
                  {missingCount > 0 && (
                    <p className="text-xs text-amber-600 mb-3">
                      {missingCount} Artikel ohne Größe — bitte alle auswählen
                    </p>
                  )}
                  <button
                    onClick={addAllToCart}
                    disabled={!activeQuarter || !allSizesSelected || addingToCart || cartSuccess || items.length === 0}
                    className={`w-full flex items-center justify-center gap-2 font-medium py-3 rounded-xl text-sm transition-colors ${
                      cartSuccess
                        ? 'bg-green-600 text-white'
                        : 'bg-blue-800 hover:bg-blue-900 text-white disabled:bg-gray-200 disabled:text-gray-400'
                    }`}
                  >
                    {cartSuccess
                      ? <><Check className="w-4 h-4" /> In den Warenkorb gelegt</>
                      : addingToCart
                        ? 'Wird hinzugefügt...'
                        : <><ShoppingCart className="w-4 h-4" /> Alle in den Warenkorb</>
                    }
                  </button>
                  {cartError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-2">{cartError}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
