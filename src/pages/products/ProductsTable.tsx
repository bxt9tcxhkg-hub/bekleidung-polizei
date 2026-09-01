import { Pencil, X, Check, Info, Trash2 } from 'lucide-react'
import { fmtEUR } from '../../lib/format'
import type { Product } from '../../lib/types'
import { GENDER_LABELS } from './constants'

function Badge({ active }: { active: boolean }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {active ? 'Aktiv' : 'Inaktiv'}
    </span>
  )
}

interface ProductsTableProps {
  products: Product[]
  isSachbearbeiter: boolean
  onEdit: (product: Product) => void
  onToggleActive: (product: Product) => void
  onDelete: (product: Product) => void
  onShowSizeGuide: (guide: string) => void
}

export default function ProductsTable({
  products,
  isSachbearbeiter,
  onEdit,
  onToggleActive,
  onDelete,
  onShowSizeGuide,
}: ProductsTableProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Artikel-Nr.</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Kategorie</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Organisation</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Geschlecht</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Preis</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Schneider</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
            {isSachbearbeiter && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {products.length === 0 ? (
            <tr><td colSpan={isSachbearbeiter ? 9 : 8} className="text-center py-10 text-gray-400">Keine Produkte gefunden</td></tr>
          ) : products.map(p => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-mono text-xs text-gray-600 hidden sm:table-cell">{p.article_number}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-400 font-mono sm:hidden">{p.article_number}</p>
              </td>
              <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{p.category}</td>
              <td className="px-4 py-3 hidden lg:table-cell">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.organisation === 'Parkaufsicht' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                  {p.organisation ?? 'Stadtpolizei'}
                </span>
              </td>
              <td className="px-4 py-3 hidden lg:table-cell">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.gender === 'male' ? 'bg-blue-100 text-blue-700' : p.gender === 'female' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'}`}>
                  {GENDER_LABELS[p.gender ?? 'unisex']}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                <span>{fmtEUR(Number(p.price))}</span>
                {p.size_guide && (
                  <button onClick={() => onShowSizeGuide(p.size_guide!)} title="Größentabelle anzeigen" className="ml-1.5 inline-flex text-blue-500 hover:text-blue-700">
                    <Info className="w-3.5 h-3.5" />
                  </button>
                )}
              </td>
              <td className="px-4 py-3 hidden lg:table-cell">
                {p.needs_tailoring ? <Check className="w-4 h-4 text-green-600" /> : <span className="text-gray-300">–</span>}
              </td>
              <td className="px-4 py-3"><Badge active={p.active} /></td>
              {isSachbearbeiter && (
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => onEdit(p)} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-900">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onToggleActive(p)} className={`p-1.5 rounded-md text-xs font-medium ${p.active ? 'hover:bg-orange-50 text-orange-500' : 'hover:bg-green-50 text-green-600'}`}>
                      {p.active ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => onDelete(p)} className="p-1.5 hover:bg-red-50 rounded-md text-red-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
