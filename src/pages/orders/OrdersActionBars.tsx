import type { Dispatch, SetStateAction } from 'react'
import { X, Check, FileText, RotateCcw, Ban, Mail, Warehouse } from 'lucide-react'
import type { OrderStatus } from '../../lib/types'
import type { MassaOrderDraft, MassaSendResult } from '../../lib/massaOrder'
import type { AdminTab } from './types'

export interface OrdersActionBarsProps {
  activeTab: AdminTab
  selectedIds: Set<string>
  saving: boolean
  cancelModal: boolean
  cancelReason: string
  massaDraft: MassaOrderDraft | null
  massaResult: MassaSendResult | null
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
  setCancelModal: Dispatch<SetStateAction<boolean>>
  setCancelReason: Dispatch<SetStateAction<string>>
  setMassaDraft: Dispatch<SetStateAction<MassaOrderDraft | null>>
  setMassaResult: Dispatch<SetStateAction<MassaSendResult | null>>
  createSammelbestellung: () => Promise<void>
  readyFromStock: () => Promise<void>
  openMassaPreview: () => void
  confirmSupplierGoodsIn: () => Promise<void>
  stepBack: () => Promise<void>
  advanceSelected: (nextStatus: OrderStatus) => Promise<void>
  cancelSelected: () => Promise<void>
  downloadMassaCsv: (draft: MassaOrderDraft) => void
  confirmMassaSend: (draft: MassaOrderDraft) => void
}

export default function OrdersActionBars({
  activeTab,
  selectedIds,
  saving,
  cancelModal,
  cancelReason,
  massaDraft,
  massaResult,
  setSelectedIds,
  setCancelModal,
  setCancelReason,
  setMassaDraft,
  setMassaResult,
  createSammelbestellung,
  readyFromStock,
  openMassaPreview,
  confirmSupplierGoodsIn,
  stepBack,
  advanceSelected,
  cancelSelected,
  downloadMassaCsv,
  confirmMassaSend,
}: OrdersActionBarsProps) {
  return (
    <>
      {activeTab === 'eingereicht' && selectedIds.size > 0 && (
        <div className="fixed bottom-4 md:bottom-6 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 flex flex-wrap items-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl max-w-[calc(100vw-2rem)] md:max-w-none">
          <span className="text-sm font-medium">{selectedIds.size} Bestellung{selectedIds.size !== 1 ? 'en' : ''} ausgewählt</span>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={createSammelbestellung} disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm font-medium px-4 py-2 rounded-xl">
            <FileText className="w-4 h-4" />
            {saving ? 'Wird gespeichert...' : 'Sammelbestellung erstellen'}
          </button>
          <button onClick={readyFromStock} disabled={saving}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-sm font-medium px-4 py-2 rounded-xl">
            <Warehouse className="w-4 h-4" />
            Aus Lager bereitstellen
          </button>
          <button onClick={openMassaPreview} disabled={saving}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-sm font-medium px-4 py-2 rounded-xl">
            <Mail className="w-4 h-4" />
            Massa Wien
          </button>
          <button onClick={() => setCancelModal(true)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-sm font-medium px-3 py-2 rounded-xl">
            <Ban className="w-3.5 h-3.5" /> Stornieren
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-white/60 hover:text-white p-2 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
      )}

      {activeTab === 'lieferant' && selectedIds.size > 0 && (
        <div className="fixed bottom-4 md:bottom-6 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 flex flex-wrap items-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl max-w-[calc(100vw-2rem)] md:max-w-none">
          <span className="text-sm font-medium">{selectedIds.size} ausgewählt</span>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={confirmSupplierGoodsIn} disabled={saving}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-sm font-medium px-4 py-2 rounded-xl">
            <Check className="w-4 h-4" /> Wareneingang buchen
          </button>
          <button onClick={openMassaPreview} disabled={saving}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-sm font-medium px-4 py-2 rounded-xl">
            <Mail className="w-4 h-4" />
            Massa Wien
          </button>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={stepBack} disabled={saving}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm font-medium px-3 py-2 rounded-xl">
            <RotateCcw className="w-3.5 h-3.5" /> Rückgängig
          </button>
          <button onClick={() => setCancelModal(true)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-sm font-medium px-3 py-2 rounded-xl">
            <Ban className="w-3.5 h-3.5" /> Stornieren
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-white/60 hover:text-white p-2 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
      )}

      {activeTab === 'schneider' && selectedIds.size > 0 && (
        <div className="fixed bottom-4 md:bottom-6 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 flex flex-wrap items-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl max-w-[calc(100vw-2rem)] md:max-w-none">
          <span className="text-sm font-medium">{selectedIds.size} ausgewählt</span>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={() => advanceSelected('ready_for_issue')} disabled={saving}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-sm font-medium px-4 py-2 rounded-xl">
            <Check className="w-4 h-4" /> Bereit zur Ausgabe
          </button>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={stepBack} disabled={saving}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm font-medium px-3 py-2 rounded-xl">
            <RotateCcw className="w-3.5 h-3.5" /> Rückgängig
          </button>
          <button onClick={() => setCancelModal(true)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-sm font-medium px-3 py-2 rounded-xl">
            <Ban className="w-3.5 h-3.5" /> Stornieren
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-white/60 hover:text-white p-2 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
      )}

      {activeTab === 'ausgabe' && selectedIds.size > 0 && (
        <div className="fixed bottom-4 md:bottom-6 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 flex flex-wrap items-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl max-w-[calc(100vw-2rem)] md:max-w-none">
          <span className="text-sm font-medium">{selectedIds.size} ausgewählt</span>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={stepBack} disabled={saving}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm font-medium px-3 py-2 rounded-xl">
            <RotateCcw className="w-3.5 h-3.5" /> Rückgängig
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-white/60 hover:text-white p-2 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
      )}

      {activeTab === 'ausgegeben' && selectedIds.size > 0 && (
        <div className="fixed bottom-4 md:bottom-6 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 flex flex-wrap items-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl max-w-[calc(100vw-2rem)] md:max-w-none">
          <span className="text-sm font-medium">{selectedIds.size} ausgewählt</span>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={stepBack} disabled={saving}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm font-medium px-3 py-2 rounded-xl">
            <RotateCcw className="w-3.5 h-3.5" /> Rückgängig
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-white/60 hover:text-white p-2 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
      )}

      {activeTab === 'storniert' && selectedIds.size > 0 && (
        <div className="fixed bottom-4 md:bottom-6 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-40 flex flex-wrap items-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl max-w-[calc(100vw-2rem)] md:max-w-none">
          <span className="text-sm font-medium">{selectedIds.size} ausgewählt</span>
          <div className="w-px h-5 bg-white/20" />
          <button onClick={stepBack} disabled={saving}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm font-medium px-3 py-2 rounded-xl">
            <RotateCcw className="w-3.5 h-3.5" /> Wiederherstellen
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-white/60 hover:text-white p-2 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Cancel modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Bestellungen stornieren</h2>
            <p className="text-sm text-gray-500 mb-4">{selectedIds.size} Bestellung{selectedIds.size !== 1 ? 'en' : ''} werden storniert.</p>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Stornierungsgrund <span className="text-red-500">*</span></label>
            <textarea
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              rows={3}
              placeholder="Grund für die Stornierung..."
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setCancelModal(false); setCancelReason('') }}
                className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50">
                Abbrechen
              </button>
              <button onClick={cancelSelected} disabled={saving || !cancelReason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl">
                {saving ? 'Wird storniert...' : 'Stornieren'}
              </button>
            </div>
          </div>
        </div>
      )}

      {massaDraft && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Sammelbestellung Massa Wien</h2>
            <p className="text-sm text-gray-500 mb-4">
              Wird nur auf deine Bestätigung hin vorbereitet. Ohne hinterlegte Mail-Adresse kein Versand, nur Simulation.
            </p>
            <p className="text-xs font-semibold text-gray-500 mb-1">{massaDraft.subject}</p>
            <pre className="text-xs bg-gray-50 border border-gray-200 rounded-xl p-3 overflow-x-auto mb-4 whitespace-pre-wrap">{massaDraft.csv}</pre>
            {massaResult && (
              <p className="text-sm mb-3 font-medium text-green-700">
                {massaResult.mode === 'simulated'
                  ? 'Simulation: Es wurde keine E-Mail nach Wien gesendet.'
                  : 'mailto-Entwurf geöffnet. Bitte im Mailprogramm prüfen und erst dann senden.'}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => downloadMassaCsv(massaDraft)}
                className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50">
                CSV herunterladen
              </button>
              <button onClick={() => confirmMassaSend(massaDraft)}
                className="flex-1 bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium py-2.5 rounded-xl">
                {import.meta.env.VITE_MASSA_MAILTO ? 'mailto-Entwurf öffnen' : 'Simuliert senden'}
              </button>
              <button onClick={() => { setMassaDraft(null); setMassaResult(null) }}
                className="w-full border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50">
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
