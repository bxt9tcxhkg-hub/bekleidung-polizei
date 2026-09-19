import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bike, Car, Download, FileText, Trash2, Upload } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from '../lib/audit'
import { canManageFuhrpark } from '../lib/fuhrpark'
import { canEditFleetEntry, useFleetVehicles, vehicleLabel } from '../lib/fleet'
import { supabase } from '../lib/supabase'
import type { FleetDocument } from '../lib/types'
import { Actions, Empty, Modal, inputClass } from './fleetShared'

// Fahrzeugübergreifende Sicht auf Dokumente (vormals ein Tab je Fahrzeug auf
// FleetVehicle.tsx). Upload/Download/Löschen laufen weiterhin über die
// bestehenden Cloudflare-Functions (/fleet-document-upload, /files/[key],
// /fleet-document-delete), die den Zugriff je Fahrzeug serverseitig prüfen.

const MAX_DOCUMENT_FILE_SIZE = 100_000_000

function formatDate(value: string | null) { return value ? new Date(value).toLocaleDateString('de-AT') : null }
function formatBytes(size: number | null) {
  if (size == null) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export default function FleetDokumente() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles } = useAuth()
  const canManage = canManageFuhrpark({ isStrictAdmin, isGenehmiger, rows: areaRoles })
  const { vehicles } = useFleetVehicles()
  const [searchParams, setSearchParams] = useSearchParams()
  const vehicleFilter = searchParams.get('vehicle') ?? ''
  const [documents, setDocuments] = useState<FleetDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [vehicleId, setVehicleId] = useState('')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('fleet_documents').select('*, uploader:profiles!fleet_documents_uploaded_by_fkey(id,name,dienstnummer), vehicle:fleet_vehicles!inner(id,name,kind,call_sign,license_plate,responsible_user_id,active)').eq('vehicle.active', true).order('created_at', { ascending: false })
    if (result.error) setError('Die Dokumente konnten nicht geladen werden.')
    else setError('')
    setDocuments((result.data ?? []) as unknown as FleetDocument[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => vehicleFilter ? documents.filter(doc => doc.vehicle_id === vehicleFilter) : documents, [documents, vehicleFilter])
  const assignableVehicles = useMemo(() => vehicles.filter(vehicle => canEditFleetEntry(canManage, profile?.id, vehicle.responsible_user_id)), [vehicles, canManage, profile?.id])
  if (!hasAreaAccess('fuhrpark')) return <Navigate to="/" replace />

  function openForm() { setVehicleId(vehicleFilter || assignableVehicles[0]?.id || ''); setTitle(''); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; setShowForm(true); setError('') }

  async function save() {
    if (!profile?.id || !vehicleId) { setError('Bitte ein Fahrzeug auswählen.'); return }
    if (!title.trim()) { setError('Bitte einen Titel angeben.'); return }
    if (!file) { setError('Bitte eine Datei auswählen.'); return }
    if (file.size > MAX_DOCUMENT_FILE_SIZE) { setError('Datei zu groß (max. 100 MB).'); return }
    setSaving(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const response = await fetch('/fleet-document-upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`,
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Size': String(file.size),
          'X-File-Name': encodeURIComponent(file.name),
          'X-Vehicle-Id': vehicleId,
        },
        body: file,
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(data?.error || 'Datei konnte nicht hochgeladen werden.')
      }
      const uploaded = await response.json() as { key: string; name: string; size: number; type: string }
      const { error: insertError } = await supabase.from('fleet_documents').insert({
        vehicle_id: vehicleId,
        title: title.trim(),
        file_key: uploaded.key,
        file_name: uploaded.name,
        mime_type: uploaded.type || null,
        file_size: uploaded.size,
        uploaded_by: profile.id,
      })
      if (insertError) throw insertError
      logAudit('Fahrzeugdokument hochgeladen', title.trim())
      setShowForm(false)
      setNotice('Dokument wurde gespeichert.')
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Dokument konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  async function openDocument(doc: FleetDocument) {
    const { data: sessionData } = await supabase.auth.getSession()
    try {
      const response = await fetch(`/files/${doc.file_key}`, { headers: { Authorization: `Bearer ${sessionData.session?.access_token ?? ''}` } })
      if (!response.ok) throw new Error()
      const blobUrl = URL.createObjectURL(await response.blob())
      window.open(blobUrl, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch {
      setError('Dokument konnte nicht geöffnet werden.')
    }
  }

  async function remove(doc: FleetDocument) {
    if (!window.confirm(`Dokument „${doc.title}“ endgültig löschen?`)) return
    const { data: sessionData } = await supabase.auth.getSession()
    const response = await fetch('/fleet-document-delete', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`, 'X-Document-Id': doc.id },
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: string } | null
      setError(data?.error || 'Dokument konnte nicht gelöscht werden.')
      return
    }
    logAudit('Fahrzeugdokument gelöscht', doc.title)
    setNotice('Dokument wurde gelöscht.')
    await load()
  }

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Fuhrpark</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Dokumente</h1><p className="text-sm text-gray-500 mt-1">Zulassung, Serviceheft und weitere fahrzeugbezogene Unterlagen, fahrzeugübergreifend.</p></div>{assignableVehicles.length > 0 ? <button type="button" onClick={openForm} className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium px-3 py-2 rounded-lg"><Upload className="w-4 h-4" /> Dokument</button> : null}</div>
    {error && !showForm ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    <label className="block text-xs font-medium text-gray-600 mb-4 max-w-xs">Fahrzeug<select className={inputClass} value={vehicleFilter} onChange={event => setSearchParams(event.target.value ? { vehicle: event.target.value } : {})}><option value="">Alle Fahrzeuge</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>)}</select></label>
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {visible.length === 0 ? <Empty text="Noch keine Dokumente hinterlegt." /> : <div className="divide-y divide-gray-100">{visible.map(doc => {
          const size = formatBytes(doc.file_size)
          const meta = [doc.uploader?.name, formatDate(doc.created_at), size].filter(Boolean).join(' · ')
          const VehicleIcon = doc.vehicle?.kind === 'Motorrad' ? Bike : Car
          const canEdit = canEditFleetEntry(canManage, profile?.id, doc.vehicle?.responsible_user_id)
          return <div key={doc.id} className="p-4 sm:p-5 flex items-center justify-between gap-3">
            <button type="button" onClick={() => void openDocument(doc)} className="flex items-center gap-3 min-w-0 text-left group">
              <span className="bg-gray-100 text-gray-600 p-2 rounded-lg flex-shrink-0"><FileText className="w-4 h-4" /></span>
              <span className="min-w-0">
                {doc.vehicle ? <Link to={`/fuhrpark/${doc.vehicle_id}`} onClick={event => event.stopPropagation()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline"><VehicleIcon className="w-3.5 h-3.5" /> {vehicleLabel(doc.vehicle)}</Link> : null}
                <span className="block text-sm font-medium text-gray-900 group-hover:text-blue-700 truncate mt-0.5">{doc.title}</span>{meta ? <span className="block text-xs text-gray-500 mt-0.5 truncate">{meta}</span> : null}
              </span>
            </button>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button type="button" onClick={() => void openDocument(doc)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" aria-label="Dokument öffnen"><Download className="w-4 h-4" /></button>
              {canEdit ? <button type="button" onClick={() => void remove(doc)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Dokument löschen"><Trash2 className="w-4 h-4" /></button> : null}
            </div>
          </div>
        })}</div>}
      </section>
    )}
    {showForm ? <Modal title="Dokument hochladen" close={() => setShowForm(false)}>
      <label className="block text-xs font-medium text-gray-600">Fahrzeug *<select className={inputClass} value={vehicleId} onChange={event => setVehicleId(event.target.value)}><option value="">Bitte wählen</option>{assignableVehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>)}</select></label>
      <label className="block text-xs font-medium text-gray-600">Titel *<input className={inputClass} maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder="z. B. Zulassungsschein" /></label>
      <label className="block text-xs font-medium text-gray-600">Datei * (PDF, Word, JPG oder PNG, max. 100 MB)<input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className={inputClass} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
      {error ? <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p> : null}
      <Actions saving={saving} close={() => setShowForm(false)} save={save} label="Hochladen" />
    </Modal> : null}
  </div>
}
