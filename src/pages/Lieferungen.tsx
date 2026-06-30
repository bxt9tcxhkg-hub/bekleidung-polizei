import { useEffect, useRef, useState } from 'react'
import { Upload, FileText, Check, ChevronDown, ChevronUp, Truck, Package, CheckSquare, Square, AlertCircle, Euro } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Order } from '../lib/types'

interface VorrechnungAnalysis {
  rechnungsnummer: string | null
  gesamtbetrag: number | null
  positionen: { artikelnummer: string; bezeichnung: string; menge: number; einzelpreis: number }[]
}

type DeliveryOrder = Order & {
  products?: { name: string; article_number: string; category: string; needs_tailoring: boolean }
}

interface Delivery {
  id: string
  created_at: string
  vorrechnung_url: string | null
  vorrechnung_name: string | null
  vorrechnung_number: string | null
  vorrechnung_amount: number | null
  vorrechnung_analysis: VorrechnungAnalysis | null
  paid: boolean
  paid_at: string | null
  status: 'ordered' | 'partially_received' | 'received'
  orders?: DeliveryOrder[]
}

export default function Lieferungen() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [checked, setChecked] = useState<Record<string, Set<string>>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingDeliveryId = useRef<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await (supabase.from('deliveries') as any)
      .select('*')
      .order('created_at', { ascending: false })
    const deliveryList = (data ?? []) as Delivery[]

    if (deliveryList.length > 0) {
      const ids = deliveryList.map(d => d.id)
      const { data: ordersData } = await (supabase.from('orders') as any)
        .select('*, products(name,article_number,category,needs_tailoring)')
        .in('delivery_id', ids)
      const ordersByDelivery: Record<string, DeliveryOrder[]> = {}
      ;(ordersData ?? []).forEach((o: any) => {
        if (!ordersByDelivery[o.delivery_id]) ordersByDelivery[o.delivery_id] = []
        ordersByDelivery[o.delivery_id].push(o)
      })
      deliveryList.forEach(d => { d.orders = ordersByDelivery[d.id] ?? [] })
    }

    setDeliveries(deliveryList)
    setExpanded(new Set(deliveryList.filter(d => d.status !== 'received').map(d => d.id)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleOrder(deliveryId: string, orderId: string) {
    setChecked(prev => {
      const set = new Set(prev[deliveryId] ?? [])
      set.has(orderId) ? set.delete(orderId) : set.add(orderId)
      return { ...prev, [deliveryId]: set }
    })
  }

  function toggleAll(delivery: Delivery) {
    const ids = delivery.orders?.map(o => o.id) ?? []
    const current = checked[delivery.id] ?? new Set()
    const allChecked = ids.every(id => current.has(id))
    setChecked(prev => ({ ...prev, [delivery.id]: allChecked ? new Set() : new Set(ids) }))
  }

  async function confirmReceived(delivery: Delivery) {
    const receivedIds = checked[delivery.id] ?? new Set()
    if (receivedIds.size === 0) return
    setSaving(delivery.id)

    const receivedOrders = delivery.orders?.filter(o => receivedIds.has(o.id)) ?? []
    await Promise.all(receivedOrders.map(o =>
      supabase.from('orders').update({
        status: (o as any).products?.needs_tailoring ? 'at_tailor' : 'ready_for_issue',
        updated_at: new Date().toISOString(),
      }).eq('id', o.id)
    ))

    const allReceived = delivery.orders?.every(o => receivedIds.has(o.id)) ?? false
    await (supabase.from('deliveries') as any)
      .update({ status: allReceived ? 'received' : 'partially_received' })
      .eq('id', delivery.id)

    setSaving(null)
    await load()
  }

  async function markAsPaid(deliveryId: string) {
    await (supabase.from('deliveries') as any)
      .update({ paid: true, paid_at: new Date().toISOString() })
      .eq('id', deliveryId)
    await load()
  }

  function triggerUpload(deliveryId: string) {
    pendingDeliveryId.current = deliveryId
    setUploadError('')
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !pendingDeliveryId.current) return
    const deliveryId = pendingDeliveryId.current
    e.target.value = ''

    if (file.size > 20 * 1024 * 1024) { setUploadError('Datei zu groß (max. 20 MB)'); return }

    setUploading(deliveryId)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', 'vorrechnungen')

    try {
      const res = await fetch('/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error()
      const { key, name, analysis } = await res.json()

      const update: Record<string, unknown> = { vorrechnung_url: `/files/${key}`, vorrechnung_name: name }
      if (analysis) {
        update.vorrechnung_analysis = analysis
        if (analysis.rechnungsnummer) update.vorrechnung_number = analysis.rechnungsnummer
        if (analysis.gesamtbetrag) update.vorrechnung_amount = analysis.gesamtbetrag
      }

      await (supabase.from('deliveries') as any).update(update).eq('id', deliveryId)
      await load()
    } catch {
      setUploadError('Upload fehlgeschlagen – bitte nochmals versuchen')
    }
    setUploading(null)
  }

  const STATUS_LABEL = { ordered: 'Ausstehend', partially_received: 'Teilweise erhalten', received: 'Vollständig erhalten' }
  const STATUS_COLOR = { ordered: 'bg-blue-50 text-blue-700', partially_received: 'bg-amber-50 text-amber-700', received: 'bg-green-50 text-green-700' }

  return (
    <div>
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />

      {uploadError && <div className="mb-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{uploadError}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : deliveries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-center">
          <Truck className="w-12 h-12 mb-3 text-gray-300" />
          <p className="font-semibold text-gray-500">Noch keine Lieferungen</p>
          <p className="text-sm text-gray-400 mt-1">Lieferungen entstehen beim Erstellen einer Sammelbestellung</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deliveries.map(d => {
            const isExpanded = expanded.has(d.id)
            const isSaving = saving === d.id
            const isUploading = uploading === d.id
            const date = new Date(d.created_at).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
            const orders = d.orders ?? []
            const checkedSet = checked[d.id] ?? new Set()
            const allChecked = orders.length > 0 && orders.every(o => checkedSet.has(o.id))
            const isDone = d.status === 'received'

            return (
              <div key={d.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">

                {/* Header */}
                <button onClick={() => toggleExpand(d.id)} className="w-full px-4 py-4 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">Lieferung vom {date}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[d.status]}`}>
                        {STATUS_LABEL[d.status]}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${d.paid ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                        <Euro className="w-3 h-3" />
                        {d.paid ? 'Bezahlt' : 'Offen'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{orders.length} Position{orders.length !== 1 ? 'en' : ''}</p>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>

                {isExpanded && (
                  <>
                    {/* Vorrechnung + Bezahlung */}
                    <div className="px-4 pb-4 border-t border-gray-50">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-3 mb-2">Vorrechnung & Bezahlung</p>

                      {!d.paid ? (
                        <div className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 mb-3">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <span className="text-sm text-red-700 font-medium">Zahlung ausstehend</span>
                            {d.vorrechnung_amount != null && (
                              <span className="text-sm text-red-600">— {d.vorrechnung_amount.toFixed(2)} €</span>
                            )}
                          </div>
                          <button onClick={() => markAsPaid(d.id)}
                            className="text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 ml-3">
                            Als bezahlt markieren
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 mb-3">
                          <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                          <span className="text-sm text-green-700 font-medium">
                            Bezahlt{d.paid_at ? ` am ${new Date(d.paid_at).toLocaleDateString('de-AT')}` : ''}
                          </span>
                          {d.vorrechnung_amount != null && (
                            <span className="text-sm text-green-600 ml-auto">{d.vorrechnung_amount.toFixed(2)} €</span>
                          )}
                        </div>
                      )}

                      {d.vorrechnung_url ? (
                        <div>
                          <a href={d.vorrechnung_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm text-blue-700 hover:underline">
                            <FileText className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{d.vorrechnung_name}</span>
                          </a>
                          {d.vorrechnung_number && (
                            <p className="text-xs text-gray-400 mt-0.5 ml-6">Rechnungsnr.: {d.vorrechnung_number}</p>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => triggerUpload(d.id)} disabled={isUploading}
                          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-blue-700 disabled:opacity-50 transition-colors">
                          <Upload className="w-4 h-4" />
                          {isUploading ? 'Wird hochgeladen & analysiert…' : 'PDF hochladen & analysieren'}
                        </button>
                      )}

                      {d.vorrechnung_analysis?.positionen && d.vorrechnung_analysis.positionen.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">KI-Analyse</p>
                          <div className="space-y-1">
                            {d.vorrechnung_analysis.positionen.map((p, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-1.5">
                                {p.artikelnummer && <span className="font-mono text-gray-400 flex-shrink-0">{p.artikelnummer}</span>}
                                <span className="flex-1 truncate text-gray-700">{p.bezeichnung}</span>
                                <span className="text-gray-500 flex-shrink-0">{p.menge}× · {p.einzelpreis?.toFixed(2)} €</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Wareneingang */}
                    <div className="border-t border-gray-100">
                      <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Wareneingang prüfen</p>
                        {!isDone && (
                          <button onClick={() => toggleAll(d)}
                            className="flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 font-medium">
                            {allChecked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                            {allChecked ? 'Alle abwählen' : 'Alle auswählen'}
                          </button>
                        )}
                      </div>
                      {orders.map(o => {
                        const isChecked = checkedSet.has(o.id)
                        const alreadyDone = isDone || o.status === 'ready_for_issue' || o.status === 'at_tailor' || o.status === 'issued'
                        return (
                          <div key={o.id}
                            onClick={() => !alreadyDone && toggleOrder(d.id, o.id)}
                            className={`px-4 py-3 border-t border-gray-50 flex items-center gap-3 ${!alreadyDone ? 'cursor-pointer hover:bg-gray-50' : ''}`}>
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              alreadyDone ? 'bg-green-500 border-green-500' : isChecked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
                            }`}>
                              {(isChecked || alreadyDone) && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <Package className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm truncate ${alreadyDone ? 'text-gray-400' : 'text-gray-800'}`}>
                                {(o as any).products?.name ?? '–'}
                              </p>
                              <p className="text-xs text-gray-400 font-mono">{(o as any).products?.article_number}</p>
                            </div>
                            <span className="text-xs text-gray-500 flex-shrink-0">Gr. {o.size} · {o.quantity}×</span>
                          </div>
                        )
                      })}
                    </div>

                    {/* Bestätigen */}
                    {!isDone && (
                      <div className="px-4 py-4 border-t border-gray-100 bg-gray-50">
                        <button
                          onClick={() => confirmReceived(d)}
                          disabled={checkedSet.size === 0 || isSaving}
                          className="w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-800 text-white font-medium py-2.5 rounded-xl text-sm disabled:bg-gray-200 disabled:text-gray-400 transition-colors">
                          <Check className="w-4 h-4" />
                          {isSaving ? 'Wird gespeichert…' : `${checkedSet.size} Position${checkedSet.size !== 1 ? 'en' : ''} als erhalten bestätigen`}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
