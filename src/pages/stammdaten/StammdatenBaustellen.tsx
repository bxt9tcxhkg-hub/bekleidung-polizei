import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import BackLink from '../../components/BackLink'
import { useAuth } from '../../contexts/AuthContext'
import { logAudit } from '../../lib/audit'
import { supabase } from '../../lib/supabase'
import { geocodeLocation, routeAlongRoad } from '../../lib/geocode'
import { Empty } from '../../components/ZentraleEntryEditor'
import { BaustellenList } from '../zentrale/BaustellenList'
import { BaustelleModal } from '../zentrale/BaustelleModal'
import { EMPTY_BAUSTELLE_FORM, type BaustelleFormState } from '../../lib/zentraleShared'
import type { ZentraleBaustelle } from '../../lib/types'
import { useOwnOperativBereicheToday } from '../../lib/dutyAccess'

// Baustellen sind für die Streife maximal als Streckeninfo relevant, nie
// dringend genug für "Sofort wichtig" oder die Zentrale-Übersicht selbst -
// keine Zentrale-Aufgabe, deshalb bei den Stammdaten statt in der Zentrale.

export default function StammdatenBaustellen() {
  const { profile, hasAreaAccess, isStrictAdmin, isGenehmiger, areaRoles, isZentralistOnDuty } = useAuth()
  const { bereiche: eigeneBereicheHeute } = useOwnOperativBereicheToday(profile?.id)
  const roles = areaRoles?.find(row => row.area === 'zentrale')?.roles ?? []
  const canManage = isStrictAdmin || isGenehmiger || roles.some(role => ['sachbearbeiter', 'admin'].includes(role))
  const canOperate = canManage || isZentralistOnDuty
  const [items, setItems] = useState<ZentraleBaustelle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ZentraleBaustelle | null>(null)
  const [form, setForm] = useState<BaustelleFormState>(EMPTY_BAUSTELLE_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [locating, setLocating] = useState<'start' | 'end' | null>(null)
  const [routing, setRouting] = useState(false)
  const routeRequestRef = useRef(0)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('zentrale_baustellen').select('*').neq('status', 'erledigt').order('created_at', { ascending: false })
    if (result.error) setError('Die Baustellen konnten nicht geladen werden.')
    else setError('')
    setItems((result.data ?? []) as ZentraleBaustelle[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const { startLat, startLng, endLat, endLng } = form
    if (startLat === null || startLng === null || endLat === null || endLng === null) return
    const requestId = ++routeRequestRef.current
    setRouting(true)
    void routeAlongRoad({ lat: startLat, lng: startLng }, { lat: endLat, lng: endLng }).then(path => {
      if (routeRequestRef.current !== requestId) return
      setRouting(false)
      setForm(current => current.startLat === startLat && current.startLng === startLng && current.endLat === endLat && current.endLng === endLng ? { ...current, path } : current)
    })
  }, [form.startLat, form.startLng, form.endLat, form.endLng])

  if (!hasAreaAccess('zentrale') && eigeneBereicheHeute.size === 0) return <Navigate to="/" replace />

  function openNew() { setEditing(null); setForm(EMPTY_BAUSTELLE_FORM); setFormError(''); setShowForm(true) }
  function openEdit(item: ZentraleBaustelle) {
    setEditing(item)
    setForm({ titel: item.titel, startAddress: '', endAddress: '', note: item.note ?? '', gueltigBis: item.gueltig_bis ?? '', startLat: item.start_lat, startLng: item.start_lng, endLat: item.end_lat, endLng: item.end_lng, path: item.path, drawMode: false })
    setFormError(''); setShowForm(true)
  }
  async function locateStart() {
    const queried = form.startAddress.trim()
    if (!queried) return
    setLocating('start'); setFormError('')
    const result = await geocodeLocation(queried)
    setLocating(null)
    if (!result) { setFormError('Startpunkt konnte nicht gefunden werden.'); return }
    setForm(current => current.startAddress.trim() === queried ? { ...current, startLat: result.lat, startLng: result.lng } : current)
  }
  async function locateEnd() {
    const queried = form.endAddress.trim()
    if (!queried) return
    setLocating('end'); setFormError('')
    const result = await geocodeLocation(queried)
    setLocating(null)
    if (!result) { setFormError('Endpunkt konnte nicht gefunden werden.'); return }
    setForm(current => current.endAddress.trim() === queried ? { ...current, endLat: result.lat, endLng: result.lng } : current)
  }
  function handleMapClick(lat: number, lng: number) {
    setForm(current => {
      if (!current.drawMode) return current
      if (current.startLat === null || current.startLng === null || (current.endLat !== null && current.endLng !== null)) return { ...current, startLat: lat, startLng: lng, endLat: null, endLng: null }
      return { ...current, endLat: lat, endLng: lng }
    })
  }
  async function save() {
    if (!profile?.id) return
    if (!form.titel.trim()) { setFormError('Bitte eine Bezeichnung eingeben.'); return }
    if (form.startLat === null || form.startLng === null || form.endLat === null || form.endLng === null) { setFormError('Bitte Start- und Endpunkt festlegen (Adresse suchen oder auf der Karte klicken).'); return }
    setSaving(true)
    const payload = { titel: form.titel.trim(), start_lat: form.startLat, start_lng: form.startLng, end_lat: form.endLat, end_lng: form.endLng, path: form.path, note: form.note.trim() || null, gueltig_bis: form.gueltigBis || null }
    const response = editing ? await supabase.from('zentrale_baustellen').update(payload).eq('id', editing.id) : await supabase.from('zentrale_baustellen').insert({ ...payload, created_by: profile.id, status: canOperate ? 'offen' : 'gemeldet' })
    setSaving(false)
    if (response.error) { setFormError('Baustelle konnte nicht gespeichert werden.'); return }
    logAudit(editing ? 'Baustelle bearbeitet' : 'Baustelle gemeldet', form.titel.trim())
    setShowForm(false); setNotice(editing ? 'Baustelle wurde aktualisiert.' : (canOperate ? 'Baustelle wurde angelegt.' : 'Baustelle wurde gemeldet und wartet auf Prüfung.')); await load()
  }
  async function confirm(item: ZentraleBaustelle) {
    if (!profile?.id) return
    const result = await supabase.from('zentrale_baustellen').update({ status: 'offen', confirmed_by: profile.id, confirmed_at: new Date().toISOString() }).eq('id', item.id)
    if (result.error) { setError('Baustelle konnte nicht bestätigt werden.'); return }
    logAudit('Baustelle bestätigt', item.titel); setNotice('Baustelle wurde bestätigt.'); await load()
  }
  async function close(item: ZentraleBaustelle) {
    const result = await supabase.from('zentrale_baustellen').update({ status: 'erledigt' }).eq('id', item.id)
    if (result.error) { setError('Baustelle konnte nicht abgeschlossen werden.'); return }
    logAudit('Baustelle abgeschlossen', item.titel); setNotice('Baustelle wurde als erledigt markiert.'); await load()
  }
  async function remove(item: ZentraleBaustelle) {
    if (!window.confirm(`Baustelle „${item.titel}“ endgültig löschen?`)) return
    const result = await supabase.from('zentrale_baustellen').delete().eq('id', item.id)
    if (result.error) { setError('Baustelle konnte nicht gelöscht werden.'); return }
    logAudit('Baustelle endgültig gelöscht', item.titel); setNotice('Baustelle wurde gelöscht.'); await load()
  }

  return <div>
    <BackLink to="/stammdaten" label="Zu Stammdaten" className="mb-4" />
    <div className="flex items-center justify-between gap-3 mb-5">
      <div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Stammdaten &amp; Nachschlagewerke</p><h1 className="text-2xl font-bold text-gray-900 mt-1">Baustellen</h1><p className="text-sm text-gray-500 mt-1">Für die Streife: Streckenkenntnis, falls ein Einsatzort über eine gesperrte Straße nicht erreichbar ist.</p></div>
      {canOperate ? <button type="button" onClick={openNew} className="inline-flex items-center gap-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-medium px-3 py-2 rounded-lg flex-shrink-0">+ Baustelle melden</button> : null}
    </div>
    {error ? <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div> : null}
    {notice ? <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">{notice}</div> : null}
    {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800" /></div> : (
      items.length > 0 ? <BaustellenList items={items} canOperate={canOperate} onConfirm={confirm} onEdit={openEdit} onClose={close} onDelete={remove} /> : <Empty text="Keine Baustellen gemeldet." />
    )}
    {showForm ? <BaustelleModal form={form} setForm={setForm} editing={editing} canOperate={canOperate} saving={saving} error={formError} locating={locating} routing={routing} locateStart={locateStart} locateEnd={locateEnd} onMapClick={handleMapClick} close={() => setShowForm(false)} save={save} /> : null}
  </div>
}
