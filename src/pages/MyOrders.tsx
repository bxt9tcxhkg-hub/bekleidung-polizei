import { useCallback, useEffect, useState } from 'react'
import { Check, Package, Pencil, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../lib/types'
import { getCurrentBudget, getUsedBudget, DEFAULT_BUDGET } from '../lib/budget'
import { fmtEUR } from '../lib/format'
import { groupOrdersByQuarter, isUserOrderEditable, orderLineMengeLabel, type OrderListLine } from '../lib/orderList'

const CURRENT_YEAR = new Date().getFullYear()

export default function MyOrders() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState<OrderListLine[]>([])
  const [totalBudgetAmt, setTotalBudgetAmt] = useState(DEFAULT_BUDGET)
  const [usedBudget, setUsedBudget] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSize, setEditSize] = useState('')
  const [editQuantity, setEditQuantity] = useState('1')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!profile) return
    const [ordersRes, totalBud, used] = await Promise.all([
      supabase.from('orders')
        .select('*, products(name,category,needs_tailoring,sizes), quarters(name,year,quarter_num)')
        .eq('user_id', profile.id)
        .not('status', 'eq', 'pending')
        .order('created_at', { ascending: false }),
      getCurrentBudget(profile.id, CURRENT_YEAR),
      getUsedBudget(profile.id, CURRENT_YEAR),
    ])
    if (ordersRes.error) throw ordersRes.error
    setError('')
    setOrders((ordersRes.data ?? []) as OrderListLine[])
    setTotalBudgetAmt(totalBud)
    setUsedBudget(used)
  }, [profile])

  useEffect(() => {
    if (!profile) return
    setLoading(true)
    load()
      .catch(() => setError('Bestellungen konnten nicht geladen werden.'))
      .finally(() => setLoading(false))
  }, [profile, load])

  useEffect(() => {
    if (!profile) return
    const channel = supabase
      .channel(`sammelliste-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `user_id=eq.${profile.id}` },
        () => { load().catch(() => {}) },
      )
      .subscribe()
    const onFocus = () => { load().catch(() => {}) }
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      supabase.removeChannel(channel)
    }
  }, [profile, load])

  function startEditing(order: OrderListLine) {
    setError('')
    setNotice('')
    setEditingId(order.id)
    setEditSize(order.size)
    setEditQuantity(String(order.quantity))
  }

  function stopEditing() {
    setEditingId(null)
    setEditSize('')
    setEditQuantity('1')
  }

  async function saveEditing(order: OrderListLine) {
    const quantity = Number(editQuantity)
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError('Die Menge muss eine ganze Zahl größer als 0 sein.')
      return
    }
    if (!editSize || !(order.products?.sizes ?? []).includes(editSize)) {
      setError('Bitte eine gültige Größe auswählen.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')
    const { error: updateError } = await supabase.rpc('update_editable_order', {
      p_order_id: order.id,
      p_size: editSize,
      p_quantity: quantity,
    })
    setSaving(false)

    if (updateError) {
      setError(updateError.message.includes('bereits bestellt')
        ? 'Diese Bestellung wurde inzwischen durch den Sachbearbeiter bestellt und kann nicht mehr geändert werden.'
        : 'Die Bestellung konnte nicht geändert werden. Bitte erneut versuchen.')
      await load().catch(() => {})
      return
    }

    stopEditing()
    setNotice('Bestellung wurde aktualisiert.')
    await load()
  }

  const remaining = totalBudgetAmt - usedBudget
  const budgetPct = Math.min(100, (usedBudget / totalBudgetAmt) * 100)
  const groups = groupOrdersByQuarter(orders)

  return (
    <div>
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
      {notice && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div>}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Meine Bestellungen</h1>
        <p className="text-gray-500 text-sm mt-1">Sammelliste deiner eingereichten Artikel, nach Quartal</p>
        <p className="text-gray-400 text-xs mt-1">Größe und Menge können geändert werden, bis der Sachbearbeiter die Bestellung beim Lieferanten auslöst.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold text-gray-900">Jahresbudget {CURRENT_YEAR}</p>
          <p className="text-sm font-bold text-gray-700">{fmtEUR(usedBudget)} / {fmtEUR(totalBudgetAmt)}</p>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${budgetPct > 90 ? 'bg-red-500' : budgetPct > 70 ? 'bg-amber-400' : 'bg-green-500'}`}
            style={{ width: `${budgetPct}%` }} />
        </div>
        <p className={`text-sm mt-2 font-medium ${remaining <= 0 ? 'text-red-600' : 'text-gray-600'}`}>
          {remaining <= 0
            ? 'Budget aufgebraucht – weitere Bestellungen benötigen Genehmigung'
            : `${fmtEUR(remaining)} verbleibend`}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center py-16 text-center">
          <Package className="w-12 h-12 mb-3 text-gray-300" />
          <p className="font-semibold text-gray-500">Noch keine Bestellungen</p>
          <p className="text-sm text-gray-400 mt-1">Bestelle im Bekleidungskatalog</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.quarterId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
                <h2 className="font-semibold text-gray-900">{group.quarterName}</h2>
                <span className="text-xs text-gray-500">
                  {group.lines.length} {group.lines.length === 1 ? 'Position' : 'Positionen'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Name</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Größe</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Menge</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Status</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Aktion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {group.lines.map(o => {
                      const editable = isUserOrderEditable(o.status)
                      const isEditing = editingId === o.id
                      return (
                        <tr key={o.id} className={o.status === 'cancelled' ? 'opacity-70' : ''}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{o.products?.name ?? '–'}</p>
                            {o.products?.needs_tailoring && (
                              <p className="text-xs text-purple-600 mt-0.5">Wappenänderung</p>
                            )}
                            {o.cancel_reason && (
                              <p className="text-xs text-red-500 mt-0.5">Grund: {o.cancel_reason}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {isEditing ? (
                              <select value={editSize} onChange={e => setEditSize(e.target.value)} disabled={saving}
                                className="border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                {(o.products?.sizes ?? []).map(size => <option key={size} value={size}>{size}</option>)}
                              </select>
                            ) : o.size || '–'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                            {isEditing ? (
                              <input type="number" min="1" step="1" value={editQuantity}
                                onChange={e => setEditQuantity(e.target.value)} disabled={saving}
                                className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            ) : orderLineMengeLabel(o.quantity, o.quantity_issued, o.status)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ORDER_STATUS_COLORS[o.status]}`}>
                              {ORDER_STATUS_LABELS[o.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {isEditing ? (
                              <div className="inline-flex gap-1">
                                <button type="button" onClick={() => saveEditing(o)} disabled={saving}
                                  aria-label="Änderungen speichern" title="Speichern"
                                  className="p-2 rounded-lg text-green-700 hover:bg-green-50 disabled:opacity-50">
                                  <Check className="w-4 h-4" />
                                </button>
                                <button type="button" onClick={stopEditing} disabled={saving}
                                  aria-label="Bearbeitung abbrechen" title="Abbrechen"
                                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : editable ? (
                              <button type="button" onClick={() => startEditing(o)} disabled={editingId !== null}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 disabled:opacity-40">
                                <Pencil className="w-3.5 h-3.5" /> Bearbeiten
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">Gesperrt</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
