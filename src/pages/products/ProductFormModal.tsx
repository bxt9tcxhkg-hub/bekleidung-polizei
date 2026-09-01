import { type Dispatch, type SetStateAction } from 'react'
import { Plus, X } from 'lucide-react'
import { CATEGORIES_BY_ORG, GENDER_LABELS, SIZES_COMMON, SUB_CATEGORIES_BY_ORG, type ProductFormData } from './constants'

interface ProductFormModalProps {
  editId: string | null
  form: ProductFormData
  setForm: Dispatch<SetStateAction<ProductFormData>>
  saving: boolean
  error: string
  customSizeInput: string
  setCustomSizeInput: Dispatch<SetStateAction<string>>
  onToggleSize: (size: string) => void
  onAddCustomSize: () => void
  onSave: () => void
  onClose: () => void
}

export default function ProductFormModal({
  editId,
  form,
  setForm,
  saving,
  error,
  customSizeInput,
  setCustomSizeInput,
  onToggleSize,
  onAddCustomSize,
  onSave,
  onClose,
}: ProductFormModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-900">{editId ? 'Produkt bearbeiten' : 'Neues Produkt'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Artikelnummer *</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.article_number} onChange={e => setForm(f => ({ ...f, article_number: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kategorie</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value, sub_category: null }))}>
                {(CATEGORIES_BY_ORG[form.organisation ?? 'Stadtpolizei'] ?? CATEGORIES_BY_ORG['Stadtpolizei']).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Unterkategorie</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.sub_category ?? ''}
              onChange={e => setForm(f => ({ ...f, sub_category: e.target.value || null }))}>
              <option value="">–</option>
              {(SUB_CATEGORIES_BY_ORG[form.organisation ?? 'Stadtpolizei']?.[form.category] ?? []).map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Geschlecht</label>
            <div className="flex gap-2">
              {(['unisex', 'male', 'female'] as const).map(g => (
                <button key={g} type="button" onClick={() => setForm(f => ({ ...f, gender: g }))}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.gender === g ? (g === 'male' ? 'bg-blue-700 text-white border-blue-700' : g === 'female' ? 'bg-pink-600 text-white border-pink-600' : 'bg-gray-700 text-white border-gray-700') : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                  {GENDER_LABELS[g]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Organisation</label>
            <div className="flex gap-2">
              {(['Stadtpolizei', 'Parkaufsicht'] as const).map(org => (
                <button key={org} type="button"
                  onClick={() => setForm(f => ({ ...f, organisation: org, category: CATEGORIES_BY_ORG[org][0], sub_category: null }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.organisation === org ? (org === 'Parkaufsicht' ? 'bg-orange-600 text-white border-orange-600' : 'bg-blue-700 text-white border-blue-700') : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                  {org}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Preis (€)</label>
              <input type="number" step="0.01" min="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.price} onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Mindestbestand</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" checked={form.min_quantity > 0}
                  onChange={e => setForm(f => ({ ...f, min_quantity: e.target.checked ? 1 : 0 }))} />
                <span className="text-xs text-gray-600">Mindestbestand erforderlich</span>
              </label>
              {form.min_quantity > 0 && (
                <p className="text-xs text-blue-600 mt-1.5">Menge wird in der Lagerverwaltung festgelegt</p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Größen</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {SIZES_COMMON.map(s => (
                <button key={s} type="button" onClick={() => onToggleSize(s)} className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${form.sizes.includes(s) ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                  {s}
                </button>
              ))}
            </div>
            {form.sizes.filter(s => !SIZES_COMMON.includes(s)).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {form.sizes.filter(s => !SIZES_COMMON.includes(s)).map(s => (
                  <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-800 text-white rounded-lg text-xs font-medium">
                    {s}
                    <button type="button" onClick={() => onToggleSize(s)} className="hover:text-blue-200 ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Eigene Größe (z.B. 43, 36/32, One Size)..."
                value={customSizeInput}
                onChange={e => setCustomSizeInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAddCustomSize() } }}
              />
              <button type="button" onClick={onAddCustomSize}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg border border-gray-300 transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Größentabelle (URL, optional)</label>
            <input type="url" placeholder="https://..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.size_guide ?? ''} onChange={e => setForm(f => ({ ...f, size_guide: e.target.value || null }))} />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="tailoring" checked={form.needs_tailoring} onChange={e => setForm(f => ({ ...f, needs_tailoring: e.target.checked }))} className="rounded" />
            <label htmlFor="tailoring" className="text-sm text-gray-700">Benötigt Schneiderei</label>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="active" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="rounded" />
            <label htmlFor="active" className="text-sm text-gray-700">Aktiv</label>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t">
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
          <button onClick={onSave} disabled={saving} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-60">
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
