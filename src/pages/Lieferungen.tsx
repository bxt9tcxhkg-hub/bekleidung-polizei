import { useEffect, useRef, useState } from 'react'
import { Upload, FileText, Check, ChevronDown, ChevronUp, Truck, Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Order } from '../lib/types'

interface Delivery {
  id: string
  created_at: string
  vorrechnung_url: string | null
  vorrechnung_name: string | null
  vorrechnung_number: string | null
  vorrechnung_amount: number | null
  lieferschein_url: string | null
  lieferschein_name: string | null
  status: 'ordered' | 'partially_received' | 'received'
  orders?: (Order & { products?: { name: string; article_number: string; category: string; needs_tailoring: boolean } })[]
}

type UploadTarget = { deliveryId: string; type: 'vorrechnung' | 'lieferschein' }

export default function Lieferungen() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingUpload = useRef<UploadTarget | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('deliveries')
      .select('*')
      .order('created_at', { ascending: false })
    const deliveryList = (data ?? []) as Delivery[]

    // Load orders for each delivery
    if (deliveryList.length > 0) {
      const ids = deliveryList.map(d => d.id)
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, products(name,article_number,category,needs_tailoring)')
        .in('delivery_id', ids)
      const ordersByDelivery: Record<string, any[]> = {}
      ;(ordersData ?? []).forEach((o: any) => {
        if (!ordersByDelivery[o.delivery_id]) ordersByDelivery[o.delivery_id] = []
        ordersByDelivery[o.delivery_id].push(o)
      })
      deliveryList.forEach(d => { d.orders = ordersByDelivery[d.id] ?? [] })
    }

    setDeliveries(deliveryList)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function triggerUpload(deliveryId: string, type: 'vorrechnung' | 'lieferschein') {
    pendingUpload.current = { deliveryId, type }
    setUploadError('')
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !pendingUpload.current) return
    const { deliveryId, type } = pendingUpload.current
    e.target.value = ''

    if (file.size > 20 * 1024 * 1024) { setUploadError('Datei zu groß (max. 20 MB)'); return }

    setUploading(deliveryId)
    setUploadError('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', type === 'vorrechnung' ? 'vorrechnungen' : 'lieferscheine')

    try {
      const res = await fetch('/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload fehlgeschlagen')
      const { key, name } = await res.json()
      const fileUrl = `/files/${key}`

      const update = type === 'vorrechnung'
        ? { vorrechnung_url: fileUrl, vorrechnung_name: name }
        : { lieferschein_url: fileUrl, lieferschein_name: name }

      await (supabase.from('deliveries') as any).update(update).eq('id', deliveryId)
      await load()
    } catch {
      setUploadError('Upload fehlgeschlagen – bitte nochmals versuchen')
    }
    setUploading(null)
  }

  async function markReceived(delivery: Delivery) {
    if (!delivery.orders?.length) return
    const updates = delivery.orders.map(o =>
      supabase.from('orders').update({
        status: (o as any).products?.needs_tailoring ? 'at_tailor' : 'ready_for_issue',
        updated_at: new Date().toISOString(),
      }).eq('id', o.id)
    )
    await Promise.all(updates)
    await (supabase.from('deliveries') as any).update({ status: 'received' }).eq('id', delivery.id)
    await load()
  }

  const STATUS_LABEL = { ordered: 'Bestellt', partially_received: 'Teilweise erhalten', received: 'Erhalten' }
  const STATUS_COLOR = { ordered: 'bg-blue-50 text-blue-700', partially_received: 'bg-amber-50 text-amber-700', received: 'bg-green-50 text-green-700' }

  return (
    <div>
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileChange} />

      {uploadError && (
        <div className="mb-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{uploadError}</div>
      )}

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
            const isUploading = uploading === d.id
            const date = new Date(d.created_at).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
            const orderCount = d.orders?.length ?? 0

            return (
              <div key={d.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">Lieferung vom {date}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[d.status]}`}>
                        {STATUS_LABEL[d.status]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{orderCount} Bestellung{orderCount !== 1 ? 'en' : ''}</p>
                  </div>
                  <button onClick={() => toggleExpand(d.id)} className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0">
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </button>
                </div>

                {/* Documents row */}
                <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Vorrechnung */}
                  <div className="border border-gray-100 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Vorrechnung</p>
                    {d.vorrechnung_url ? (
                      <a href={d.vorrechnung_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-700 hover:underline">
                        <FileText className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{d.vorrechnung_name}</span>
                      </a>
                    ) : (
                      <button
                        onClick={() => triggerUpload(d.id, 'vorrechnung')}
                        disabled={isUploading}
                        className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-700 disabled:opacity-50 transition-colors"
                      >
                        <Upload className="w-4 h-4" />
                        {isUploading ? 'Wird hochgeladen...' : 'PDF hochladen'}
                      </button>
                    )}
                  </div>

                  {/* Lieferschein */}
                  <div className="border border-gray-100 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Lieferschein</p>
                    {d.lieferschein_url ? (
                      <div className="space-y-2">
                        <a href={d.lieferschein_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-700 hover:underline">
                          <FileText className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{d.lieferschein_name}</span>
                        </a>
                        {d.status !== 'received' && (
                          <button
                            onClick={() => markReceived(d)}
                            className="flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-800"
                          >
                            <Check className="w-3.5 h-3.5" /> Alle als erhalten markieren
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => triggerUpload(d.id, 'lieferschein')}
                        disabled={isUploading || !d.vorrechnung_url}
                        className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-700 disabled:opacity-40 transition-colors"
                        title={!d.vorrechnung_url ? 'Zuerst Vorrechnung hochladen' : ''}
                      >
                        <Upload className="w-4 h-4" />
                        {isUploading ? 'Wird hochgeladen...' : 'PDF hochladen'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded order list */}
                {isExpanded && d.orders && d.orders.length > 0 && (
                  <div className="border-t border-gray-100">
                    <div className="px-4 py-2 bg-gray-50">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bestellpositionen</p>
                    </div>
                    {d.orders.map((o: any) => (
                      <div key={o.id} className="px-4 py-2.5 border-t border-gray-50 flex items-center gap-3">
                        <Package className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">{o.products?.name ?? '–'}</p>
                          <p className="text-xs text-gray-400 font-mono">{o.products?.article_number}</p>
                        </div>
                        <span className="text-xs text-gray-500 flex-shrink-0">Gr. {o.size} · {o.quantity}×</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
