import { Pencil, Trash2 } from 'lucide-react'
import type { ZentraleBaustelle } from '../../lib/types'

export function BaustellenList({ items, canOperate, onConfirm, onEdit, onClose, onDelete }: { items: ZentraleBaustelle[]; canOperate: boolean; onConfirm: (item: ZentraleBaustelle) => Promise<void>; onEdit: (item: ZentraleBaustelle) => void; onClose: (item: ZentraleBaustelle) => Promise<void>; onDelete: (item: ZentraleBaustelle) => Promise<void> }) {
  return <section><h2 className="font-bold text-gray-900 mb-3">Baustellen</h2><div className="space-y-2">{items.map(item => <div key={item.id} className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${item.status === 'gemeldet' ? 'border-gray-300 bg-gray-50' : 'border-orange-200 bg-orange-50'}`}>
    <div>
      <p className="font-semibold text-gray-900">{item.titel}{item.status === 'gemeldet' ? <span className="text-xs font-semibold text-gray-500 ml-2">ungeprüft</span> : null}</p>
      {item.note ? <p className="text-sm text-gray-600 mt-0.5">{item.note}</p> : null}
      {item.gueltig_bis ? <p className="text-xs text-gray-500 mt-0.5">Gültig bis {new Date(item.gueltig_bis).toLocaleDateString('de-AT')}</p> : null}
    </div>
    {canOperate ? <div className="flex gap-2">
      {item.status === 'gemeldet' ? <button type="button" onClick={() => void onConfirm(item)} className="text-xs font-medium text-green-700 border border-green-200 px-3 py-2 rounded-lg">Bestätigen</button> : null}
      <button type="button" onClick={() => onEdit(item)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Baustelle bearbeiten"><Pencil className="w-4 h-4" /></button>
      <button type="button" onClick={() => void onClose(item)} className="text-xs font-medium text-blue-700 border border-blue-200 px-3 py-2 rounded-lg">Erledigt</button>
      <button type="button" onClick={() => void onDelete(item)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Baustelle löschen"><Trash2 className="w-4 h-4" /></button>
    </div> : null}
  </div>)}</div></section>
}
