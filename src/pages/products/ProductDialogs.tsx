import { type ChangeEvent, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { X, Upload, Download, Info, Trash2 } from 'lucide-react'
import { fmtEUR } from '../../lib/format'
import { PRODUCT_CSV_TEMPLATE } from '../../lib/productImport'
import type { ConfirmDelete, OrgFilter, ProductFormData } from './constants'

interface ProductDialogsProps {
  showImport: boolean
  importOrg: 'Stadtpolizei' | 'Parkaufsicht'
  setImportOrg: Dispatch<SetStateAction<'Stadtpolizei' | 'Parkaufsicht'>>
  importRows: ProductFormData[]
  importError: string
  importing: boolean
  importDone: { ok: number; err: number } | null
  fileRef: RefObject<HTMLInputElement | null>
  onFile: (e: ChangeEvent<HTMLInputElement>) => void
  onRunImport: () => void
  onCloseImport: () => void
  sizeGuideModal: string | null
  onCloseSizeGuide: () => void
  confirmDelete: ConfirmDelete | null
  deleting: boolean
  filteredCount: number
  orgFilter: OrgFilter
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

export default function ProductDialogs({
  showImport,
  importOrg,
  setImportOrg,
  importRows,
  importError,
  importing,
  importDone,
  fileRef,
  onFile,
  onRunImport,
  onCloseImport,
  sizeGuideModal,
  onCloseSizeGuide,
  confirmDelete,
  deleting,
  filteredCount,
  orgFilter,
  onConfirmDelete,
  onCancelDelete,
}: ProductDialogsProps) {
  return (
    <>
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Produkte importieren</h2>
              <button onClick={onCloseImport} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Organisation der importierten Produkte</label>
                <div className="flex gap-2">
                  {(['Stadtpolizei', 'Parkaufsicht'] as const).map(org => (
                    <button key={org} type="button" onClick={() => setImportOrg(org)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${importOrg === org ? (org === 'Parkaufsicht' ? 'bg-orange-600 text-white border-orange-600' : 'bg-blue-700 text-white border-blue-700') : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                      {org}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600 space-y-1">
                <p className="font-semibold text-gray-700 text-xs mb-1">Unterstützte Formate: Excel (.xlsx, .xls) und CSV (.csv)</p>
                <p className="font-mono">Spalten: artikel_nr · name · kategorie · groessen · preis · schneider · grössentabelle</p>
                <p className="text-gray-400 mt-1">Größen mit | trennen (z.B. S|M|L|XL) · Geschlecht wird aus dem Namen erkannt (HR = Herren, DA = Damen)</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
                  <Upload className="w-4 h-4" /> Datei wählen
                </button>
                <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(PRODUCT_CSV_TEMPLATE)}`} download="produkte-vorlage.csv" className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
                  <Download className="w-4 h-4" /> Vorlage herunterladen
                </a>
                <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls,.ods" className="hidden" onChange={onFile} />
              </div>
              {importError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{importError}</p>}
              {importDone && (
                <p className={`text-sm px-3 py-2 rounded-lg ${importDone.err === 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                  {importDone.ok} Produkte importiert{importDone.err > 0 ? `, ${importDone.err} Fehler` : ''}.
                </p>
              )}
              {importRows.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">{importRows.length} Produkte erkannt – Vorschau:</p>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-gray-50 border-b"><th className="text-left px-3 py-2">Artikel-Nr.</th><th className="text-left px-3 py-2">Name</th><th className="text-left px-3 py-2">Kategorie</th><th className="text-left px-3 py-2">Geschlecht</th><th className="text-left px-3 py-2">Preis</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {importRows.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono">{r.article_number}</td>
                            <td className="px-3 py-2">{r.name}</td>
                            <td className="px-3 py-2">{r.category}</td>
                            <td className="px-3 py-2">
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${r.gender === 'male' ? 'bg-blue-100 text-blue-700' : r.gender === 'female' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'}`}>
                                {r.gender === 'male' ? 'HR' : r.gender === 'female' ? 'DA' : 'Unisex'}
                              </span>
                            </td>
                            <td className="px-3 py-2">{fmtEUR(r.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t">
              <button onClick={onCloseImport} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Schließen</button>
              {importRows.length > 0 && (
                <button onClick={onRunImport} disabled={importing} className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                  {importing ? 'Importiere...' : `${importRows.length} Produkte importieren`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {sizeGuideModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCloseSizeGuide}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Info className="w-4 h-4 text-blue-500" /> Größentabelle</h3>
              <button onClick={onCloseSizeGuide} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{sizeGuideModal.replace(/ \| /g, '\n')}</p>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Produkt{confirmDelete.mode === 'all' ? 'e' : ''} löschen</h3>
                <p className="text-sm text-gray-500">Diese Aktion kann nicht rückgängig gemacht werden.</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-6">
              {confirmDelete.mode === 'single'
                ? <>Soll <span className="font-semibold">{confirmDelete.product.name}</span> wirklich gelöscht werden?</>
                : <>Sollen wirklich <span className="font-semibold">alle {filteredCount} Produkte</span>{orgFilter !== 'all' ? ` (${orgFilter})` : ''} gelöscht werden?</>
              }
            </p>
            <div className="flex gap-3">
              <button onClick={onCancelDelete} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
              <button onClick={onConfirmDelete} disabled={deleting} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg text-sm disabled:opacity-60">
                {deleting ? 'Löschen...' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
