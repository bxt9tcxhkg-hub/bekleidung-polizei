import { useEffect, useState } from 'react'
import { PackageCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { POOL_EM_CATEGORY_LABELS, type PoolEmCategory } from '../../lib/poolEinsatzmittel'
import { FUELLLISTE_EM_CATEGORIES, vehicleToVerwahrungsort } from '../../lib/vehicleVerwahrung'
import type { FleetEquipmentItem, FleetEquipmentStatus, FleetEquipmentStatusValue, FleetVehicle, PoolEinsatzmittel } from '../../lib/types'

const TAP: { value: FleetEquipmentStatusValue; label: string }[] = [
  { value: 'vollstaendig', label: 'da' },
  { value: 'fehlend', label: 'fehlt' },
  { value: 'beschaedigt', label: 'defekt' },
]

type EmRow = { id: string; label: string; extra: string }

function tapClass(active: boolean, value: FleetEquipmentStatusValue) {
  if (!active) return 'border border-gray-300 text-gray-600 bg-white'
  if (value === 'vollstaendig') return 'bg-green-700 text-white border border-green-700'
  if (value === 'fehlend') return 'bg-red-700 text-white border border-red-700'
  return 'bg-amber-700 text-white border border-amber-700'
}

export default function Fuellliste({ vehicle }: { vehicle: FleetVehicle }) {
  const { profile } = useAuth()
  const [items, setItems] = useState<FleetEquipmentItem[]>([])
  const [status, setStatus] = useState<Record<string, FleetEquipmentStatusValue>>({})
  const [emRows, setEmRows] = useState<EmRow[]>([])
  const [emStatus, setEmStatus] = useState<Record<string, FleetEquipmentStatusValue>>({})
  const [error, setError] = useState('')

  const storageKey = `fuellliste-em:${vehicle.id}`

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [itemResult, statusResult] = await Promise.all([
        supabase.from('fleet_equipment_items').select('*').eq('vehicle_id', vehicle.id).eq('active', true).order('sort_order').order('name'),
        supabase.from('fleet_equipment_status').select('*').eq('vehicle_id', vehicle.id),
      ])
      if (cancelled) return
      const nextItems = (itemResult.data ?? []) as FleetEquipmentItem[]
      const nextStatus: Record<string, FleetEquipmentStatusValue> = {}
      for (const row of (statusResult.data ?? []) as FleetEquipmentStatus[]) nextStatus[row.item_id] = row.status
      setItems(nextItems)
      setStatus(nextStatus)

      const ort = vehicleToVerwahrungsort(vehicle)
      if (!ort) { setEmRows([]); return }
      const emResult = await supabase.from('pool_einsatzmittel').select('*').eq('verwahrungsort', ort).is('removed_at', null)
      if (cancelled) return
      const rows = ((emResult.data ?? []) as PoolEinsatzmittel[])
        .filter(row => FUELLLISTE_EM_CATEGORIES.includes(row.category as PoolEmCategory))
        .map(row => ({
          id: row.id,
          label: POOL_EM_CATEGORY_LABELS[row.category as PoolEmCategory] ?? row.category,
          extra: [row.art, row.typ, row.marke, row.anzahl != null ? `${row.anzahl}` : ''].filter(Boolean).join(' · '),
        }))
      setEmRows(rows)
      try {
        const raw = localStorage.getItem(storageKey)
        setEmStatus(raw ? JSON.parse(raw) as Record<string, FleetEquipmentStatusValue> : {})
      } catch {
        setEmStatus({})
      }
    }
    void load()
    return () => { cancelled = true }
  }, [vehicle.id, storageKey])

  async function setItem(item: FleetEquipmentItem, value: FleetEquipmentStatusValue) {
    if (!profile?.id) return
    setStatus(current => ({ ...current, [item.id]: value }))
    const { error: saveError } = await supabase.from('fleet_equipment_status').upsert({
      item_id: item.id,
      vehicle_id: vehicle.id,
      ist_menge: value === 'vollstaendig' ? item.soll_menge : null,
      status: value,
      note: null,
      checked_by: profile.id,
      checked_at: new Date().toISOString(),
    }, { onConflict: 'item_id' })
    if (saveError) setError('Zubehör konnte nicht gespeichert werden.')
    else setError('')
  }

  function setEm(id: string, value: FleetEquipmentStatusValue) {
    setEmStatus(current => {
      const next = { ...current, [id]: value }
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  if (!vehicle) return null

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <h2 className="font-bold text-gray-900 flex items-center gap-2">
        <PackageCheck className="w-4 h-4 text-blue-700" /> Bestand & Füllliste
      </h2>
      <p className="text-xs text-gray-500 mt-1">Ein Tipp pro Zeile. Zubehör vom Fahrzeugverantwortlichen, Einsatzmittel vom EM-Verantwortlichen.</p>
      {error ? <p className="text-sm text-red-700 mt-2">{error}</p> : null}

      <p className="text-xs font-semibold text-gray-500 mt-4 mb-2">Zubehör</p>
      {items.length === 0 ? <p className="text-sm text-gray-500">Keine Positionen am Wagen hinterlegt.</p> : (
        <ul className="space-y-2">{items.map(item => (
          <li key={item.id} className="rounded-xl border border-gray-200 p-3">
            <p className="text-sm font-medium text-gray-900">{item.name}{item.soll_menge ? ` · Soll ${item.soll_menge} ${item.unit}` : ''}</p>
            <div className="flex gap-2 mt-2">{TAP.map(btn => (
              <button key={btn.value} type="button" onClick={() => void setItem(item, btn.value)} className={`flex-1 text-sm font-semibold py-2 rounded-lg ${tapClass(status[item.id] === btn.value, btn.value)}`}>{btn.label}</button>
            ))}</div>
          </li>
        ))}</ul>
      )}

      <p className="text-xs font-semibold text-gray-500 mt-5 mb-2">Einsatzmittel im Wagen</p>
      {emRows.length === 0 ? <p className="text-sm text-gray-500">Keine Pool-Einsatzmittel auf diesem Wagen.</p> : (
        <ul className="space-y-2">{emRows.map(row => (
          <li key={row.id} className="rounded-xl border border-gray-200 p-3">
            <p className="text-sm font-medium text-gray-900">{row.label}</p>
            {row.extra ? <p className="text-xs text-gray-500">{row.extra}</p> : null}
            <div className="flex gap-2 mt-2">{TAP.map(btn => (
              <button key={btn.value} type="button" onClick={() => setEm(row.id, btn.value)} className={`flex-1 text-sm font-semibold py-2 rounded-lg ${tapClass(emStatus[row.id] === btn.value, btn.value)}`}>{btn.label}</button>
            ))}</div>
          </li>
        ))}</ul>
      )}
    </section>
  )
}
