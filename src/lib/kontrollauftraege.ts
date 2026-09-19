import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { logAudit } from './audit'
import { supabase } from './supabase'
import { EMPTY_AUFTRAG, type AuftragFormState } from './aussendienstShared'
import { geocodeLocation } from './geocode'
import { parseKilometerLocation } from './roadKilometer'
import { locationParts } from './zentraleShared'
import type { ZentraleEntry } from './types'

/**
 * Eigenständiger Lade-/Bearbeitungszustand für Kontrollaufträge
 * (zentrale_entries mit category='kontrollauftrag'), unabhängig von
 * AussendienstShell.tsx - damit dieselbe Seite (KontrollauftraegePage.tsx)
 * sowohl unter /aussendienst/kontrollauftraege als auch unter
 * /zentrale/kontrollauftraege eingehängt werden kann, ohne dass der
 * Genehmiger dafür die Zentrale-Navigation verlassen muss. Zeigt bewusst
 * alle Kontrollaufträge (keine Filterung nach eigener Tagesfunktion wie im
 * Außendienst-Dashboard) - hier steht die Verwaltung im Vordergrund, nicht
 * die Sicht einer einzelnen Streife.
 */
export function useKontrollauftraege() {
  const { profile, isGenehmiger } = useAuth()
  const [items, setItems] = useState<ZentraleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ZentraleEntry | null>(null)
  const [auftrag, setAuftrag] = useState<AuftragFormState>(EMPTY_AUFTRAG)
  const [formError, setFormError] = useState('')
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await supabase.from('zentrale_entries').select('*').eq('category', 'kontrollauftrag').order('status').order('updated_at', { ascending: false })
    if (result.error) setError('Die Kontrollaufträge konnten nicht geladen werden.')
    else setError('')
    setItems((result.data ?? []) as ZentraleEntry[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  function openNew() { setEditing(null); setAuftrag(EMPTY_AUFTRAG); setFormError(''); setLocateError(''); setShowForm(true) }
  function openEdit(item: ZentraleEntry) {
    const kilometerLocation = parseKilometerLocation(item.location)
    const { street, houseNumber } = kilometerLocation
      ? { street: kilometerLocation.roadName, houseNumber: '' }
      : locationParts(item.location)
    setEditing(item)
    setAuftrag({
      title: item.title, description: item.description ?? '',
      locationMode: kilometerLocation ? 'kilometer' : 'address',
      street, houseNumber,
      houseNumberUnknown: Boolean(!kilometerLocation && street && !houseNumber),
      roadQuery: kilometerLocation ? `${kilometerLocation.roadName} (${kilometerLocation.roadNumber})` : '',
      roadNumber: kilometerLocation?.roadNumber ?? '',
      roadName: kilometerLocation?.roadName ?? '',
      kilometer: kilometerLocation?.kilometer ?? '',
      kilometerFrom: null, kilometerTo: null,
      location: item.location ?? '', lat: item.location_lat, lng: item.location_lng, coordsPrecise: item.location_lat !== null,
      zeitfenster: item.zeitfenster ?? '', validFrom: item.valid_from?.slice(0, 10) ?? '', validUntil: item.valid_until?.slice(0, 10) ?? '',
      targetFunction: item.target_function ?? 'beide',
    })
    setFormError(''); setLocateError(''); setShowForm(true)
  }
  async function locate(queryOverride?: string) {
    const queried = (queryOverride ?? auftrag.location).trim()
    if (!queried) return
    setLocating(true); setLocateError('')
    const result = await geocodeLocation(queried)
    setLocating(false)
    if (!result) { setLocateError('Ort konnte nicht gefunden werden.'); return }
    setAuftrag(current => current.location.trim() === queried ? { ...current, lat: result.lat, lng: result.lng, coordsPrecise: true } : current)
  }
  async function save() {
    if (!auftrag.title.trim()) { setFormError('Bitte eine Bezeichnung eingeben.'); return }
    if (auftrag.locationMode === 'kilometer' && (!auftrag.roadNumber || !auftrag.kilometer || auftrag.lat === null || auftrag.lng === null || !auftrag.coordsPrecise)) {
      setFormError('Bitte Landesstraße und Kilometer auswählen und den amtlichen Kartenpunkt ermitteln.')
      return
    }
    setSaving(true)
    const payload = { category: 'kontrollauftrag' as const, title: auftrag.title.trim(), description: auftrag.description.trim() || null, location: auftrag.location.trim() || null, location_lat: auftrag.lat, location_lng: auftrag.lng, zeitfenster: auftrag.zeitfenster.trim() || null, valid_from: auftrag.validFrom || null, valid_until: auftrag.validUntil || null, target_function: auftrag.targetFunction }
    const response = editing ? await supabase.from('zentrale_entries').update(payload).eq('id', editing.id) : await supabase.from('zentrale_entries').insert({ ...payload, created_by: profile?.id ?? null })
    setSaving(false)
    if (response.error) { setFormError('Kontrollauftrag konnte nicht gespeichert werden.'); return }
    logAudit(editing ? 'Kontrollauftrag bearbeitet' : 'Kontrollauftrag angelegt', auftrag.title.trim()); setShowForm(false); await load()
  }
  async function remove() {
    if (!editing || !window.confirm(`Kontrollauftrag „${editing.title}“ endgültig löschen?`)) return
    const result = await supabase.from('zentrale_entries').delete().eq('id', editing.id)
    if (result.error) { setFormError('Kontrollauftrag konnte nicht gelöscht werden.'); return }
    logAudit('Kontrollauftrag endgültig gelöscht', editing.title); setShowForm(false); await load()
  }
  async function toggleErledigt(item: ZentraleEntry) {
    const nowErledigt = item.status !== 'erledigt'
    const result = await supabase.from('zentrale_entries').update({ status: nowErledigt ? 'erledigt' : 'offen', erledigt_at: nowErledigt ? new Date().toISOString() : null }).eq('id', item.id)
    if (result.error) { setError('Der Status konnte nicht geändert werden.'); return }
    await load()
  }

  return { items, loading, error, isGenehmiger, saving, showForm, editing, auftrag, setAuftrag, formError, locating, locateError, locate, close: () => setShowForm(false), openNew, openEdit, save, remove, toggleErledigt }
}
