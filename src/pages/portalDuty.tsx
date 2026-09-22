import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Car, Clock3, Sparkles, UserRoundCheck, Wrench, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { operationalToday } from '../lib/zentraleShared'
import type { DutyAssignment, DutyFunction, DutyFunctionConfig, DutyShift, FleetVehicle } from '../lib/types'

const DEFAULT_DUTY_LABEL: Record<string, string> = {
  zentrale: 'Zentrale',
  innendienst: 'Innendienst',
  jd: 'Journaldienst (JD)',
  vd: 'Verkehrsdienst (VD)',
}

const DUTY_PROMPT_DISMISS_PREFIX = 'dornbirn-portal-duty-prompt-dismissed'
function dutyPromptDismissedToday(userId: string): boolean {
  try { return localStorage.getItem(`${DUTY_PROMPT_DISMISS_PREFIX}:${userId}`) === operationalToday() } catch { return false }
}
function dismissDutyPromptToday(userId: string): void {
  try { localStorage.setItem(`${DUTY_PROMPT_DISMISS_PREFIX}:${userId}`, operationalToday()) } catch { /* ignore */ }
}

export function TodayFunctionCard({ userId, canManage }: { userId: string; canManage: boolean }) {
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()
  const [allAssignments, setAllAssignments] = useState<DutyAssignment[]>([])
  const [functions, setFunctions] = useState<DutyFunctionConfig[]>([])
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [shift, setShift] = useState<DutyShift>('tag')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [managing, setManaging] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newPatrol, setNewPatrol] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [promptChecked, setPromptChecked] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [shiftInitialized, setShiftInitialized] = useState(false)

  const load = useCallback(async () => {
    const [dutyResult, functionResult, vehicleResult] = await Promise.all([
      supabase.from('duty_assignments').select('*').eq('duty_date', operationalToday()),
      supabase.from('duty_functions').select('*').order('sort_order').order('label'),
      supabase.from('fleet_vehicles').select('*').eq('active', true).order('name'),
    ])
    setAllAssignments((dutyResult.data ?? []) as DutyAssignment[])
    setFunctions((functionResult.data ?? []) as DutyFunctionConfig[])
    setVehicles((vehicleResult.data ?? []) as FleetVehicle[])
    setLoaded(true)
  }, [])
  useEffect(() => { void load() }, [load])

  const ownAssignments = useMemo(() => allAssignments.filter(item => item.user_id === userId), [allAssignments, userId])
  const selected = ownAssignments.find(item => item.shift === shift)

  // Die Schichtauswahl soll die tatsächlich gespeicherte Zuteilung
  // widerspiegeln - ohne das würde die Anzeige nach jedem Neuladen/
  // Neumounten (z. B. durch die navigate() in choose()) wieder auf den
  // hartkodierten Default "Tagdienst" zurückspringen, obwohl eine
  // Nachtdienst-Zuteilung gespeichert ist.
  useEffect(() => {
    if (!loaded || shiftInitialized) return
    if (ownAssignments.length > 0 && !ownAssignments.some(item => item.shift === 'tag') && ownAssignments.some(item => item.shift === 'nacht')) setShift('nacht')
    setShiftInitialized(true)
  }, [loaded, ownAssignments, shiftInitialized])
  const selectedConfig = functions.find(item => item.code === selected?.function)
  useEffect(() => { setVehicleId(selected?.vehicle_id ?? '') }, [selected?.vehicle_id])

  useEffect(() => {
    if (promptChecked || functions.length === 0) return
    setPromptChecked(true)
    if (ownAssignments.length === 0 && !dutyPromptDismissedToday(userId)) setPickerOpen(true)
  }, [functions.length, ownAssignments.length, promptChecked, userId])

  function occupancy(code: string) {
    const config = functions.find(item => item.code === code)
    return { count: allAssignments.filter(item => item.function === code && item.shift === shift).length, capacity: config?.standard_staffing ?? null }
  }

  async function choose(code: DutyFunction) {
    setSaving(true)
    const config = functions.find(item => item.code === code)
    let chosenVehicleId = vehicleId || null
    if (config?.is_patrol && !chosenVehicleId) {
      const { data: suggested } = await supabase.rpc('suggest_duty_vehicle', { p_function: code })
      chosenVehicleId = suggested ?? null
    }
    const { error } = await supabase.from('duty_assignments').upsert({ user_id: userId, duty_date: operationalToday(), shift, function: code, vehicle_id: config?.is_patrol ? chosenVehicleId : null }, { onConflict: 'user_id,duty_date,shift' })
    setSaving(false)
    if (error) { setMessage('Die Funktion konnte nicht gespeichert werden.'); return }
    setMessage(`${config?.label ?? DEFAULT_DUTY_LABEL[code] ?? code} wurde für heute eingetragen.`)
    setPickerOpen(false)
    await load()
    await refreshProfile()
    if (code === 'zentrale') navigate('/zentrale')
    else if (code === 'innendienst') navigate('/innendienst')
    else if (config?.is_patrol || code === 'jd' || code === 'vd') navigate('/aussendienst')
  }
  function notOperational() { dismissDutyPromptToday(userId); setPickerOpen(false) }
  async function remove() {
    if (!selected) return
    setSaving(true); const { error } = await supabase.from('duty_assignments').delete().eq('id', selected.id); setSaving(false)
    if (error) { setMessage('Die Auswahl konnte nicht entfernt werden.'); return }
    setMessage('Die Auswahl wurde entfernt. Das Portal bleibt normal nutzbar.'); await load(); await refreshProfile()
  }
  async function setVehicle(id: string) {
    setVehicleId(id)
    if (!selected) return
    setSaving(true); const { error } = await supabase.from('duty_assignments').update({ vehicle_id: id || null }).eq('id', selected.id); setSaving(false)
    if (error) { setMessage('Das Fahrzeug konnte nicht gespeichert werden.'); return }
    await load()
  }
  async function addFunction() {
    const label = newLabel.trim(); if (!label) return
    const code = `${label.toLocaleLowerCase('de-AT').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}_${Date.now().toString().slice(-5)}`
    const { error } = await supabase.from('duty_functions').insert({ code, label, is_patrol: newPatrol, sort_order: functions.length * 10 + 10 })
    if (error) { setMessage('Der Dienst konnte nicht angelegt werden.'); return }
    setNewLabel(''); setNewPatrol(false); await load()
  }
  async function deleteFunction(item: DutyFunctionConfig) {
    if (item.code === 'zentrale') { setMessage('Der Grunddienst Zentrale kann nicht gelöscht werden.'); return }
    if (!window.confirm(`Dienst „${item.label}“ endgültig löschen? Historische Einteilungen bleiben erhalten.`)) return
    const { error } = await supabase.from('duty_functions').delete().eq('code', item.code)
    if (error) { setMessage('Der Dienst konnte nicht gelöscht werden.'); return }
    await load()
  }

  return <>
    <section className="rounded-2xl border border-blue-200 bg-white p-4 sm:p-5 mb-6 shadow-sm"><div className="flex items-start gap-3"><div className="bg-blue-50 p-2.5 rounded-xl"><UserRoundCheck className="w-5 h-5 text-blue-700" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold text-gray-900">Heutige Funktion</h2><p className="text-sm text-gray-500 mt-0.5">{selected ? `${selectedConfig?.label ?? selected.function} · ${shift === 'tag' ? 'Tagdienst' : 'Nachtdienst'}` : 'Noch nicht ausgewählt – freiwillig für passende Informationen und Aufträge.'}</p></div><div className="flex flex-wrap items-center gap-2"><select className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs" value={shift} onChange={event => setShift(event.target.value as DutyShift)} aria-label="Schicht"><option value="tag">Tagdienst</option><option value="nacht">Nachtdienst</option></select><button type="button" onClick={() => setPickerOpen(true)} className="text-sm font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full">{selected ? 'Wechseln' : 'Funktion wählen'}</button>{selected ? <button type="button" disabled={saving} onClick={() => void remove()} className="text-xs font-semibold text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg">Dienst beenden</button> : null}{canManage ? <button type="button" onClick={() => setManaging(value => !value)} className="text-xs font-semibold text-gray-600 border border-gray-300 px-2.5 py-1.5 rounded-lg">Dienste verwalten</button> : null}</div></div>{selectedConfig?.is_patrol ? <div className="mt-3"><p className="text-xs font-medium text-gray-500 mb-1">Fahrzeug</p><select className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" value={vehicleId} onChange={event => void setVehicle(event.target.value)} aria-label="Streifenfahrzeug"><option value="">Kein Fahrzeug zugewiesen</option>{vehicles.filter(vehicle => vehicle.operational_status === 'verfuegbar' || vehicle.id === vehicleId).map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.call_sign || vehicle.name}{vehicle.license_plate ? ` · ${vehicle.license_plate}` : ''}{vehicle.operational_status !== 'verfuegbar' ? ' · derzeit nicht verfügbar' : ''}</option>)}</select><p className="text-[11px] text-gray-500 mt-1">Bei JD wird automatisch das erste verfügbare Standardfahrzeug vorgeschlagen. Die Auswahl kann für diesen Dienst jederzeit geändert werden.</p></div> : null}{managing ? <div className="mt-4 border-t border-gray-200 pt-4"><div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2"><input className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Neuer Dienst" value={newLabel} onChange={event => setNewLabel(event.target.value)} /><label className="flex items-center gap-2 text-sm border border-gray-200 rounded-lg px-3 py-2"><input type="checkbox" checked={newPatrol} onChange={event => setNewPatrol(event.target.checked)} /> Streife</label><button type="button" onClick={() => void addFunction()} className="bg-gray-900 text-white text-sm font-medium px-3 py-2 rounded-lg">Anlegen</button></div><div className="flex flex-wrap gap-2 mt-3">{functions.map(item => <span key={item.code} className="inline-flex items-center gap-2 bg-gray-100 text-sm px-3 py-1.5 rounded-full">{item.label}{item.is_patrol ? ' · Streife' : ''}{item.code === 'zentrale' ? <span className="text-xs text-gray-500">Grunddienst</span> : <button type="button" onClick={() => void deleteFunction(item)} className="text-red-600" aria-label={`${item.label} löschen`}>×</button>}</span>)}</div></div> : null}{message ? <p className={`text-sm mt-3 ${message.includes('konnte nicht') ? 'text-red-700' : 'text-green-700'}`}>{message}</p> : null}</div></div></section>
    {pickerOpen ? <DutyPickerModal functions={functions.filter(item => item.active)} occupancy={occupancy} saving={saving} onChoose={code => void choose(code)} onNotOperational={notOperational} onClose={() => setPickerOpen(false)} /> : null}
  </>
}

function DutyPickerModal({ functions, occupancy, saving, onChoose, onNotOperational, onClose }: { functions: DutyFunctionConfig[]; occupancy: (code: string) => { count: number; capacity: number | null }; saving: boolean; onChoose: (code: DutyFunction) => void; onNotOperational: () => void; onClose: () => void }) {
  return <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
      <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b">
        <div><h2 className="font-bold text-gray-900">Welche Funktion hast du heute?</h2><p className="text-xs text-gray-500 mt-0.5">Freiwillige Auswahl – bereits besetzte Funktionen werden angezeigt, aber nicht blockiert.</p></div>
        <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button>
      </div>
      <div className="px-5 py-4 space-y-2">
        {functions.map(fn => {
          const { count, capacity } = occupancy(fn.code)
          return <button key={fn.code} type="button" disabled={saving} onClick={() => onChoose(fn.code)} className="w-full flex items-center justify-between gap-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 px-4 py-3 text-left disabled:opacity-60">
            <span className="font-medium text-gray-900">{fn.label}</span>
            <span className="text-xs text-gray-500 whitespace-nowrap">{capacity !== null ? `${count} von ${capacity} Plätzen besetzt` : `${count} eingetragen`}</span>
          </button>
        })}
        <button type="button" onClick={onNotOperational} className="w-full rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 mt-2">Heute nicht operativ</button>
      </div>
    </div>
  </div>
}

type VehicleOpenCounts = { maengel: number; pflege: number; werkstatt: number; fristen: number }

export function MyVehicleCard({ userId }: { userId: string }) {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [counts, setCounts] = useState<Record<string, VehicleOpenCounts>>({})
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: vehicleData } = await supabase.from('fleet_vehicles').select('*').eq('responsible_user_id', userId).eq('active', true).order('name')
      const ownVehicles = (vehicleData ?? []) as FleetVehicle[]
      if (cancelled) return
      setVehicles(ownVehicles)
      const ids = ownVehicles.map(vehicle => vehicle.id)
      if (ids.length === 0) { setCounts({}); setLoading(false); return }
      const [statusResult, careResult, appointmentResult] = await Promise.all([
        supabase.from('fleet_equipment_status').select('vehicle_id').in('vehicle_id', ids).neq('status', 'vollstaendig'),
        supabase.from('fleet_care_tasks').select('vehicle_id').in('vehicle_id', ids).eq('status', 'offen'),
        supabase.from('fleet_appointments').select('vehicle_id, category').in('vehicle_id', ids).eq('status', 'offen'),
      ])
      if (cancelled) return
      const next: Record<string, VehicleOpenCounts> = Object.fromEntries(ids.map(id => [id, { maengel: 0, pflege: 0, werkstatt: 0, fristen: 0 }]))
      for (const row of statusResult.data ?? []) next[row.vehicle_id].maengel += 1
      for (const row of careResult.data ?? []) next[row.vehicle_id].pflege += 1
      for (const row of appointmentResult.data ?? []) { if (row.category === 'werkstatt') next[row.vehicle_id].werkstatt += 1; else next[row.vehicle_id].fristen += 1 }
      setCounts(next)
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [userId])
  if (loading || vehicles.length === 0) return null
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 mb-6"><div className="flex items-center gap-2 mb-3"><Car className="w-5 h-5 text-blue-700" /><h2 className="font-bold text-gray-900">{vehicles.length === 1 ? 'Mein Fahrzeug' : 'Meine Fahrzeuge'}</h2></div><div className="space-y-3">{vehicles.map(vehicle => {
    const count = counts[vehicle.id] ?? { maengel: 0, pflege: 0, werkstatt: 0, fristen: 0 }
    const total = count.maengel + count.pflege + count.werkstatt + count.fristen
    return <Link key={vehicle.id} to={`/fuhrpark/${vehicle.id}`} className="block rounded-xl border border-gray-200 p-3 hover:border-blue-300 hover:bg-blue-50/50 transition-colors">
      <div className="flex items-center justify-between gap-3"><p className="font-semibold text-gray-900">{vehicle.call_sign || vehicle.name}</p>{total === 0 ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">Alles erledigt</span> : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{total} offen</span>}</div>
      {total > 0 ? <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-600">
        {count.maengel > 0 ? <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-red-600" /> {count.maengel} Mangel{count.maengel === 1 ? '' : 'e'}</span> : null}
        {count.pflege > 0 ? <span className="inline-flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-emerald-600" /> {count.pflege} Pflegeaufgabe{count.pflege === 1 ? '' : 'n'}</span> : null}
        {count.werkstatt > 0 ? <span className="inline-flex items-center gap-1"><Wrench className="w-3.5 h-3.5 text-gray-500" /> {count.werkstatt} Werkstatt-Termin{count.werkstatt === 1 ? '' : 'e'}</span> : null}
        {count.fristen > 0 ? <span className="inline-flex items-center gap-1"><Clock3 className="w-3.5 h-3.5 text-gray-500" /> {count.fristen} Frist{count.fristen === 1 ? '' : 'en'}</span> : null}
      </div> : null}
    </Link>
  })}</div></section>
}
