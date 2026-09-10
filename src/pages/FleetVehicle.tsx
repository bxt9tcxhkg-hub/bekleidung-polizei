import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, Bike, CalendarDays, Car, ClipboardCheck, PackageCheck, Pencil, Sparkles, Trash2, Wrench, X } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import PortalChrome from '../components/PortalChrome'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import type { FleetVehicle as FleetVehicleType, FleetVehicleKind } from '../lib/types'

const WORK_AREAS = [
  { title: 'Fahrzeugkontrolle', description: 'Checkliste vor Dienstbeginn und letzte Kontrollen.', icon: ClipboardCheck, tone: 'blue' },
  { title: 'Bestand & Füllliste', description: 'Sollbestand prüfen und Fehlmengen erfassen.', icon: PackageCheck, tone: 'blue' },
  { title: 'Offene Mängel', description: 'Fehlende, beschädigte oder abgelaufene Ausstattung.', icon: AlertTriangle, tone: 'amber' },
  { title: 'Reinigung & Pflege', description: 'Reinigung und offene Pflegeaufgaben.', icon: Sparkles, tone: 'emerald' },
  { title: 'Werkstatt & Termine', description: 'Wartungen und Reparaturen.', icon: Wrench, tone: 'slate' },
  { title: 'Fristen', description: 'Prüfungen und fahrzeugbezogene Termine.', icon: CalendarDays, tone: 'slate' },
] as const
const TONE = { blue: 'bg-blue-50 text-blue-700 border-blue-100', amber: 'bg-amber-50 text-amber-700 border-amber-100', emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100', slate: 'bg-slate-50 text-slate-700 border-slate-200' }
const inputClass = 'mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function FleetVehicle() {
  const { vehicleId } = useParams()
  const navigate = useNavigate()
  const { hasAreaAccess, isStrictAdmin, areaRoles } = useAuth()
  const roles = areaRoles?.find(row => row.area === 'fuhrpark')?.roles ?? []
  const canManage = isStrictAdmin || roles.includes('sachbearbeiter') || roles.includes('admin')
  const [vehicle, setVehicle] = useState<FleetVehicleType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<FleetVehicleKind>('Dienstfahrzeug')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [callSign, setCallSign] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    if (!vehicleId) return
    setLoading(true)
    const { data, error: loadError } = await supabase.from('fleet_vehicles').select('*').eq('id', vehicleId).eq('active', true).maybeSingle()
    setVehicle(loadError ? null : data as FleetVehicleType | null)
    setError(loadError ? 'Fahrzeug konnte nicht geladen werden.' : '')
    setLoading(false)
  }, [vehicleId])
  useEffect(() => { void load() }, [load])
  if (!hasAreaAccess('fuhrpark')) return <Navigate to="/" replace />

  function openEdit() {
    if (!vehicle) return
    setName(vehicle.name); setKind(vehicle.kind); setMake(vehicle.make ?? ''); setModel(vehicle.model ?? '')
    setCallSign(vehicle.call_sign ?? ''); setLicensePlate(vehicle.license_plate ?? ''); setNotes(vehicle.notes ?? '')
    setError(''); setShowEdit(true)
  }

  async function saveVehicle() {
    if (!vehicle || !name.trim()) { setError('Bitte eine Bezeichnung eingeben.'); return }
    setSaving(true)
    const { error: updateError } = await supabase.from('fleet_vehicles').update({
      name: name.trim(), kind, make: make.trim() || null, model: model.trim() || null,
      call_sign: callSign.trim() || null, license_plate: licensePlate.trim().toUpperCase() || null, notes: notes.trim() || null,
    }).eq('id', vehicle.id)
    setSaving(false)
    if (updateError) { setError(updateError.message.includes('duplicate') ? 'Rufname oder Kennzeichen ist bereits vergeben.' : 'Fahrzeug konnte nicht gespeichert werden.'); return }
    logAudit('Fahrzeug bearbeitet', name.trim())
    setShowEdit(false)
    await load()
  }

  async function deleteVehicle() {
    if (!vehicle || !window.confirm(`Fahrzeug „${vehicle.name}“ endgültig löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.`)) return
    setSaving(true)
    const { error: deleteError } = await supabase.from('fleet_vehicles').delete().eq('id', vehicle.id)
    setSaving(false)
    if (deleteError) { setError('Fahrzeug konnte nicht gelöscht werden.'); return }
    logAudit('Fahrzeug endgültig gelöscht', vehicle.name)
    navigate('/fuhrpark', { replace: true })
  }

  if (loading) return <PortalChrome><div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div></PortalChrome>
  if (!vehicle) return <PortalChrome><Link to="/fuhrpark" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 mb-6"><ArrowLeft className="w-4 h-4" /> Zur Fahrzeugübersicht</Link><div className="bg-white border border-gray-200 rounded-2xl p-8 text-center"><h1 className="text-xl font-bold text-gray-900">Fahrzeug nicht gefunden</h1></div></PortalChrome>

  const VehicleIcon = vehicle.kind === 'Motorrad' ? Bike : Car
  return <PortalChrome wide>
    <div className="flex items-center justify-between gap-3 mb-6"><Link to="/fuhrpark" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Zur Fahrzeugübersicht</Link>{canManage ? <button type="button" onClick={openEdit} className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-50"><Pencil className="w-4 h-4" /> Bearbeiten</button> : null}</div>
    {error && !showEdit ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden"><div className="p-5 sm:p-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-start gap-4"><div className="bg-blue-50 text-blue-700 p-3 rounded-xl w-fit"><VehicleIcon className="w-7 h-7" /></div><div className="flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{vehicle.kind}</p><h1 className="text-2xl font-bold text-gray-900 mt-1">{vehicle.name}</h1><p className="text-sm text-gray-500 mt-1">{vehicle.call_sign ?? 'Rufname noch offen'}</p></div></div><dl className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-gray-200"><div className="bg-white p-4"><dt className="text-xs text-gray-500">Hersteller</dt><dd className="font-semibold text-gray-900 mt-1">{vehicle.make ?? 'Noch offen'}</dd></div><div className="bg-white p-4"><dt className="text-xs text-gray-500">Modell</dt><dd className="font-semibold text-gray-900 mt-1">{vehicle.model ?? 'Noch offen'}</dd></div><div className="bg-white p-4"><dt className="text-xs text-gray-500">Kennzeichen</dt><dd className="font-semibold text-gray-900 mt-1">{vehicle.license_plate ?? 'Noch offen'}</dd></div></dl>{vehicle.notes ? <div className="p-4 border-t border-gray-200"><p className="text-xs text-gray-500">Bemerkungen</p><p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{vehicle.notes}</p></div> : null}</section>
    <section className="mt-6"><div className="mb-4"><h2 className="text-lg font-bold text-gray-900">Fahrzeugbezogene Bearbeitung</h2><p className="text-sm text-gray-500 mt-1">Die weiteren Funktionen werden schrittweise für dieses Fahrzeug freigeschaltet.</p></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{WORK_AREAS.map(({ title, description, icon: Icon, tone }) => <article key={title} className="rounded-2xl border border-gray-200 bg-white p-5 opacity-70"><div className={`w-fit p-2.5 rounded-xl border ${TONE[tone]}`}><Icon className="w-5 h-5" /></div><h3 className="font-semibold text-gray-900 mt-4">{title}</h3><p className="text-sm text-gray-500 mt-1">{description}</p><p className="text-xs font-medium text-gray-400 mt-4">Funktion in Planung</p></article>)}</div></section>
    {showEdit ? <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto"><div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b"><h2 className="font-bold text-gray-900">Fahrzeug bearbeiten</h2><button type="button" onClick={() => setShowEdit(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Schließen"><X className="w-4 h-4" /></button></div><div className="px-5 sm:px-6 py-4 space-y-4"><label className="block text-xs font-medium text-gray-600">Bezeichnung *<input className={inputClass} maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Fahrzeugart<select className={inputClass} value={kind} onChange={event => setKind(event.target.value as FleetVehicleKind)}><option>Dienstfahrzeug</option><option>Motorrad</option></select></label><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><label className="block text-xs font-medium text-gray-600">Hersteller<input className={inputClass} maxLength={60} value={make} onChange={event => setMake(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Modell<input className={inputClass} maxLength={60} value={model} onChange={event => setModel(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Rufname<input className={inputClass} maxLength={80} value={callSign} onChange={event => setCallSign(event.target.value)} /></label><label className="block text-xs font-medium text-gray-600">Kennzeichen<input className={inputClass} maxLength={20} value={licensePlate} onChange={event => setLicensePlate(event.target.value)} /></label></div><label className="block text-xs font-medium text-gray-600">Bemerkungen<textarea className={`${inputClass} min-h-24 resize-y`} maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} /></label>{error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}</div><div className="flex flex-wrap gap-3 px-5 sm:px-6 py-4 border-t"><button type="button" disabled={saving} onClick={() => { void deleteVehicle() }} className="mr-auto inline-flex items-center gap-2 text-red-700 text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-50 disabled:opacity-60"><Trash2 className="w-4 h-4" /> Endgültig löschen</button><button type="button" onClick={() => setShowEdit(false)} className="border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg">Abbrechen</button><button type="button" disabled={saving} onClick={() => { void saveVehicle() }} className="bg-blue-800 hover:bg-blue-900 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-lg">{saving ? 'Speichern…' : 'Speichern'}</button></div></div></div> : null}
  </PortalChrome>
}
